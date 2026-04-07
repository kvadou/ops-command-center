// config/deps.js
require("dotenv").config();

const axios = require("axios");
const { Pool } = require("pg");
const Bottleneck = require("bottleneck");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const { logger } = require('../utils/logger');

// Only DATABASE_URL and JWT_SECRET are truly required to boot.
// All external service keys are optional — services stub themselves when keys are missing.
const REQUIRED_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    logger.error(` Missing required env var: ${k}`);
    process.exit(1);
  }
}

// Warn (but don't crash) for optional service keys
const OPTIONAL_ENV = [
  "TUTORCRUNCHER_API_TOKEN",
  "STRIPE_SECRET_KEY",
  "TUTORCRUNCHER_API_BASE",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
for (const k of OPTIONAL_ENV) {
  if (!process.env[k]) {
    logger.warn(`Optional env var not set: ${k} — related features will use stub data`);
  }
}

// Pull/normalize env in one place
const {
  DATABASE_URL,
  JWT_SECRET,
  TUTORCRUNCHER_API_TOKEN,
  TUTORCRUNCHER_API_BASE = "https://account.acmeops.com/api/",
  KLAVIYO_API_KEY,
  STRIPE_SECRET_KEY,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  GRAVITY_FORMS_API_BASE_URL = "https://join.chessat3.com/wp-json/gf/v2/",
  LABEL_ID = "276463",
} = process.env;

// Sanitize TC token to avoid invalid header characters (newlines/quotes)
const CLEAN_TC_TOKEN = String(TUTORCRUNCHER_API_TOKEN || "stub-token")
  .replace(/[\r\n]+/g, "")
  .replace(/^['"]|['"]$/g, "")
  .trim();

function buildDeps() {
  // Pool - using optimized connection pool settings
  const isProduction = process.env.NODE_ENV === "production";
  // For local development with localhost, never use SSL
  const isLocalDb = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
  // Detect Heroku/AWS databases that require SSL (even when running locally)
  // Heroku usernames are 14+ random lowercase chars, passwords contain alphanumeric + special chars
  const isHerokuOrAws = DATABASE_URL.includes('.amazonaws.com') ||
                        DATABASE_URL.includes('.compute-1.') ||
                        DATABASE_URL.includes('heroku') ||
                        /postgres:\/\/[a-z]{10,}:[^@]+@/.test(DATABASE_URL); // Heroku username pattern (10+ lowercase letters)
  // Enable SSL for production environments OR if connecting to Heroku/AWS databases
  const needsSSL = isProduction || isHerokuOrAws;
  logger.info(`🔒 SSL detection: isLocal=${isLocalDb}, isHerokuOrAws=${isHerokuOrAws}, needsSSL=${needsSSL}`);
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: (needsSSL && !isLocalDb) ? { rejectUnauthorized: false } : false,
    
    // See database-connections.js for full connection budget math
    // Per-process: deps.js: 4, database-connections.js: 5 → 9/process (production)
    // Per-process: deps.js: 3, database-connections.js: 4 → 7/process (staging)
    max: isProduction ? 4 : 3,
    min: isProduction ? 1 : 1,
    idleTimeoutMillis: isProduction ? 20000 : 30000,
    connectionTimeoutMillis: isProduction ? 3000 : 5000,
    acquireTimeoutMillis: isProduction ? 5000 : 10000,
    allowExitOnIdle: false,
    statement_timeout: isProduction ? 30000 : 60000,
    query_timeout: isProduction ? 25000 : 55000,
    application_name: `acme-ops-${process.env.NODE_ENV || 'development'}`,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // TutorCruncher axios + limiter
  const tutorCruncherAPI = axios.create({
    baseURL: TUTORCRUNCHER_API_BASE,
    timeout: 60_000,  // allow slower TutorCruncher responses during heavy loads
    // TutorCruncher expects: Authorization: token <TOKEN>
    headers: { Authorization: `token ${CLEAN_TC_TOKEN}` },
  });
  const limiter = new Bottleneck({
    reservoir: 3600,
    reservoirRefreshAmount: 3600,
    reservoirRefreshInterval: 60 * 60 * 1000,
    maxConcurrent: 1,
    minTime: 1000,
  });
  const limitedGet = limiter.wrap(tutorCruncherAPI.get.bind(tutorCruncherAPI));
  const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" })
    : null;
  // Mailer
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER || "REPLACE_ME@smtp-brevo.com",
      pass: process.env.BREVO_SMTP_PASS || process.env.BREVO_API_KEY,
    },
    tls: { rejectUnauthorized: false },
  });

  // Cloudinary (only configure if credentials available)
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    });
  } else {
    logger.warn('Cloudinary not configured — image uploads will be disabled');
  }

  // Models (sequelize, etc.)
  const db = require("../models");
  const { sequelize, Service, Location, ColourGroup, Appointment } = db;

  // Common helpers
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const rateLimitRetry = async (
    fn,
    retries = 5,
    baseDelayMs = 20_000
  ) => {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      const isTimeout = err?.code === "ECONNABORTED";
      const isRetryableStatus =
        status === 429 || status === 408 || (status >= 500 && status < 600);

      if (isTimeout || isRetryableStatus) {
        // honor Retry-After if present for 429
        const headerMs = err?.response?.headers?.["retry-after"]
          ? parseInt(err.response.headers["retry-after"], 10) * 1000
          : null;
        const attempt = 6 - Math.max(0, retries);
        const backoff = headerMs ?? Math.min(120_000, baseDelayMs * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 2_000);
        const waitMs = backoff + jitter;
        logger.info(`[retry] ${isTimeout ? "timeout" : status} → waiting ${Math.ceil(
            waitMs / 1000
          )}s (retries left: ${retries})`);
        await delay(waitMs);
        if (retries > 0) return rateLimitRetry(fn, retries - 1, baseDelayMs);
      }
      throw err;
    }
  };

  const puppeteer = require("puppeteer-core");

  // Fetch shim
  const fetchImpl = globalThis.fetch || require("node-fetch");

  return {
  // env
  JWT_SECRET,
  KLAVIYO_API_KEY,
  LABEL_ID,
  GRAVITY_FORMS_API_BASE_URL,
  TUTORCRUNCHER_API_BASE,   // <-- add this

  // libs/deps
  pool,
  tutorCruncherAPI,
  limitedGet,
  axios,
  transporter,
  cloudinary,
  jwt,
  fetch: fetchImpl,
  stripe,

  // models
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,

  // utilities
  delay,
  rateLimitRetry,
  puppeteer,
};
}

module.exports = { buildDeps };
