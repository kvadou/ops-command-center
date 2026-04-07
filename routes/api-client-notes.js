const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
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

// Get all notes for a specific client
router.get('/:clientId', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { pool } = global;
    
    const result = await pool.query(`
      SELECT 
        id,
        client_id,
        note as note_text,
        created_by,
        created_at
      FROM client_notes 
      WHERE client_id = $1 
      ORDER BY created_at DESC
    `, [clientId]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching client notes');
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}));

// Add a new note
router.post('/', auth, asyncHandler(async (req, res) => {
  try {
    const { client_id, note_text, created_by } = req.body;
    const { pool } = global;
    
    if (!client_id || !note_text) {
      return res.status(400).json({ error: 'Client ID and note text are required' });
    }
    
    // Extract user info from JWT token
    const userName = req.user?.first_name && req.user?.last_name 
      ? `${req.user.first_name} ${req.user.last_name}`
      : req.user?.email || req.user?.name || req.user?.username || 'Unknown User';
    logger.info({ user: req.user, userName }, '🔍 User info from JWT');
    
    const result = await pool.query(`
      INSERT INTO client_notes (client_id, note, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, client_id, note as note_text, created_by, created_at
    `, [client_id, note_text, userName]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding client note');
    res.status(500).json({ error: 'Failed to add note' });
  }
}));

// Update a note
router.put('/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const { noteId } = req.params;
    const { note_text } = req.body;
    const { pool } = global;
    
    if (!note_text) {
      return res.status(400).json({ error: 'Note text is required' });
    }
    
    const result = await pool.query(`
      UPDATE client_notes 
      SET note = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, client_id, note as note_text, created_by, created_at
    `, [note_text, noteId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating client note');
    res.status(500).json({ error: 'Failed to update note' });
  }
}));

// Delete a note
router.delete('/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const { noteId } = req.params;
    const { pool } = global;
    
    const result = await pool.query(`
      DELETE FROM client_notes 
      WHERE id = $1
      RETURNING id
    `, [noteId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting client note');
    res.status(500).json({ error: 'Failed to delete note' });
  }
}));

module.exports = router;
