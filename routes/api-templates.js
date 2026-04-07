const express = require('express');
const Handlebars = require('handlebars');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
const {
  pool,
  axios,
  cloudinary,
  tutorCruncherAPI,
  limitedGet,
  jwt,
  stripe,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  auth,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  LABEL_ID,
  TUTORCRUNCHER_API_BASE
} = global;
const router = express.Router();

// Auto-fix double-brace feedback merge tags to triple braces.
// Triple braces tell Handlebars to render raw HTML (needed for formatted feedback).
// Double braces HTML-escape the content, showing raw <p> tags to parents.
function sanitizeFeedbackMergeTags(html) {
  if (!html) return html;
  // Replace {{feedback}} with {{{feedback}}} (but don't touch already-triple-braced)
  return html.replace(/(?<!\{)\{\{feedback\}\}(?!\})/g, '{{{feedback}}}');
}

router.get('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const {
      rows
    } = await pool.query(`SELECT
         id,
         template_name,
         design,
         html,
         created_at,
         updated_at
       FROM templates
      WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rows.length) return res.status(404).json({
      error: 'Not found'
    });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ data: err }, 'err');
    res.status(500).json({
      error: 'Failed to load template'
    });
  }
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  const {
    template_name,
    design,
    html
  } = req.body;
  try {
    const {
      rows
    } = await pool.query(`UPDATE templates
          SET template_name = $1,
              design        = $2,
              html          = $3,
              updated_at    = NOW()
        WHERE id = $4
      RETURNING *`, [template_name, design, sanitizeFeedbackMergeTags(html), id]);
    if (!rows.length) return res.status(404).json({
      error: 'Not found'
    });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ data: err }, 'err');
    res.status(500).json({
      error: 'Failed to update template'
    });
  }
}));
router.post('/', asyncHandler(async (req, res) => {
  const {
    template_name,
    design,
    html
  } = req.body;
  try {
    const {
      rows
    } = await pool.query(`INSERT INTO templates
         (template_name, design, html)
       VALUES ($1, $2, $3)
       RETURNING *`, [template_name, design, sanitizeFeedbackMergeTags(html)]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ data: err }, 'err');
    res.status(500).json({
      error: 'Failed to save template'
    });
  }
}));
router.get('/', asyncHandler(async (req, res) => {
  try {
    const {
      rows
    } = await pool.query(`SELECT
         id,
         template_name,
         created_at
       FROM templates
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, 'GET /api/templates error:');
    res.status(500).json({
      error: 'Failed to list templates'
    });
  }
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get user info from auth token if available
  let deletedBy = 'unknown';
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      deletedBy = decoded.email || decoded.name || 'authenticated_user';
    }
  } catch (e) {
    // Continue with 'unknown' if token parsing fails
  }

  try {
    // 1. Check if template exists and is not already deleted
    const { rows: templateRows } = await pool.query(
      `SELECT id, template_name FROM templates WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (!templateRows.length) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const templateName = templateRows[0].template_name;

    // 2. Check if template is still in use by client_reports
    const { rows: usageRows } = await pool.query(
      `SELECT COUNT(*) as count FROM client_reports WHERE template_name = $1`,
      [templateName]
    );

    const usageCount = parseInt(usageRows[0].count, 10);
    if (usageCount > 0) {
      return res.status(400).json({
        error: `Cannot delete template - it is used by ${usageCount} client report(s). Consider archiving instead.`,
        usageCount
      });
    }

    // 3. Soft delete the template
    const { rowCount } = await pool.query(
      `UPDATE templates SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [deletedBy, id]
    );

    if (!rowCount) {
      return res.status(404).json({ error: 'Template not found or already deleted' });
    }

    // 4. Log to audit table
    await pool.query(
      `INSERT INTO template_audit_log (template_id, template_name, action, performed_by, details)
       VALUES ($1, $2, 'deleted', $3, $4)`,
      [id, templateName, deletedBy, JSON.stringify({ soft_delete: true })]
    );

    logger.info(`[templates] Template ${id} (${templateName}) soft-deleted by ${deletedBy}`);

    res.json({ success: true, message: 'Template archived successfully' });
  } catch (err) {
    logger.error({ err: err }, '[templates] Delete error:');
    res.status(500).json({ error: 'Failed to delete template' });
  }
}));

// Restore a soft-deleted template
router.post('/:id/restore', asyncHandler(async (req, res) => {
  const { id } = req.params;

  let restoredBy = 'unknown';
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      restoredBy = decoded.email || decoded.name || 'authenticated_user';
    }
  } catch (e) {}

  try {
    const { rows } = await pool.query(
      `UPDATE templates SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id, template_name`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Template not found or not deleted' });
    }

    // Log restoration
    await pool.query(
      `INSERT INTO template_audit_log (template_id, template_name, action, performed_by, details)
       VALUES ($1, $2, 'restored', $3, $4)`,
      [id, rows[0].template_name, restoredBy, JSON.stringify({})]
    );

    logger.info(`[templates] Template ${id} (${rows[0].template_name}) restored by ${restoredBy}`);

    res.json({ success: true, template: rows[0] });
  } catch (err) {
    logger.error({ err: err }, '[templates] Restore error:');
    res.status(500).json({ error: 'Failed to restore template' });
  }
}));

// List deleted templates (for admin recovery)
router.get('/deleted/list', asyncHandler(async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, template_name, deleted_at, deleted_by, created_at
      FROM templates
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, '[templates] List deleted error:');
    res.status(500).json({ error: 'Failed to list deleted templates' });
  }
}));
router.post('/:id/send-test', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  const {
    email
  } = req.body;
  logger.info({ data: {
    id,
    email
  } }, '[send-test] payload:');
  if (!email) {
    return res.status(400).json({
      error: 'Email is required'
    });
  }
  try {
    const {
      rows
    } = await pool.query(`SELECT template_name, html
         FROM templates
        WHERE id = $1`, [id]);
    if (!rows.length) {
      return res.status(404).json({
        error: 'Template not found'
      });
    }
    const {
      template_name,
      html: rawHtml
    } = rows[0];
    const rendered = Handlebars.compile(rawHtml)({});
    logger.info({ data: { to: email, subject: `Test: ${template_name}` } }, '[send-test] sending email:');
    const emailSender = getEmailSender();
    if (!emailSender) {
      logger.warn('[send-test] Brevo email sender not available — BREVO_API_KEY not configured');
      return res.status(500).json({ error: 'Email service unavailable' });
    }
    const result = await emailSender.sendEmail({
      to: email,
      subject: `Test: ${template_name}`,
      html: rendered,
      replyTo: 'support@acmeops.com',
      tags: ['template-test'],
    });
    logger.info({ data: result.messageId }, '[send-test] email sent, messageId:');
    return res.json({
      success: true,
      messageId: result.messageId
    });
  } catch (err) {
    logger.error({ err: err }, '[send-test] Error sending test email:');
    return res.status(500).json({
      error: 'Failed to send test email'
    });
  }
}));
module.exports = router;