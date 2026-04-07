require('dotenv').config();
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Pool } = require("pg");
const { getPool } = require("../database-connections");
const { tableExists } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

const ALLOWED_DOMAINS = ['acmeops.com', 'chessat3.com'];
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Create a database connection for auth
// NOTE: For local development, use local database. For production/staging, use production database.
// Location-specific databases are for data isolation, not user management
const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
// Detect Heroku/AWS databases that require SSL even when running locally
const isHerokuOrAwsUrl = (url) => url && (
  url.includes('.amazonaws.com') ||
  url.includes('.compute-1.') ||
  url.includes('heroku') ||
  /postgres:\/\/[a-z]{10,}:[^@]+@/.test(url)
);
const needsSSL = process.env.NODE_ENV === "production" ||
                 ["production", "westside", "eastside", "staging"].includes(process.env.NODE_ENV) ||
                 isHerokuOrAwsUrl(process.env.DATABASE_URL) ||
                 isHerokuOrAwsUrl(process.env.USERS_DATABASE_URL) ||
                 isHerokuOrAwsUrl(process.env.PRODUCTION_DATABASE_URL);

// Get database URL - use local if available, otherwise use production
// For local development, use local database if DATABASE_URL is set
// For staging/production, ALWAYS use production database for auth (users are stored there)
// This is critical because staging has its own DATABASE_URL which points to staging database
// but authentication must use the production database where users are stored
const productionDbUrl = process.env.USERS_DATABASE_URL;

// Use local DATABASE_URL if available, otherwise always use production database for auth
// Priority: USERS_DATABASE_URL > PRODUCTION_DATABASE_URL > hardcoded fallback
// We intentionally IGNORE process.env.DATABASE_URL in production/staging environments for auth
// because DATABASE_URL points to the local tenant database (e.g., 'Westside'), but users are in Main Production.
let dbUrl;
if (isLocal && process.env.DATABASE_URL) {
  dbUrl = process.env.DATABASE_URL;
} else {
  dbUrl = process.env.USERS_DATABASE_URL || process.env.PRODUCTION_DATABASE_URL || productionDbUrl;
}

// If no database URL is set, use the database-connections helper for local
let pool;
if (!dbUrl && isLocal) {
  // Fallback to using database-connections helper for local
  pool = getPool('local');
} else if (dbUrl) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: needsSSL && !isLocal ? { rejectUnauthorized: false } : false
  });
} else {
  // Last resort: use database-connections helper
  pool = getPool('local');
}

// Test database connection on startup
pool.on('error', (err) => {
  logger.error({ err: err }, '❌ Unexpected database pool error:');
});

pool.query('SELECT NOW()')
  .then(() => {
    logger.info('✅ Auth database connection successful');
    let source = 'hardcoded fallback';
    if (process.env.PRODUCTION_DATABASE_URL) {
      source = 'PRODUCTION_DATABASE_URL env var';
    } else if (process.env.DATABASE_URL && !isLocal) {
      source = 'DATABASE_URL env var';
    } else if (isLocal) {
      source = 'local DATABASE_URL';
    }
    logger.info('🔧 Using database: ${isLocal ? \'local\' : \'production\'} (${source})');
  })
  .catch((err) => {
    logger.error({ error: err.message }, '❌ Auth database connection failed:');
    logger.error({ dbUrl: dbUrl.replace(/:[^:@]+@/, ':****@') }, '❌ Database URL being used');
    logger.error({ error: err.code }, '❌ Error code:');
    let source = 'hardcoded fallback';
    if (process.env.PRODUCTION_DATABASE_URL) {
      source = 'PRODUCTION_DATABASE_URL env var';
    } else if (process.env.DATABASE_URL && !isLocal) {
      source = 'DATABASE_URL env var';
    } else if (isLocal) {
      source = 'local DATABASE_URL';
    }
    logger.error('❌ Database source: ${source}');
  });

