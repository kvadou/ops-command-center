require("dotenv").config();

// Initialize Sentry FIRST for error tracking (must be before other imports)
const { initSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } = require('./utils/sentry-backend');

// Import structured logging
const { logger, createRequestLogger, logError } = require('./utils/logger');

// Add process-level safety nets to prevent dyno crashes
process.on('unhandledRejection', (err) => {
  logError(err, { type: 'unhandled_rejection' });
});

process.on('uncaughtException', (err) => {
  logError(err, { type: 'uncaught_exception' });
  // Consider graceful shutdown if needed, but avoid immediate process.exit in Heroku
});

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");

const buildServerFns = require("./services/server-fns.js");
const { buildDeps } = require("./config/deps");
const { getPool } = require("./database-connections");
const { initRedis } = require("./utils/cache");
const { apiLimiter, authLimiter, analyticsLimiter } = require("./middleware/rate-limit");
const helmet = require("helmet");

const app = express();

// Initialize Sentry with Express app
initSentry(app);

// Sentry request handler must be the first middleware
app.use(sentryRequestHandler());
// Sentry tracing middleware for performance monitoring
app.use(sentryTracingHandler());

const cookieParser = require('cookie-parser');
app.use(cookieParser());

const deps = buildDeps();

const {

  pool,
  tutorCruncherAPI,
  limitedGet,
  axios,
  transporter,
  cloudinary,
  jwt,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  TUTORCRUNCHER_API_BASE,
  LABEL_ID,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  puppeteer,
  stripe,
} = deps;

global.pool = pool;
global.transporter = transporter;
global.tutorCruncherAPI = tutorCruncherAPI;
global.puppeteer = puppeteer;

// IMPORTANT: Skip JSON parsing for Stripe webhook routes
// Stripe webhooks require the raw body (string/Buffer) for signature verification
app.use((req, res, next) => {
  // Skip JSON parsing for Stripe webhook routes
  if (req.path === '/webhook/stripe' || req.path === '/webhooks/stripe' || req.path === '/stripe') {
    return next();
  }
  // Apply JSON parsing for all other routes
  express.json()(req, res, next);
});
app.use((req, res, next) => {
  // Skip bodyParser.json for Stripe webhook routes
  if (req.path === '/webhook/stripe' || req.path === '/webhooks/stripe' || req.path === '/stripe') {
    return next();
  }
  bodyParser.json({ limit: "10mb" })(req, res, next);
});
app.use((req, res, next) => {
  // Skip urlencoded parsing for Stripe webhook routes
  if (req.path === '/webhook/stripe' || req.path === '/webhooks/stripe' || req.path === '/stripe') {
    return next();
  }
  bodyParser.urlencoded({ limit: "10mb", extended: true })(req, res, next);
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});
// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.googletagmanager.com", "https://connect.facebook.net"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://connect.facebook.net", "https://googleads.g.doubleclick.net", "https://static.cloudflareinsights.com", "https://editor.unlayer.com", "https://js.stripe.com"],
      workerSrc: ["'self'", "blob:"], // Allow PDF.js worker from local file and blob URLs
      imgSrc: ["'self'", "data:", "https:", "https://www.facebook.com", "https://www.google.com", "https://www.google-analytics.com"],
      connectSrc: ["'self'", "https://api.heroku.com", "https://api.tutorcruncher.com", "https://www.google-analytics.com", "https://www.googletagmanager.com", "https://www.google.com", "https://googleads.g.doubleclick.net", "https://editor.unlayer.com", "https://www.facebook.com", "https://connect.facebook.net", "https://ipinfo.io", "https://api.stripe.com", "https://*.ingest.us.sentry.io", "https://*.sentry.io", "https://res.cloudinary.com", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      frameSrc: ["'self'", "https://www.googletagmanager.com", "https://editor.unlayer.com", "https://js.stripe.com", "https://hooks.stripe.com", "https://checkout.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for React dev
  permissionsPolicy: {
    autoplay: ["'self'"],
    "encrypted-media": ["'self'"],
    accelerometer: ["'self'"],
    gyroscope: ["'self'"],
    "clipboard-write": ["'self'"],
  },
}));

// Use structured request logging middleware
app.use(createRequestLogger);

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Apply stricter rate limiting to auth endpoints (brute force protection)
app.use('/api/login', authLimiter);
app.use('/api/forgot-password', authLimiter);
app.use('/api/reset-password', authLimiter);

// CORS
const whitelist = [
  "http://localhost:3000",
  "https://acme-ops-main.herokuapp.com",
  "https://acmeops-westside-cbc977fb06de.herokuapp.com",
  "https://analytics.chessat3.com",
  "http://localhost:5000",
  "https://story-time-staging-784b74d757f2.herokuapp.com",
  "https://join.acmeops.com",
];
app.use(
  cors({
    origin: (origin, cb) => cb(null, whitelist.includes(origin)),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const serverFns = buildServerFns({
  pool,
  tutorCruncherAPI,
  axios,
  fetch: globalThis.fetch || require("node-fetch"),
  transporter,
  KLAVIYO_API_KEY,
  TUTORCRUNCHER_API_TOKEN: process.env.TUTORCRUNCHER_API_TOKEN,
  LABEL_ID,
  cloudinary,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  limitedGet,
  jwt,
  JWT_SECRET: process.env.JWT_SECRET,
  GRAVITY_FORMS_API_BASE_URL,
  puppeteer,
  delay,
  rateLimitRetry,
  stripe,
});

Object.assign(global, serverFns);


Object.assign(global, {
  pool: deps.pool,
  axios: deps.axios,
  cloudinary: deps.cloudinary,
  tutorCruncherAPI: deps.tutorCruncherAPI,
  limitedGet: deps.limitedGet,
  jwt: deps.jwt,
  stripe: deps.stripe,
  transporter: deps.transporter,
  db: deps.db,
  sequelize: deps.sequelize,
  Service: deps.Service,
  Location: deps.Location,
  ColourGroup: deps.ColourGroup,
  Appointment: deps.Appointment,
  delay: deps.delay,
  rateLimitRetry: deps.rateLimitRetry,
  auth: serverFns.auth,
  TUTORCRUNCHER_API_BASE: deps.TUTORCRUNCHER_API_BASE,   
  TUTORCRUNCHER_API_TOKEN: process.env.TUTORCRUNCHER_API_TOKEN, 
  LABEL_ID: deps.LABEL_ID,

  GRAVITY_FORMS_API_BASE_URL: deps.GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY: deps.KLAVIYO_API_KEY,
  LABEL_ID: deps.LABEL_ID,

  LIST_A_ID: process.env.LIST_A_ID,
  LIST_B_ID: process.env.LIST_B_ID,
});

app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// Error handling middleware
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');

// Custom error handler for payload too large
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    logger.warn({
      event: 'payload_too_large',
      requestId: req.requestId,
      contentLength: req.headers["content-length"],
      url: req.url,
      method: req.method
    }, "Payload too large");
    return res
      .status(413)
      .json({ error: "Payload too large. Please reduce the request size." });
  }
  next(err);
});

