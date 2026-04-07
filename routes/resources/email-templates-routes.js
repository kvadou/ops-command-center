const express = require('express');
const { pool } = global;

const router = express.Router();

// GET /api/email-templates - Get all email templates
router.get('/', async (req, res) => {
  try {
    const {
      rows
    } = await pool.query(`SELECT
         id,
         name,
         subject,
         content,
         created_at,
         updated_at
       FROM email_templates
       ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/email-templates error:', err);
    res.status(500).json({
      error: 'Failed to list email templates'
    });
  }
});

// GET /api/email-templates/:id - Get email template by ID
router.get('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const {
      rows
    } = await pool.query(`SELECT
         id,
         name,
         subject,
         content,
         created_at,
         updated_at
       FROM email_templates
      WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({
      error: 'Not found'
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to load email template'
    });
  }
});

// POST /api/email-templates - Create new email template
router.post('/', async (req, res) => {
  const {
    name,
    subject,
    content
  } = req.body;
  try {
    const {
      rows
    } = await pool.query(`INSERT INTO email_templates
         (name, subject, content)
       VALUES ($1, $2, $3)
       RETURNING *`, [name, subject, content]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to save email template'
    });
  }
});

// PUT /api/email-templates/:id - Update email template
router.put('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  const {
    name,
    subject,
    content
  } = req.body;
  try {
    const {
      rows
    } = await pool.query(`UPDATE email_templates
          SET name    = $1,
              subject = $2,
              content = $3,
              updated_at = NOW()
        WHERE id = $4
      RETURNING *`, [name, subject, content, id]);
    if (!rows.length) return res.status(404).json({
      error: 'Not found'
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to update email template'
    });
  }
});

// DELETE /api/email-templates/:id - Delete email template
router.delete('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const {
      rowCount
    } = await pool.query(`DELETE FROM email_templates WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({
      error: 'Not found'
    });
    res.json({
      success: true
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to delete email template'
    });
  }
});

module.exports = router;