async function verifyUser(email, password) {
  if (email && password) {
    try {
      // Check if users table exists (cached)
      const usersExists = await tableExists(pool, 'users');

      if (!usersExists) {
        logger.error('❌ Users table does not exist in database');
        throw new Error('Users table does not exist. Please run migrations.');
      }

      // Query the users table to get the user's information including password hash
      const result = await pool.query(
        'SELECT id, first_name, last_name, email, password, role FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      logger.info({ data: { email, found: result.rows.length > 0 } }, 'Database query result:');

      if (result.rows.length > 0) {
        const user = result.rows[0];
        // Verify the password using bcrypt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          logger.info({ data: email }, 'Password mismatch for email:');
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        };
      }
    } catch (error) {
      logger.error({ err: error }, 'Error verifying user:');
      throw error;
    }
  }
  return null;
}
router.post("/login", asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      logger.info({ data: { email: !!email, password: !!password } }, 'Login attempt missing email or password:');
      return res.status(400).json({ msg: "Email and password are required" });
    }

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();
    logger.info({ data: normalizedEmail }, 'Login attempt for email:');

    const user = await verifyUser(normalizedEmail, password);

    if (!user) {
      logger.info({ data: normalizedEmail }, 'User not found or verification failed for email:');
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET || global.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET is missing');
      return res.status(500).json({ msg: "Server configuration error" });
    }

    const token = jwt.sign({ user }, secret, { expiresIn: "24h" });

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    logger.info({ data: user.email }, 'Login successful for user:');
    return res.json({ ok: true, user });
  } catch (error) {
    logger.error({ err: error }, 'Login error:');
    return res.status(500).json({ msg: "Internal server error", error: error.message });
  }
}));

// Demo login — portfolio demo mode, no Google auth required
router.post("/demo-login", asyncHandler(async (req, res) => {
  const secret = process.env.JWT_SECRET || global.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ msg: "Server configuration error" });
  }

  const demoUser = {
    id: 100,
    email: 'demo@acmeops.com',
    first_name: 'Demo',
    last_name: 'User',
    role: 'super_admin',
  };

  const token = jwt.sign({ user: demoUser }, secret, { expiresIn: "24h" });

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
  });

  return res.json({ ok: true, user: demoUser });
}));
router.get("/me", asyncHandler(async (req, res) => {
  const secret = process.env.JWT_SECRET || global.JWT_SECRET;
  if (!secret) {
    logger.error(' JWT_SECRET is missing');
    return res
      .status(500)
      .json({ error: "Server misconfiguration: missing JWT_SECRET" });
  }

  const token =
    req.cookies?.token || req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    const decoded = jwt.verify(token, secret);
    const user = decoded.user || decoded;

    // Check per-app access control
    const appIdentity = process.env.APP_IDENTITY || 'main';
    if (user.id) {
      const accessResult = await pool.query(
        'SELECT app_access FROM users WHERE id = $1',
        [user.id]
      );
      if (accessResult.rows.length > 0) {
        const appAccess = accessResult.rows[0].app_access || {};
        if (appAccess[appIdentity] === false) {
          return res.status(403).json({ msg: "No access to this application", code: "NO_APP_ACCESS" });
        }
      }
    }

    // Refresh the cookie silently
    const freshToken = jwt.sign({ user }, secret, { expiresIn: '7d' });
    res.cookie("token", freshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ user });
  } catch {
    return res.status(401).json({ msg: "Token invalid" });
  }
}));
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res.json({ ok: true });
});

