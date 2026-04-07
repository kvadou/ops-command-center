const express = require('express');
const { pool } = global;

const router = express.Router();

// GET /api/policies - Get all policies
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, slug, label, content_html, sort_order,
       show_on_form, checkbox_group, checkbox_label, link_text
       FROM policy_sections
       ORDER BY sort_order ASC, slug ASC`);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/policies error:', err);
    res.status(500).json({
      error: 'Failed to load policies'
    });
  }
});

// GET /api/policies/:slug - Get policy by slug
router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, slug, label, content_html, sort_order,
       show_on_form, checkbox_group, checkbox_label, link_text
       FROM policy_sections
       WHERE slug = $1`, [req.params.slug]);
    if (!rows.length) return res.status(404).json({
      error: 'Not found'
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(`GET /api/policies/${req.params.slug} error:`, err);
    res.status(500).json({
      error: 'Failed to load policy'
    });
  }
});

// POST /api/policies - Create new policy
router.post('/', async (req, res) => {
  try {
    const { slug, label, content_html, sort_order, show_on_form, checkbox_group, checkbox_label, link_text } = req.body || {};
    if (!slug || !label) {
      return res.status(400).json({
        error: 'slug and label are required'
      });
    }
    // Validate slug format (lowercase, alphanumeric, hyphens only)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      return res.status(400).json({
        error: 'Slug must be lowercase letters, numbers, and hyphens only'
      });
    }
    // Check if slug already exists
    const existing = await pool.query('SELECT id FROM policy_sections WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'A policy with this slug already exists'
      });
    }
    const order = Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0;
    const result = await pool.query(
      `INSERT INTO policy_sections (slug, label, content_html, sort_order, show_on_form, checkbox_group, checkbox_label, link_text, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, slug, label, content_html, sort_order, show_on_form, checkbox_group, checkbox_label, link_text`,
      [slug.trim(), label, content_html || '', order, show_on_form || false, checkbox_group || null, checkbox_label || null, link_text || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/policies error:', err);
    res.status(500).json({
      error: 'Failed to create policy'
    });
  }
});

// PUT /api/policies/:slug - Update policy by slug
router.put('/:slug', async (req, res) => {
  try {
    const {
      label,
      content_html,
      sort_order,
      show_on_form,
      checkbox_group,
      checkbox_label,
      link_text
    } = req.body || {};
    if (!label || typeof content_html !== 'string') {
      return res.status(400).json({
        error: 'label and content_html are required'
      });
    }
    const order = Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0;
    const result = await pool.query(`UPDATE policy_sections
         SET label = $1,
             content_html = $2,
             sort_order = $3,
             show_on_form = $4,
             checkbox_group = $5,
             checkbox_label = $6,
             link_text = $7,
             updated_at = NOW()
       WHERE slug = $8
       RETURNING id, slug, label, content_html, sort_order, show_on_form, checkbox_group, checkbox_label, link_text`,
      [label, content_html, order, show_on_form ?? false, checkbox_group || null, checkbox_label || null, link_text || null, req.params.slug.trim()]);
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Policy not found'
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`PUT /api/policies/${req.params.slug} error:`, err);
    res.status(500).json({
      error: 'Failed to update policy'
    });
  }
});

// DELETE /api/policies/:slug - Delete policy by slug
router.delete('/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM policy_sections WHERE slug = $1 RETURNING id, slug, label',
      [req.params.slug.trim()]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Policy not found'
      });
    }
    res.json({ message: 'Policy deleted', deleted: result.rows[0] });
  } catch (err) {
    console.error(`DELETE /api/policies/${req.params.slug} error:`, err);
    res.status(500).json({
      error: 'Failed to delete policy'
    });
  }
});

module.exports = router;
