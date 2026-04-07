const express = require('express');
const router = express.Router();
const { buildDeps } = require('../config/deps');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
const auth = global.auth || requireAuth;
const { pool } = buildDeps();

// POST /api/app-settings/invoice-escalation/test - Send test escalation email
router.post('/invoice-escalation/test', auth, asyncHandler(async (req, res) => {
  const { thresholdIndex, testEmail } = req.body;

  const { rows } = await pool.query(
    "SELECT setting_value FROM app_settings WHERE setting_key = 'invoice_escalation_config'"
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No escalation config found' });

  const config = rows[0].setting_value;
  const threshold = config.thresholds?.[thresholdIndex];
  if (!threshold) return res.status(400).json({ error: 'Invalid threshold index' });

  const templateVars = {
    display_id: 'TEST-001',
    school_name: 'Sample Elementary School',
    amount: '$1,250.00',
    days_overdue: threshold.days,
    date_sent: 'January 15, 2026',
  };

  const subject = threshold.subject.replace(/\{\{(\w+)\}\}/g, (_, key) => templateVars[key] || '');
  const bodyContent = threshold.body.replace(/\{\{(\w+)\}\}/g, (_, key) => templateVars[key] || '');

  const urgencyColor = threshold.days >= 60 ? '#DC2626' : threshold.days >= 45 ? '#D97706' : '#2563EB';
  const urgencyBg = threshold.days >= 60 ? '#fef2f2' : threshold.days >= 45 ? '#fffbeb' : '#eff6ff';

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 18px;">Invoice Escalation — ${threshold.label}</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">TEST EMAIL — ${threshold.label}</p>
      </div>
      <div style="background: white; padding: 24px 32px; border: 1px solid #e5e7eb; border-top: 0;">
        <div style="background: ${urgencyBg}; border-left: 4px solid ${urgencyColor}; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14px; line-height: 1.6;">${bodyContent}</p>
        </div>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #6b7280;">Invoice</td><td style="padding: 8px 0; font-weight: 600;">#${templateVars.display_id}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">School</td><td style="padding: 8px 0; font-weight: 600;">${templateVars.school_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Amount</td><td style="padding: 8px 0; font-weight: 600;">${templateVars.amount}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Days Overdue</td><td style="padding: 8px 0; font-weight: 600; color: ${urgencyColor};">${templateVars.days_overdue} days</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Sent Date</td><td style="padding: 8px 0;">${templateVars.date_sent}</td></tr>
        </table>
        <p style="font-size: 11px; color: #DC2626; margin-top: 20px; text-align: center; font-weight: 600;">⚠️ This is a test email — no actual invoice is overdue</p>
      </div>
    </body>
    </html>
  `;

  const recipient = testEmail || config.recipients?.[0] || 'doug@chessat3.com';

  const emailSender = getEmailSender();
  if (!emailSender) {
    logger.warn('Brevo email sender not available — BREVO_API_KEY not configured');
    return res.status(500).json({ error: 'Email service unavailable' });
  }
  await emailSender.sendEmail({
    to: recipient,
    subject: `[TEST] ${subject}`,
    html,
    from: 'noreply@chessat3.com',
    tags: ['invoice-escalation-test'],
  });

  logger.info({ msg: 'Test escalation email sent', thresholdIndex, recipient });
  res.json({ success: true, recipient });
}));

// GET /api/app-settings/invoice-escalation/history - Recent escalation log
router.get('/invoice-escalation/history', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT el.id, el.invoice_id, el.threshold_days, el.sent_at, el.recipients,
           i.display_id, c.first_name || ' ' || COALESCE(c.last_name, '') AS school_name, i.gross AS amount
    FROM invoice_escalation_log el
    LEFT JOIN invoices i ON el.invoice_id = i.id
    LEFT JOIN clients c ON i.client_id::text = c.client_id::text
    ORDER BY el.sent_at DESC
    LIMIT 50
  `);
  res.json(rows);
}));

// GET /api/app-settings/:key - Get a specific setting
router.get('/:key', asyncHandler(async (req, res) => {
  try {
    const { key } = req.params;
    
    const { rows } = await pool.query(
      'SELECT setting_key, setting_value, description FROM app_settings WHERE setting_key = $1',
      [key]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({
      key: rows[0].setting_key,
      value: rows[0].setting_value,
      description: rows[0].description
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching app setting');
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
}));

// PUT /api/app-settings/:key - Update a specific setting
router.put('/:key', asyncHandler(async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Setting value is required' });
    }
    
    const { rows } = await pool.query(
      `UPDATE app_settings 
       SET setting_value = $1, updated_at = NOW() 
       WHERE setting_key = $2 
       RETURNING setting_key, setting_value, description`,
      [JSON.stringify(value), key]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({
      key: rows[0].setting_key,
      value: rows[0].setting_value,
      description: rows[0].description
    });
  } catch (err) {
    logger.error({ err }, 'Error updating app setting');
    res.status(500).json({ error: 'Failed to update setting' });
  }
}));

// GET /api/app-settings - Get all settings
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT setting_key, setting_value, description FROM app_settings ORDER BY setting_key'
    );
    
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = {
        value: row.setting_value,
        description: row.description
      };
    });
    
    res.json(settings);
  } catch (err) {
    logger.error({ err }, 'Error fetching app settings');
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
}));

module.exports = router;