// Request password reset - sends email with reset link
router.post("/forgot-password", asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email FROM users WHERE email = $1',
      [normalizedEmail]
    );

    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (userResult.rows.length === 0) {
      logger.info({ data: normalizedEmail }, 'Password reset requested for non-existent email:');
      return res.json({
        msg: "If an account with that email exists, a password reset link has been sent."
      });
    }

    const user = userResult.rows[0];

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Invalidate any existing tokens for this user
    // Use a try-catch to handle case where table doesn't exist yet
    try {
      await pool.query(
        'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
        [user.id]
      );
    } catch (err) {
      // Table might not exist - that's okay, we'll create it on insert
      logger.info({ data: err.message }, 'Note: Could not update existing tokens (table may not exist yet):');
    }

    // Store the token in database
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetToken, expiresAt]
    );

    // Get Brevo email sender
    const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
    const emailSender = getEmailSender();
    if (!emailSender) {
      logger.error('Brevo email sender not available (BREVO_API_KEY not configured)');
      return res.status(500).json({ msg: "Email service unavailable" });
    }

    // Determine reset URL based on environment
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const host = req.get('host') || 'localhost:3000';
    // URL encode the token to ensure it's properly passed in the query string
    const encodedToken = encodeURIComponent(resetToken);
    const resetUrl = `${protocol}://${host}/reset-password?token=${encodedToken}`;

    // Log the reset URL for debugging (remove token from logs for security)
    logger.info({ data: `${protocol}://${host}/reset-password?token=***` }, 'Password reset URL generated:');
    logger.info({ data: resetToken.length }, 'Token length:');

    // Send password reset email
    const resetEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background-color: #6A469D; 
              color: #FFFFFF !important; 
              text-decoration: none; 
              border-radius: 6px; 
              margin: 20px 0;
              font-weight: 600;
              font-size: 16px;
              text-align: center;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Reset Your Password</h2>
            <p>Hello ${user.first_name || 'there'},</p>
            <p>We received a request to reset your password for your Acme Operations account.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${resetUrl}" style="background-color: #6A469D; color: #FFFFFF !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px; border: none;">Reset Password</a>
            </div>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6A469D;">${resetUrl}</p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <div class="footer">
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
    const resetEmailText = `
        Reset Your Password - Acme Operations

        Hello ${user.first_name || 'there'},

        We received a request to reset your password for your Acme Operations account.

        Click this link to reset your password (expires in 1 hour):
        ${resetUrl}

        If you didn't request a password reset, you can safely ignore this email.

        Best regards,
        The Acme Operations Team
      `;

    await emailSender.sendEmail({
      to: user.email,
      subject: 'Reset Your Password - Acme Operations',
      html: resetEmailHtml,
      text: resetEmailText,
    });
    logger.info({ data: normalizedEmail }, 'Password reset email sent to:');

    return res.json({
      msg: "If an account with that email exists, a password reset link has been sent."
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in forgot-password:');
    logger.error({ error: error.stack }, 'Error stack:');
    return res.status(500).json({
      msg: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}));

// Reset password with token
router.post("/reset-password", asyncHandler(async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ msg: "Token and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    }

    // Find valid token
    const tokenResult = await pool.query(
      `SELECT prt.user_id, prt.expires_at, prt.used, u.email 
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.used = FALSE`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ msg: "Invalid or expired reset token" });
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(400).json({ msg: "Reset token has expired" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, tokenData.user_id]
    );

    // Mark token as used
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
      [token]
    );

    logger.info({ data: tokenData.email }, 'Password reset successful for user:');

    return res.json({ msg: "Password has been reset successfully" });
  } catch (error) {
    logger.error({ err: error }, 'Error in reset-password:');
    return res.status(500).json({ msg: "Internal server error" });
  }
}));

