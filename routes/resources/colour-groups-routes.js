const express = require('express');
const { pool, ColourGroup } = global;

const router = express.Router();

// GET /api/colour-groups - Get all colour groups
router.get('/', async (req, res) => {
  try {
    const {
      rows
    } = await pool.query('SELECT * FROM public."ColourGroups"');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching colour groups:', err);
    res.status(500).send('Error fetching colour groups');
  }
});

// POST /api/colour-groups - Create new colour group
router.post('/', async (req, res) => {
  const {
    name,
    color
  } = req.body;
  try {
    const colourGroup = await ColourGroup.create({
      name,
      color
    });
    res.status(201).json(colourGroup);
  } catch (error) {
    console.error('Error adding new colour group:', error.message);
    res.status(500).send('Error adding new colour group');
  }
});

// PUT /api/colour-groups/:id - Update colour group
router.put('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  const {
    name,
    color
  } = req.body;
  try {
    const colourGroup = await ColourGroup.findByPk(id);
    if (colourGroup) {
      colourGroup.name = name;
      colourGroup.color = color;
      await colourGroup.save();
      res.json(colourGroup);
    } else {
      res.status(404).json({
        message: 'Colour group not found'
      });
    }
  } catch (error) {
    console.error('Error updating colour group:', error.message);
    res.status(500).send('Error updating colour group');
  }
});

// DELETE /api/colour-groups/:id - Delete colour group
router.delete('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const colourGroup = await ColourGroup.findByPk(id);
    if (colourGroup) {
      await colourGroup.destroy();
      res.json({
        message: 'Colour group deleted'
      });
    } else {
      res.status(404).json({
        message: 'Colour group not found'
      });
    }
  } catch (error) {
    console.error('Error deleting colour group:', error.message);
    res.status(500).send('Error deleting colour group');
  }
});

module.exports = router;
