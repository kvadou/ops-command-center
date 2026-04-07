const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const cache = require('../utils/cache');
const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Middleware to verify JWT token
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    return next();
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Get all notes for a specific tutor/contractor
router.get('/:contractorId', auth, asyncHandler(async (req, res) => {
  try {
    const { contractorId } = req.params;
    const pool = getLocationPool(req);

    // Build cache key
    const cacheKey = `tutor-notes:${contractorId}`;

    // Try to get from cache or fetch fresh data
    const notes = await cache.getOrSet(cacheKey, async () => {
      const result = await pool.query(`
        SELECT
          id,
          contractor_id,
          note as note_text,
          created_by,
          created_at,
          updated_at
        FROM tutor_notes
        WHERE contractor_id = $1
        ORDER BY created_at DESC
      `, [contractorId]);

      return result.rows;
    }, 60); // TTL: 1 minute

    res.json(notes);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor notes:');
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}));

// Add a new note
router.post('/', auth, asyncHandler(async (req, res) => {
  try {
    const { contractor_id, note_text, created_by } = req.body;
    const pool = getLocationPool(req);

    if (!contractor_id || !note_text) {
      return res.status(400).json({ error: 'Contractor ID and note text are required' });
    }

    // Extract user info from JWT token
    const userName = req.user?.first_name && req.user?.last_name
      ? `${req.user.first_name} ${req.user.last_name}`
      : req.user?.email || req.user?.name || req.user?.username || 'Unknown User';
    logger.info({ data: { user: req.user, userName } }, '🔍 User info from JWT:');

    const result = await pool.query(`
      INSERT INTO tutor_notes (contractor_id, note, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, contractor_id, note as note_text, created_by, created_at
    `, [contractor_id, note_text, userName]);

    // Invalidate cache for this tutor's notes
    await cache.clearCacheByPrefix(`tutor-notes:${contractor_id}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding tutor note:');
    res.status(500).json({ error: 'Failed to add note' });
  }
}));

// Update a note
router.put('/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const { noteId } = req.params;
    const { note_text } = req.body;
    const pool = getLocationPool(req);

    if (!note_text) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const result = await pool.query(`
      UPDATE tutor_notes
      SET note = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, contractor_id, note as note_text, created_by, created_at
    `, [note_text, noteId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Invalidate cache for this tutor's notes
    const contractorId = result.rows[0].contractor_id;
    await cache.clearCacheByPrefix(`tutor-notes:${contractorId}`);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating tutor note:');
    res.status(500).json({ error: 'Failed to update note' });
  }
}));

// Delete a note
router.delete('/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const { noteId } = req.params;
    const pool = getLocationPool(req);

    const result = await pool.query(`
      DELETE FROM tutor_notes
      WHERE id = $1
      RETURNING id, contractor_id
    `, [noteId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Invalidate cache for this tutor's notes
    const contractorId = result.rows[0].contractor_id;
    await cache.clearCacheByPrefix(`tutor-notes:${contractorId}`);

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting tutor note:');
    res.status(500).json({ error: 'Failed to delete note' });
  }
}));

module.exports = router;

