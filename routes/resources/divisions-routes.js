const express = require('express');
const { pool } = global;

const router = express.Router();

// GET /api/divisions - Get all divisions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM divisions');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching divisions:', error);
    res.status(500).send('Error fetching divisions');
  }
});

// POST /api/divisions - Create new division
router.post('/', async (req, res) => {
  const {
    label,
    division
  } = req.body;
  if (!label || !division) {
    return res.status(400).send('Label and division are required.');
  }
  try {
    const result = await pool.query('INSERT INTO divisions (label, division) VALUES ($1, $2) RETURNING *', [label, division]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding division:', error);
    res.status(500).send('Error adding division');
  }
});

// PUT /api/divisions/:id - Update division
router.put('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  const {
    label,
    division
  } = req.body;
  try {
    const result = await pool.query('UPDATE divisions SET label = $1, division = $2 WHERE id = $3 RETURNING *', [label, division, id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Division not found.');
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating division:', error);
    res.status(500).send('Error updating division');
  }
});

// DELETE /api/divisions/:id - Delete division
router.delete('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const result = await pool.query('DELETE FROM divisions WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('Division not found.');
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting division:', error);
    res.status(500).send('Error deleting division');
  }
});

module.exports = router;
