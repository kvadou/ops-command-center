const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { pool } = global;
const { logger } = require('../../utils/logger');

const router = express.Router();

const OWNER_USER_ID = 71; // Admin User — only user who can manage users

// Middleware: extract user from JWT for access checks
function extractUser(req, res, next) {
  const secret = process.env.JWT_SECRET || global.JWT_SECRET;
  const token = req.header("Authorization")?.split(" ")[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ msg: "No token" });
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded.user || decoded;
    next();
  } catch {
    return res.status(401).json({ msg: "Token invalid" });
  }
}

// Middleware: restrict to owner or super_admin
function requireOwner(req, res, next) {
  if (req.user?.id !== OWNER_USER_ID && req.user?.role !== 'super_admin') {
    return res.status(403).json({ msg: "Access restricted" });
  }
  next();
}

// GET /api/users - Get all users (owner only)
router.get('/', extractUser, requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, role, app_access, google_id IS NOT NULL as has_google, preferences, created_at FROM users ORDER BY first_name, last_name'
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching users');
    res.status(500).json({ msg: 'Error fetching users' });
  }
});

// POST /api/users - Create new user (owner only)
router.post('/', extractUser, requireOwner, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { first_name, last_name, email, password, role } = req.body;
  try {
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, role, app_access)
       VALUES ($1, $2, $3, $4, $5, '{"main":true,"staging":false,"westside":false,"eastside":false}'::jsonb)
       RETURNING id, first_name, last_name, email, role, app_access`,
      [first_name, last_name, email, hashedPassword, role || 'user']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating user');
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/users/:id - Update user (owner only)
router.put('/:id', extractUser, requireOwner, async (req, res) => {
  const { first_name, last_name, email, role } = req.body;
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, email = $3, role = $4, updated_at = NOW()
       WHERE id = $5 RETURNING id, first_name, last_name, email, role, app_access`,
      [first_name, last_name, email, role, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating user');
    res.status(500).json({ msg: 'Error updating user' });
  }
});

// PATCH /api/users/:id/app-access - Toggle app access (owner only)
router.patch('/:id/app-access', extractUser, requireOwner, async (req, res) => {
  const { id } = req.params;
  const { app, enabled } = req.body;

  const validApps = ['main', 'staging', 'westside', 'eastside'];
  if (!validApps.includes(app)) {
    return res.status(400).json({ msg: `Invalid app. Must be one of: ${validApps.join(', ')}` });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ msg: 'enabled must be a boolean' });
  }

  // Prevent owner from locking themselves out
  if (parseInt(id) === OWNER_USER_ID && !enabled) {
    return res.status(400).json({ msg: "Cannot remove your own app access" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET app_access = jsonb_set(COALESCE(app_access, '{}'::jsonb), $1, $2::jsonb), updated_at = NOW()
       WHERE id = $3 RETURNING id, first_name, last_name, email, role, app_access`,
      [`{${app}}`, JSON.stringify(enabled), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }
    logger.info({ userId: id, app, enabled }, 'App access updated');
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating app access');
    res.status(500).json({ msg: 'Error updating app access' });
  }
});

// PATCH /api/users/:id/reset-password - Admin reset password (owner only)
router.patch('/:id/reset-password', extractUser, requireOwner, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  try {
    if (!password || password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [hashedPassword, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({ msg: 'Password reset successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error resetting password');
    res.status(500).json({ msg: 'Error resetting password' });
  }
});

// DELETE /api/users/:id - Delete user (owner only)
router.delete('/:id', extractUser, requireOwner, async (req, res) => {
  const { id } = req.params;

  // Prevent owner from deleting themselves
  if (parseInt(id) === OWNER_USER_ID) {
    return res.status(400).json({ msg: "Cannot delete your own account" });
  }

  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({ msg: 'User deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user');
    res.status(500).json({ msg: 'Error deleting user' });
  }
});

module.exports = router;