// Verify reset token (for checking if token is valid before showing reset form)
router.get("/verify-reset-token", asyncHandler(async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ msg: "Token is required" });
    }

    const tokenResult = await pool.query(
      `SELECT prt.user_id, prt.expires_at, prt.used, u.email 
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ valid: false, msg: "Invalid token" });
    }

    const tokenData = tokenResult.rows[0];

    if (tokenData.used) {
      return res.status(400).json({ valid: false, msg: "Token has already been used" });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, msg: "Token has expired" });
    }

    return res.json({ valid: true, email: tokenData.email });
  } catch (error) {
    logger.error({ err: error }, 'Error in verify-reset-token:');
    return res.status(500).json({ msg: "Internal server error" });
  }
}));

// ==================== GOOGLE OAUTH ====================

// GET /auth/google
// Redirects user to Google's consent screen
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /auth/google/callback
// Google redirects here after user consents
router.get('/google/callback', asyncHandler(async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    logger.warn({ error }, 'Google OAuth denied or failed');
    return res.redirect('/login?error=google_denied');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`}/auth/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });

  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, 'Google token exchange failed');
    return res.redirect('/login?error=google_failed');
  }

  const { id_token } = await tokenRes.json();

  // Verify the ID token and extract user info
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: clientId });
    payload = ticket.getPayload();
  } catch (err) {
    logger.error({ err }, 'Google ID token verification failed');
    return res.redirect('/login?error=google_failed');
  }

  const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatarUrl } = payload;
  const emailDomain = email.split('@')[1]?.toLowerCase();

  // Enforce domain allowlist
  if (!ALLOWED_DOMAINS.includes(emailDomain)) {
    logger.warn({ email }, 'Google login blocked — domain not allowed');
    return res.redirect('/login?error=domain_not_allowed');
  }

  // Find existing user by google_id or email, or create new
  let user = null;

  const byGoogleId = await pool.query(
    'SELECT id, first_name, last_name, email, role, google_id, avatar_url FROM users WHERE google_id = $1',
    [googleId]
  );

  if (byGoogleId.rows.length > 0) {
    user = byGoogleId.rows[0];
    // Keep avatar fresh
    await pool.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, user.id]);
  } else {
    const byEmail = await pool.query(
      'SELECT id, first_name, last_name, email, role, google_id, avatar_url FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (byEmail.rows.length > 0) {
      // Link Google ID to existing account
      user = byEmail.rows[0];
      await pool.query(
        'UPDATE users SET google_id = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3',
        [googleId, avatarUrl, user.id]
      );
    } else {
      // Auto-provision new user — no access by default, Doug grants from Users page
      const newUser = await pool.query(
        `INSERT INTO users (first_name, last_name, email, google_id, avatar_url, role, app_access, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'viewer', '{"main":false,"staging":false,"westside":false,"eastside":false}'::jsonb, NOW(), NOW()) RETURNING id, first_name, last_name, email, role`,
        [firstName || email.split('@')[0], lastName || '', email, googleId, avatarUrl]
      );
      user = newUser.rows[0];
      logger.info({ email }, 'Auto-provisioned new user via Google OAuth (no access until granted)');
    }
  }

  // Check per-app access before completing login
  const appIdentity = process.env.APP_IDENTITY || 'main';
  const accessCheck = await pool.query('SELECT app_access FROM users WHERE id = $1', [user.id]);
  if (accessCheck.rows.length > 0) {
    const appAccess = accessCheck.rows[0].app_access || {};
    if (appAccess[appIdentity] === false) {
      logger.warn({ email, app: appIdentity }, 'Google OAuth blocked — no app access');
      return res.redirect('/login?error=no_access');
    }
  }

  const jwtSecret = process.env.JWT_SECRET || global.JWT_SECRET;
  const userPayload = { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role, avatar_url: avatarUrl };
  const token = jwt.sign({ user: userPayload }, jwtSecret, { expiresIn: '7d' });

  logger.info({ email }, 'Google OAuth login successful');

  // Set HTTP cookie so /api/me works with cookie-based auth checks
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days to match JWT expiry
  });

  // Cookie is already set — redirect without token in URL (prevents token leaking to browser history/logs)
  res.redirect('/');
}));

// POST /auth/google/verify-token
// Used by Chrome extension: exchanges a Google ID token for an OpsHub JWT
router.post('/google/verify-token', asyncHandler(async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'id_token required' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatarUrl } = payload;
  const emailDomain = email.split('@')[1]?.toLowerCase();

  if (!ALLOWED_DOMAINS.includes(emailDomain)) {
    return res.status(403).json({ error: 'Email domain not allowed' });
  }

  // Find or link user
  let user;
  const byGoogleId = await pool.query(
    'SELECT id, first_name, last_name, email, role FROM users WHERE google_id = $1',
    [googleId]
  );

  if (byGoogleId.rows.length > 0) {
    user = byGoogleId.rows[0];
  } else {
    const byEmail = await pool.query(
      'SELECT id, first_name, last_name, email, role FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (byEmail.rows.length > 0) {
      user = byEmail.rows[0];
      await pool.query('UPDATE users SET google_id = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3', [googleId, avatarUrl, user.id]);
    } else {
      const newUser = await pool.query(
        `INSERT INTO users (first_name, last_name, email, google_id, avatar_url, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'viewer', NOW(), NOW()) RETURNING id, first_name, last_name, email, role`,
        [firstName || email.split('@')[0], lastName || '', email, googleId, avatarUrl]
      );
      user = newUser.rows[0];
    }
  }

  const jwtSecret = process.env.JWT_SECRET || global.JWT_SECRET;
  const token = jwt.sign({ user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role } }, jwtSecret, { expiresIn: '7d' });

  res.json({ token, user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role } });
}));

module.exports = router;
