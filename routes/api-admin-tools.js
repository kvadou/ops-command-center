const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAdmin } = require('../middleware/rbac');
const { logger } = require('../utils/logger');
const router = express.Router();

// Use the production database URL from environment
const pool = new Pool({
  connectionString: process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// One-time password reset endpoint — admin only
router.post('/reset-password-by-email', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ msg: 'Email and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the password
    const updateResult = await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email',
      [hashedPassword, email.toLowerCase().trim()]
    );
    
    res.json({
      msg: 'Password reset successfully',
      user: {
        id: updateResult.rows[0].id,
        email: updateResult.rows[0].email,
        name: `${user.first_name} ${user.last_name}`
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error resetting password');
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
}));

module.exports = router;