// Error handler will be registered AFTER all routes (see end of file)


// ─────────────────────────────────────────────────────────────────────────────
// OPEN ARRAY — Routes that bypass JWT authentication
// ─────────────────────────────────────────────────────────────────────────────
// ONLY the following categories belong here:
//   1. Auth/login routes (login, register, password reset, token verification)
//   2. Webhook receivers (Stripe, TutorCruncher, Brevo — called by external services)
//   3. Public booking form endpoints (submissions, checkout, payment flows)
//   4. Public-facing content (public files, company name, health checks, QR redirects)
//   5. Franchise Academy/Knowledge Hub (franchisee-accessible content)
//
// NEVER add to this list:
//   - Financial data (analytics, forecasts, invoices, income, payroll, billing)
//   - Admin tools (devops, master reports, CRM analytics)
//   - Entity detail routes (client/tutor/student PII)
//   - Any endpoint that returns sensitive business data
//
// When in doubt, do NOT add it here — let it require auth by default.
// ─────────────────────────────────────────────────────────────────────────────
const OPEN = [
  // ── Auth / Login ──────────────────────────────────────────────────────────
  { method: 'POST',  re: /^\/api\/login$/ },
  { method: 'POST',  re: /^\/api\/demo-login$/ },
  { method: 'POST',  re: /^\/api\/forgot-password$/ },
  { method: 'POST',  re: /^\/api\/reset-password$/ },
  { method: 'GET',   re: /^\/api\/verify-reset-token$/ },
  // Google OAuth — must be public (browser redirects, no auth header)
  { method: 'GET',   re: /^\/auth\/google(\/callback)?$/ },
  { method: 'POST',  re: /^\/auth\/google\/verify-token$/ },
  { method: 'POST',  re: /^\/api\/google\/verify-token$/ },

  // ── Webhooks (called by external services) ────────────────────────────────
  { method: 'POST',  re: /^\/webhooks?(\/.*)?$/ },
  { method: 'POST',  re: /^\/api\/brevo-webhook(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/brevo-webhook(\/.*)?$/ },

  // ── Public Booking Form Endpoints ─────────────────────────────────────────
  { method: 'POST',  re: /^\/api\/submissions$/ },
  { method: 'POST',  re: /^\/api\/submissions\/track-view$/ },
  { method: 'POST',  re: /^\/api\/submissions\/track-event$/ }, // Public endpoint for booking forms to track events
  { method: 'POST',  re: /^\/api\/submissions\/[^/]+\/track-error$/ }, // Public endpoint for booking forms to track errors
  { method: 'PATCH', re: /^\/api\/submissions\/[^/]+\/payment-status$/ },
  { method: 'PATCH', re: /^\/api\/payments\/submissions\/[^/]+\/payment-status$/ },
  { method: 'GET',   re: /^\/api\/submissions\/[^/]+$/ },
  { method: 'GET',   re: /^\/api\/submissions$/ },
  { method: 'GET',   re: /^\/api\/booking-types$/ },
  { method: 'GET',   re: /^\/api\/booking-types\/service-status\/\d+$/ },
  { method: 'GET',   re: /^\/api\/services$/ }, // Public endpoint for booking forms to fetch service data (including staff discount config)
  { method: 'GET',   re: /^\/api\/policies(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/labels(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/colour-groups(\/.*)?$/ }, // Public endpoint for booking forms to fetch colour groups
  { method: 'GET',   re: /^\/api\/public-services(\/.*)?$/ },
  { method: 'POST',  re: /^\/api\/booking-types\/sync-from-service$/ }, // Temporary: sync service to booking types
  // Job templates needed by booking forms
  { method: 'GET',   re: /^\/api\/job-templates$/ },
  { method: 'GET',   re: /^\/api\/job-templates\/categories$/ },
  { method: 'GET',   re: /^\/api\/job-templates\/premade$/ },
  { method: 'GET',   re: /^\/api\/job-templates\/field-types$/ },
  // TutorCruncher data needed by booking forms (labels and colours only)
  { method: 'GET',   re: /^\/api\/tutorcruncher-data\/labels$/ },
  { method: 'GET',   re: /^\/api\/tutorcruncher-data\/colours$/ },

  // ── Payment / Checkout Flows (used by unauthenticated checkout pages) ─────
  { method: 'POST',  re: /^\/api\/create-checkout-session$/ },
  { method: 'GET',   re: /^\/api\/term-billing\/config\/.*$/ }, // Public endpoint for booking forms to fetch term billing config
  { method: 'POST',  re: /^\/api\/term-billing\/preview$/ }, // Public endpoint for booking forms to preview proration
  { method: 'GET',   re: /^\/api\/subscriptions\/session\/.*$/ }, // Public endpoint for success page to fetch subscription details
  { method: 'GET',   re: /^\/api\/subscriptions\/checkout-details\/.*$/ }, // Public endpoint for checkout page to fetch payment details
  { method: 'POST',  re: /^\/api\/subscriptions\/create$/ }, // Public endpoint for booking forms to create subscriptions
  { method: 'POST',  re: /^\/api\/subscriptions\/create-term-payment$/ }, // Public endpoint for booking forms to create term payments
  { method: 'POST',  re: /^\/api\/subscriptions\/complete-setup$/ }, // Public endpoint for checkout page to complete subscription setup
  { method: 'POST',  re: /^\/api\/subscriptions\/complete-setup\/.*$/ }, // Public endpoint for success page (legacy with sessionId param)
  { method: 'POST',  re: /^\/api\/subscriptions\/complete-term-payment\/.*$/ }, // Public endpoint for success page to complete term payment processing
  { method: 'GET',   re: /^\/api\/config\/stripe-publishable-key$/ }, // Public endpoint - returns Stripe publishable key

  // ── Meta / Tracking ───────────────────────────────────────────────────────
  { method: 'POST',  re: /^\/api\/meta-tracking\/.*$/ },
  { method: 'GET',   re: /^\/api\/tracking\/.*$/ },

  // ── Public Content / Utilities ────────────────────────────────────────────
  { method: 'GET',   re: /^\/api\/health(\/.*)?$/ }, // Health check endpoints - no auth required
  { method: 'GET',   re: /^\/api\/company-name$/ }, // Public endpoint - returns company name based on subdomain
  { method: 'GET',   re: /^\/sw\.js$/ },
  { method: 'GET',   re: /^\/api\/mui-license$/ },
  { method: 'GET',   re: /^\/api\/tutorcruncher\/.*$/ },
  { method: 'GET',   re: /^\/api\/public-files(\/.*)?$/ }, // Public files - GET only, POST/DELETE require auth
  { method: 'GET',   re: /^\/api\/client-reports\/unsubscribe\/[A-Za-z0-9_-]+$/ }, // Lesson report unsubscribe (token-based, public)
  { method: 'POST',  re: /^\/api\/client-reports\/unsubscribe\/[A-Za-z0-9_-]+$/ }, // Lesson report unsubscribe confirm
  { method: 'GET',   re: /^\/qr\/[A-Za-z0-9]+$/ }, // QR code redirect endpoint (e.g., /qr/abc12345)
  // Sentry test endpoints (public for testing)
  { method: 'GET',   re: /^\/api\/sentry-test\/.*$/ },

  // ── School Student Import Forms (public form endpoints) ───────────────────
  { method: 'GET',   re: /^\/api\/school-student-import\/form\/[^/]+\/config$/ },
  { method: 'POST',  re: /^\/api\/school-student-import\/form\/[^/]+$/ },

  // ── Knowledge Hub (franchisee-accessible published content) ───────────────
  { method: 'GET',   re: /^\/api\/knowledge\/collections(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/knowledge\/articles(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/knowledge\/sops$/ },
  { method: 'GET',   re: /^\/api\/knowledge\/comments$/ },
  { method: 'GET',   re: /^\/api\/knowledge\/search$/ },
  { method: 'GET',   re: /^\/api\/knowledge\/attachments\/.*\/download$/ },
  { method: 'PUT',   re: /^\/api\/knowledge\/checklist-items\/\d+\/progress$/ }, // Franchisees update own progress

  // ── Public tutor profiles (no auth — public-facing pages) ───────────────
  { method: 'GET',   re: /^\/api\/tutor-profiles(\/.*)?$/ },

  // ── Internal tutor profile sync (has own Bearer auth in route handler) ─
  { method: 'POST',  re: /^\/api\/internal\/tutor-profile-sync$/ },

  // ── STC Capture videos (public watch links, view tracking, comments) ─────
  { method: 'GET',   re: /^\/api\/videos\/watch\/[a-f0-9]+$/ },
  { method: 'POST',  re: /^\/api\/videos\/[0-9a-f-]+\/view$/ },
  { method: 'GET',   re: /^\/api\/videos\/[0-9a-f-]+\/comments$/ },

  // ── Franchise Academy (franchisee-accessible content + progress tracking) ─
  { method: 'GET',   re: /^\/api\/academy\/programs(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/academy\/phases(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/academy\/modules(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/academy\/resources(\/.*)?$/ },
  { method: 'GET',   re: /^\/api\/academy\/progress$/ },
  { method: 'GET',   re: /^\/api\/academy\/badges$/ },
  { method: 'GET',   re: /^\/api\/academy\/points$/ },
  { method: 'GET',   re: /^\/api\/academy\/coach\/conversations(\/.*)?$/ },
  { method: 'POST',  re: /^\/api\/academy\/modules\/\d+\/start$/ },
  { method: 'POST',  re: /^\/api\/academy\/modules\/\d+\/complete$/ },
  { method: 'POST',  re: /^\/api\/academy\/checklist\/\d+\/toggle$/ },
  { method: 'POST',  re: /^\/api\/academy\/video\/\d+\/progress$/ },
  { method: 'POST',  re: /^\/api\/academy\/activity$/ },
  { method: 'POST',  re: /^\/api\/academy\/coach\/conversations$/ },
  { method: 'POST',  re: /^\/api\/academy\/coach\/chat$/ },
  { method: 'PUT',   re: /^\/api\/academy\/progress$/ },

  // ─────────────────────────────────────────────────────────────────────────
  // REMOVED — These routes now require authentication (moved March 2026):
  //   /api/analytics, /api/analytics/trends
  //   /api/income-breakdown/*
  //   /api/forecast/current, /api/forecast/actuals, /api/forecast/drilldown
  //   /api/master-report-details
  //   /api/invoices/*, /api/invoices/summary, /api/invoices/client-labels
  //   /api/e4/*
  //   /api/mindbody/*
  //   /api/historical-analytics/*
  //   /api/franchisee-analytics/*
  //   /api/adhoc-charges/*
  //   /api/broadcasts/*
  //   /api/email-analytics/*
  //   /api/outbound-emails/*
  //   /api/lesson-reminders/*
  //   /api/devops/* (GET, POST, PATCH)
  //   /api/schools/dashboard
  //   /api/crm/analytics/test, /api/crm/analytics/client-metrics
  //   /api/client-overview-test
  //   /api/submissions/analytics/* (metrics, details, enterprise, enterprise-trends)
  //   /api/tutor-hour-buckets, /api/tutor-lessons, /tutor-lessons
  //   /api/consistency-bonus/*
  // ─────────────────────────────────────────────────────────────────────────
];
function isOpen(req) {
  const m = req.method.toUpperCase();
  const p = req.path;
  const matched = OPEN.some(({ method, re }) => {
    return method === m && re.test(p);
  });
  return matched;
}

app.use((req, res, next) => {
  const p = req.path;
  const protect = p.startsWith('/api') || p.startsWith('/gravity-data') || p.startsWith('/webhook');
  if (protect && !isOpen(req)) {
    return serverFns.auth(req, res, next);
  }
  next();
});


// Test endpoints removed - security risk in production

// Client overview route (extracted from route-handlers.js)
const api_client_overviewRouter = require('./routes/api-client-overview.js');
app.use('/api/client-overview', api_client_overviewRouter);
app.use('/api/client-overview-test', api_client_overviewRouter); // Keep test alias for backward compatibility

// Brevo webhook route is now handled by routes/api-brevo-webhook.js
// (Old direct handler removed to use the improved route handler)

// Location-specific database middleware
const { locationDbMiddleware } = require("./middleware/location-db");
app.use(locationDbMiddleware);

// Debug middleware to track requests after location middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/crm')) {
    logger.info(`📍 After location middleware: ${req.method} ${req.path}`);
    logger.info(`📍 Request will be routed to: /api/crm`);
    logger.info(`📍 Router should see path as: ${req.path.replace('/api/crm', '') || '/'}`);
  }
  next();
});

// Health check routes - no auth required
const api_healthRouter = require("./routes/api-health.js");
app.use("/api/health", api_healthRouter);

// Job Builder Routes
const api_job_templatesRouter = require("./routes/api-job-templates.js");
app.use("/api/job-templates", api_job_templatesRouter);
const api_job_builderRouter = require("./routes/api-job-builder.js");
app.use("/api/job-builder", api_job_builderRouter);
const api_tutorcruncher_dataRouter = require("./routes/api-tutorcruncher-data.js");
app.use("/api/tutorcruncher-data", api_tutorcruncher_dataRouter);

// Mount CRM router EARLY - before other /api routers to avoid route conflicts
const apiCrmRouter = require("./routes/api-crm.js");
app.use("/api/crm", apiCrmRouter);

const apiChurnRouter = require("./routes/api-churn.js");
app.use("/api/churn", apiChurnRouter);

// Knowledge Hub Routes
const api_knowledge_hubRouter = require("./routes/api-knowledge-hub.js");
app.use("/api/knowledge", api_knowledge_hubRouter);

// Video Recordings Routes (STC Capture)
const api_videosRouter = require("./routes/api-videos.js");
app.use("/api/videos", api_videosRouter);

// Franchise Academy Routes
const api_academyRouter = require("./routes/api-academy.js");
app.use("/api/academy", api_academyRouter);

// Marketing Command Center Routes
const apiMarketingCommandRouter = require("./routes/api-marketing-command-center.js");
app.use("/api/marketing-command-center", apiMarketingCommandRouter);

const apiPaymentsRouter = require("./routes/api-payments");
app.use("/api", apiPaymentsRouter);

const api_authRouter = require("./routes/api-auth.js");
app.use("/api", api_authRouter);
// Mount Google OAuth at /auth so redirect URIs match Google Cloud Console registration
app.use("/auth", api_authRouter);

const gravity_dataRouter = require("./routes/gravity-data.js");
app.use("/gravity-data", gravity_dataRouter);
const api_usersRouter = require("./routes/resources/users-routes.js");
app.use("/api/users", api_usersRouter);
const api_admin_toolsRouter = require("./routes/api-admin-tools.js");
app.use("/api/admin", api_admin_toolsRouter);
const api_divisionsRouter = require("./routes/resources/divisions-routes.js");
app.use("/api/divisions", api_divisionsRouter);
const api_school_revenuesRouter = require("./routes/api-school-revenues.js");
app.use("/api/school-revenues", api_school_revenuesRouter);
const api_schools_dashboardRouter = require("./routes/api-schools-dashboard.js");
app.use("/api/schools", api_schools_dashboardRouter);
const api_school_email_campaignsRouter = require("./routes/api-school-email-campaigns.js");
app.use("/api/school-email-campaigns", api_school_email_campaignsRouter);
const api_school_invoice_fulfillmentRouter = require("./routes/api-school-invoice-fulfillment.js");
app.use("/api/school-invoice-fulfillment", api_school_invoice_fulfillmentRouter);
const apiFailedPaymentsRouter = require("./routes/api-failed-payments.js");
app.use("/api/failed-payments", apiFailedPaymentsRouter);
const apiCompanyMetricsRouter = require("./routes/api-company-metrics.js");
app.use("/api/company-metrics", apiCompanyMetricsRouter);
const apiScorecardRouter = require("./routes/api-scorecard.js");
app.use("/api/scorecard", apiScorecardRouter);
const apiSearchRouter = require("./routes/api-search.js");
app.use("/api/search", apiSearchRouter);
const apiReferralsRouter = require("./routes/api-referrals.js");
app.use("/api/referrals", apiReferralsRouter);
const api_school_activityRouter = require("./routes/api-school-activity.js");
app.use("/api/school-activity", api_school_activityRouter);
const api_school_student_importRouter = require("./routes/api-school-student-import.js");
app.use("/api/school-student-import", api_school_student_importRouter);
const api_school_term_trackingRouter = require("./routes/api-school-term-tracking.js");
app.use("/api/school-term-tracking", api_school_term_trackingRouter);
const api_campaign_renamesRouter = require("./routes/api-campaign-renames.js");
app.use("/api/campaign-renames", api_campaign_renamesRouter);
const fetch_reviewsRouter = require("./routes/fetch-reviews.js");
app.use("/fetch-reviews", fetch_reviewsRouter);
// Register webhook router AFTER conditional JSON parsing middleware
// Stripe routes will receive raw body, TutorCruncher routes will receive parsed JSON
const webhookRouter = require("./routes/webhook.js");
app.use("/webhook", webhookRouter);
app.use("/webhooks", webhookRouter); // Handle both singular and plural
const api_reviewsRouter = require("./routes/api-reviews.js");
app.use("/api/reviews", api_reviewsRouter);
const send_emailRouter = require("./routes/send-email.js");
app.use("/send-email", send_emailRouter);
const api_email_templatesRouter = require("./routes/resources/email-templates-routes.js");
app.use("/api/email-templates", api_email_templatesRouter);
const api_contractorsRouter = require("./routes/api-contractors.js");
app.use("/api/contractors", api_contractorsRouter);
const apiFailedCheckoutsRouter = require("./routes/api-failed-checkouts.js");
app.use("/api/failed-checkouts", apiFailedCheckoutsRouter);
const api_tutor_labelsRouter = require("./routes/api-tutor-labels.js");
app.use("/api/tutor-labels", api_tutor_labelsRouter);
const fetch_group_sessionsRouter = require("./routes/fetch-group-sessions.js");
app.use("/fetch-group-sessions", fetch_group_sessionsRouter);
const api_excluded_tutorsRouter = require("./routes/api-excluded-tutors.js");
app.use("/api/excluded-tutors", api_excluded_tutorsRouter);
const api_exclude_tutorRouter = require("./routes/api-exclude-tutor.js");
app.use("/api/exclude-tutor", api_exclude_tutorRouter);
const api_update_excluded_tutorsRouter = require("./routes/api-update-excluded-tutors.js");
app.use("/api/update-excluded-tutors", api_update_excluded_tutorsRouter);
const api_campaign_spendRouter = require("./routes/api-campaign-spend.js");
app.use("/api/campaign-spend", api_campaign_spendRouter);
const api_ad_syncRouter = require("./routes/api-ad-sync.js");
app.use("/api/ad-sync", api_ad_syncRouter);
const api_ads_managerRouter = require("./routes/api-ads-manager.js");
app.use("/api/ads-manager", api_ads_managerRouter);
const api_meta_offline_eventsRouter = require("./routes/api-meta-offline-events.js");
app.use("/api/meta-offline-events", api_meta_offline_eventsRouter);
const api_meta_trackingRouter = require("./routes/api-meta-tracking.js");
app.use("/api/meta-tracking", api_meta_trackingRouter);
const fix_missing_contractorsRouter = require("./routes/fix-missing-contractors.js");
app.use("/fix-missing-contractors", fix_missing_contractorsRouter);
const api_master_report_onlineRouter = require("./routes/api-master-report-online.js");
app.use("/api/master-report-online", api_master_report_onlineRouter);
const api_master_report_homeRouter = require("./routes/api-master-report-home.js");
app.use("/api/master-report-home", api_master_report_homeRouter);
const resync_all_appointmentsRouter = require("./routes/resync-all-appointments.js");
app.use("/resync-all-appointments", resync_all_appointmentsRouter);
const api_master_reportRouter = require("./routes/api-master-report.js");
app.use("/api/master-report", api_master_reportRouter);
const api_sync_allRouter = require("./routes/api-sync-all.js");
app.use("/api/sync-all", api_sync_allRouter);
const api_revenue_sessions_detailRouter = require("./routes/api-revenue-sessions-detail.js");
app.use("/api/revenue-sessions-detail", api_revenue_sessions_detailRouter);
const api_master_report_detailsRouter = require("./routes/api-master-report-details.js");
app.use("/api/master-report-details", api_master_report_detailsRouter);
const api_sync_payment_ordersRouter = require("./routes/api-sync-payment-orders.js");
app.use("/api/sync-payment-orders", api_sync_payment_ordersRouter);
const api_sync_managerRouter = require("./routes/api-sync-manager.js");
app.use("/api", api_sync_managerRouter);
const api_analyticsRouter = require("./routes/api-analytics.js");
app.use("/api", api_analyticsRouter);
const api_income_breakdownRouter = require("./routes/api-income-breakdown.js");
app.use("/api/income-breakdown", api_income_breakdownRouter);
const api_monthly_financialsRouter = require("./routes/api-monthly-financials.js");
app.use("/api/monthly-financials", api_monthly_financialsRouter);
const api_income_over_timeRouter = require("./routes/api-income-over-time.js");
app.use("/api/income-over-time", api_income_over_timeRouter);
const api_lesson_hoursRouter = require("./routes/api-lesson-hours.js");
app.use("/api/lesson-hours", api_lesson_hoursRouter);
const api_client_spendRouter = require("./routes/api-client-spend.js");
app.use("/api/client-spend", api_client_spendRouter);
const api_activityRouter = require("./routes/api-activity.js");
app.use("/api/activity", api_activityRouter);
const api_historical_analyticsRouter = require("./routes/api-historical-analytics.js");
app.use("/api/historical-analytics", api_historical_analyticsRouter);
const api_franchisee_analyticsRouter = require("./routes/api-franchisee-analytics.js");
app.use("/api/franchisee-analytics", api_franchisee_analyticsRouter);
const api_tutor_hour_bucketsRouter = require("./routes/api-tutor-hour-buckets.js");
app.use("/api", api_tutor_hour_bucketsRouter);
const api_consistency_bonusRouter = require("./routes/api-consistency-bonus.js");
const api_adhoc_chargesRouter = require("./routes/api-adhoc-charges.js");
app.use("/api", api_consistency_bonusRouter);
app.use("/api/adhoc-charges", api_adhoc_chargesRouter);
const api_packagesRouter = require("./routes/api-packages.js");
app.use("/api/packages", api_packagesRouter);
const api_app_settingsRouter = require("./routes/api-app-settings.js");
app.use("/api/app-settings", api_app_settingsRouter);
const api_term_billingRouter = require("./routes/api-term-billing.js");
app.use("/api/term-billing", api_term_billingRouter);
const api_subscriptionsRouter = require("./routes/api-subscriptions.js");
app.use("/api/subscriptions", api_subscriptionsRouter);
const api_billingRouter = require("./routes/api-billing.js");
app.use("/api/billing", api_billingRouter);
const api_sentryTestRouter = require("./routes/api-sentry-test.js");
app.use("/api/sentry-test", api_sentryTestRouter);
const api_documentsRouter = require("./routes/api-documents.js");
app.use("/api/documents", api_documentsRouter);
const api_broadcastsRouter = require("./routes/api-broadcasts.js");
app.use("/api/broadcasts", api_broadcastsRouter);
const api_email_analyticsRouter = require("./routes/api-email-analytics.js");
app.use("/api/email-analytics", api_email_analyticsRouter);
const api_outbound_emailsRouter = require("./routes/api-outbound-emails.js");
app.use("/api/outbound-emails", api_outbound_emailsRouter);
const api_public_filesRouter = require("./routes/api-public-files.js");
app.use("/api/public-files", api_public_filesRouter);
const api_lesson_remindersRouter = require("./routes/api-lesson-reminders.js");
app.use("/api/lesson-reminders", api_lesson_remindersRouter);
const tutor_lessonsRouter = require("./routes/tutor-lessons.js");
app.use("/tutor-lessons", tutor_lessonsRouter);
const api_templatesRouter = require("./routes/api-templates.js");
app.use("/api/templates", api_templatesRouter);
const api_client_reportsRouter = require("./routes/api-client-reports.js");
app.use("/api/client-reports", api_client_reportsRouter);
const studentManagementRoutes = require('./routes/api-student-management');
app.use('/api/student-management', studentManagementRoutes);
const api_accountingRouter = require("./routes/api-accounting.js");
const api_accounting_paymentsRouter = require("./routes/api-accounting-payments.js");
const api_client_billingRouter = require("./routes/api-client-billing.js");
app.use("/api/accounting", api_accountingRouter);
app.use("/api/accounting/payments", api_accounting_paymentsRouter);
app.use("/api/client-billing", api_client_billingRouter);
const api_balance_adjustmentsRouter = require("./routes/api-balance-adjustments.js");
app.use("/api/balance-adjustments", api_balance_adjustmentsRouter);
const api_brevo_webhookRouter = require("./routes/api-brevo-webhook.js");
app.use("/api/brevo-webhook", api_brevo_webhookRouter);
app.use("/api/tracking", api_brevo_webhookRouter); // Also handles /api/tracking/pixel and /api/tracking/click
const api_booking_typesRouter = require("./routes/resources/booking-types-routes.js");
app.use("/api/booking-types", api_booking_typesRouter);
const api_submissionsRouter = require("./routes/api-submissions.js");
const api_klaviyo_analyticsRouter = require("./routes/api-klaviyo-analytics.js");
const api_google_analyticsRouter = require("./routes/api-google-analytics.js");
app.use("/api/submissions", api_submissionsRouter);
app.use("/api/submissions/analytics/klaviyo", api_klaviyo_analyticsRouter);
app.use("/api/submissions/analytics/google", api_google_analyticsRouter);
const api_klaviyo_syncRouter = require("./routes/api-klaviyo-sync.js");
app.use("/api/submissions/analytics/klaviyo", api_klaviyo_syncRouter);
const api_event_leadsRouter = require("./routes/api-event-leads.js");
app.use("/api/event-leads", api_event_leadsRouter);
const api_attributionRouter = require("./routes/api-attribution.js");
app.use("/api/attribution", api_attributionRouter);
const api_local_appointmentsRouter = require("./routes/api-local-appointments.js");
app.use("/api/local-appointments", api_local_appointmentsRouter);
const api_colour_groupsRouter = require("./routes/resources/colour-groups-routes.js");
app.use("/api/colour-groups", api_colour_groupsRouter);
const api_imagesRouter = require("./routes/api-images.js");
app.use("/api/images", api_imagesRouter);
const api_qr_codesRouter = require("./routes/api-qr-codes.js");
app.use("/api/qr-codes", api_qr_codesRouter);
// QR Code Redirect Router - public endpoint for scan tracking
const { createRedirectRouter } = require("./routes/api-qr-codes.js");
app.use("/qr", createRedirectRouter());
const api_bad_margin_alertsRouter = require("./routes/api-bad-margin-alerts.js");
app.use("/api/bad-margin-alerts", api_bad_margin_alertsRouter);
const api_tutorcruncherRouter = require("./routes/api-tutorcruncher.js");
app.use("/api/tutorcruncher", api_tutorcruncherRouter);
const api_entity_detailsRouter = require("./routes/api-entity-details.js");
app.use("/api/entity-details", api_entity_detailsRouter);
const api_tutor_photoRouter = require("./routes/api-tutor-photo.js");
app.use("/api/tutor-photo", api_tutor_photoRouter);
const api_entity_listsRouter = require("./routes/api-entity-lists.js");
app.use("/api/entity-lists", api_entity_listsRouter);
const apiLessonsDashboardRouter = require("./routes/api-lessons-dashboard.js");
app.use("/api/lessons-dashboard", apiLessonsDashboardRouter);
const api_entity_metricsRouter = require("./routes/api-entity-metrics.js");
app.use("/api/entity-metrics", api_entity_metricsRouter);
const api_geocodeRouter = require("./routes/api-geocode.js");
app.use("/api/geocode", api_geocodeRouter);
const api_labelsRouter = require("./routes/api-labels.js");
app.use("/api/labels", api_labelsRouter);
const apiDataCenterRouter = require("./routes/api-data-center.js");
app.use("/api/data-center", apiDataCenterRouter);
const apiDashboardFeedRouter = require("./routes/api-dashboard-feed.js");
app.use("/api/dashboard-feed", apiDashboardFeedRouter);
const api_forecastRouter = require("./routes/api-forecast.js");
app.use("/api/forecast", api_forecastRouter);
const api_sync_forecastRouter = require("./routes/api-sync-forecast.js");
app.use("/api", api_sync_forecastRouter);
const api_financial_intelligenceRouter = require("./routes/api-financial-intelligence.js");
app.use("/api/financial", api_financial_intelligenceRouter);
const api_configRouter = require("./routes/api-config.js");
app.use("/api/config", api_configRouter);
const api_reportsRouter = require("./routes/api-reports.js");
app.use("/api/reports", api_reportsRouter);
const api_payrollRouter = require("./routes/api-payroll.js");
app.use("/api/payroll", api_payrollRouter);
const api_pipeline_stagesRouter = require("./routes/api-pipeline-stages.js");
app.use("/api/pipeline-stages", api_pipeline_stagesRouter);
const api_client_conversion_trackerRouter = require("./routes/api-client-conversion-tracker.js");
const api_user_guideRouter = require("./routes/api-user-guide.js");
app.use("/api/user-guide", api_user_guideRouter);
app.use("/api/client-conversion-tracker", api_client_conversion_trackerRouter);
app.use("/api/cct", api_client_conversion_trackerRouter); // Short alias used by dashboard
const api_client_notesRouter = require("./routes/api-client-notes.js");
app.use("/api/client-notes", api_client_notesRouter);
const api_tutor_notesRouter = require("./routes/api-tutor-notes.js");
app.use("/api/tutor-notes", api_tutor_notesRouter);
const api_servicesRouter = require("./routes/api-services.js");
app.use("/api/services", api_servicesRouter);
 const api_public_servicesRouter = require("./routes/api-public-services.js");
// Mount public services route without authentication middleware
app.use("/api/public-services", api_public_servicesRouter);
const api_eventsRouter = require("./routes/api-events.js");
app.use("/api/events", api_eventsRouter);
const api_sync_servicesRouter = require("./routes/api-sync-services.js");
app.use("/api/sync-services", api_sync_servicesRouter);
const api_webflow_syncRouter = require("./routes/api-webflow-sync.js");
app.use("/api/webflow-sync", api_webflow_syncRouter);
const api_locationsRouter = require("./routes/resources/locations-routes.js");
app.use("/api/locations", api_locationsRouter);
const api_appointmentsRouter = require("./routes/api-appointments.js");
app.use("/api/appointments", api_appointmentsRouter);
const api_lessonsRouter = require("./routes/api-lessons.js");
app.use("/api/lessons", api_lessonsRouter);
const api_jobsRouter = require("./routes/api-jobs.js");
app.use("/api/jobs", api_jobsRouter);
const api_sync_appointmentsRouter = require("./routes/api-sync-appointments.js");
app.use("/api/sync-appointments", api_sync_appointmentsRouter);
const api_mui_licenseRouter = require("./routes/api-mui-license.js");
app.use("/api/mui-license", api_mui_licenseRouter);
const api_company_nameRouter = require("./routes/api-company-name.js");
app.use("/api/company-name", api_company_nameRouter);
const api_entity_analyticsRouter = require("./routes/api-entity-analytics.js");
app.use("/api/entity-analytics", api_entity_analyticsRouter);
const api_news_feedRouter = require("./routes/api-news-feed.js");
app.use("/api/news-feed", api_news_feedRouter);
const api_notificationsRouter = require("./routes/api-notifications.js");
app.use("/api/notifications", api_notificationsRouter);
const api_cct_notificationsRouter = require("./routes/api-cct-notifications.js");
app.use("/api/cct/notifications", api_cct_notificationsRouter);
const api_tasksRouter = require("./routes/api-tasks.js");
app.use("/api/tasks", api_tasksRouter);
const api_home_page_configRouter = require("./routes/api-home-page-config.js");
app.use("/api/home-page-config", api_home_page_configRouter);
const api_policiesRouter = require("./routes/resources/policies-routes.js");
app.use("/api/policies", api_policiesRouter);
const api_tutor_overviewRouter = require("./routes/api-tutor-overview.js");
app.use("/api/tutor-overview", api_tutor_overviewRouter);
const api_tutor_reportRouter = require("./routes/api-tutor-report.js");
app.use("/api/tutor-report", api_tutor_reportRouter);
// Mount invoices router FIRST to avoid route conflicts
const apiInvoicesRouter = require("./routes/api-invoices-simple.js");
app.use("/api", apiInvoicesRouter);

const apiOtherRouter = require("./routes/api-other");
app.use("/api", apiOtherRouter);
const buildMetricsRouter = require("./routes/api-metrics");
const apiMetricsRouter = buildMetricsRouter({ pool, auth: serverFns.auth });
app.use("/api", apiMetricsRouter);
const apiAlertsRouter = require("./routes/api-alerts");
app.use("/api/alerts", apiAlertsRouter);
const apiMonitoringRouter = require("./routes/api-monitoring-dashboard");
app.use("/api/monitoring", apiMonitoringRouter);
const apiDevOpsRouter = require("./routes/api-devops.js");
app.use("/api/devops", apiDevOpsRouter);
const apiDevOpsMetricsRouter = require("./routes/api-devops-metrics.js");
app.use("/api/devops/metrics", apiDevOpsMetricsRouter);
const { router: apiDevOpsRealtimeRouter } = require("./routes/api-devops-realtime.js");
app.use("/api/devops/realtime", apiDevOpsRealtimeRouter);

const apiBackfillReportsRouter = require("./routes/api-backfill-reports.js");
app.use("/api/backfill-reports", apiBackfillReportsRouter);

const apiE4Router = require("./routes/api-e4.js");
app.use("/api/e4", apiE4Router);

const apiMindBodyRouter = require("./routes/api-mindbody.js");
app.use("/api/mindbody", apiMindBodyRouter);

const apiClubsRouter = require("./routes/api-clubs.js");
app.use("/api/clubs", apiClubsRouter);

const apiTutorProfilesRouter = require("./routes/api-tutor-profiles.js");
app.use("/api/tutor-profiles", apiTutorProfilesRouter);

const apiInternalTutorProfileRouter = require("./routes/api-internal-tutor-profile.js");
app.use("/api/internal", apiInternalTutorProfileRouter);

const apiOnlineRouter = require("./routes/api-online.js");
app.use("/api/online", apiOnlineRouter);

const apiJobHealthRouter = require("./routes/api-job-health.js");
app.use("/api/job-health", apiJobHealthRouter);

// Job Builder Routes were moved to top of routing section




// Serve public uploads directory
const publicUploadsPath = path.join(__dirname, 'public/uploads');
if (fs.existsSync(publicUploadsPath)) {
  app.use('/uploads', express.static(publicUploadsPath));
}

// Serve static files from dist directory (only if dist directory exists)
const frontendDistPath = path.join(__dirname, "dist");
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath, {
    setHeaders: (res, filePath) => {
      // Hashed assets (e.g., MainDashboard-0ukXjy73.js) — cache for 1 year
      if (filePath.includes('/assets/')) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  // Catch-all handler: send back React's index.html file for client-side routing
  // But skip API routes and static asset requests
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }

    // Static asset extensions that should NOT be served as index.html
    // If these files are missing, they should 404 (not return HTML which causes MIME type errors)
    const staticExtensions = [
      '.js', '.mjs', '.cjs',  // JavaScript files
      '.css',                  // Stylesheets
      '.json', '.map',         // Data and source maps
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',  // Images
      '.woff', '.woff2', '.ttf', '.eot', '.otf',  // Fonts
      '.pdf', '.zip', '.mp3', '.mp4', '.webm'     // Other assets
    ];

    // Check if the request is for a static file
    const hasStaticExtension = staticExtensions.some(ext => req.path.toLowerCase().endsWith(ext));

    // If it's a static file request that wasn't found by express.static, return 404
    if (hasStaticExtension) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Static asset not found: ${req.path}`
      });
    }

    // For all other routes (React client-side routes), serve index.html
    // Prevent browsers/CDNs from caching index.html — ensures users always get the latest JS bundle references
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // If build directory doesn't exist, log a warning
  // In development, this is normal (using Vite dev server)
  // In production, this would be an error
  if (process.env.NODE_ENV === 'production') {
    logger.warn({
      event: 'build_directory_missing',
      buildPath: frontendDistPath,
      message: 'Dist directory not found. Run "npm run build" before starting server.'
    }, 'Dist directory not found');
  }
  
  // Only catch non-API routes in production
  // In development, API routes work fine without dist directory
  // Frontend is served by Vite dev server on a different port
  if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res, next) => {
      // Skip API routes - they should work even without dist directory
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.status(503).json({
        error: 'Application is building. Please wait a moment and try again.',
        message: 'Dist directory not found. The application may still be deploying.'
      });
    });
  }
}

// Register error handlers AFTER all routes and catch-all handlers
// 404 handler must come before error handler
// Note: Catch-all route handler above handles React routing, so 404 only handles unmatched API routes
app.use((req, res, next) => {
  // Only apply 404 handler to API routes, not React routes
  if (req.path.startsWith('/api')) {
    return notFoundHandler(req, res);
  }
  next();
});

// Sentry error handler must be before custom error handlers
app.use(sentryErrorHandler());

app.use(errorHandler);

const PORT = process.env.PORT || 5001;

// WebSocket support for News Feed real-time updates
const http = require('http');
const { initializeWebSocket, getIO } = require('./services/websocket');

// Create HTTP server for Socket.io integration
const server = http.createServer(app);

// Initialize Socket.io
const io = initializeWebSocket(server);

// Make io available globally for route handlers
global.io = io;
global.websocket = require('./services/websocket');

// Only start listening if not in test environment or if explicitly requested
// This allows tests to import the app without starting the server
if (process.env.NODE_ENV !== 'test' || process.env.START_SERVER === 'true') {
  // Initialize Redis BEFORE starting the server to avoid race conditions
  // where early requests use in-memory cache before Redis connects
  (async () => {
    try {
      const client = await initRedis();
      if (client) {
        logger.info({ event: 'redis_init' }, 'Redis initialized for shared cache');
      } else {
        logger.warn({ event: 'redis_not_configured' }, 'Redis not configured, using in-memory cache (multi-dyno caching will NOT work)');
      }
    } catch (err) {
      logger.warn({ event: 'redis_init_failed', error: err.message }, 'Redis init failed, using in-memory cache');
    }

    // Start server AFTER Redis is initialized (or failed gracefully)
    server.listen(PORT, () => {
      logger.info({
        event: 'server_start',
        port: PORT,
        nodeEnv: process.env.NODE_ENV,
        websocket: 'enabled',
        redisEnabled: !!process.env.REDIS_URL,
        timestamp: new Date().toISOString()
      }, `Server is running on port ${PORT} with WebSocket support`);
    });
  })();
}

// Export app and server for testing
module.exports = { app, server, io };
