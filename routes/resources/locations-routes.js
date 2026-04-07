const express = require('express');
const { pool, Location } = global;

const router = express.Router();

// GET /api/locations - Get all locations
router.get('/', async (req, res) => {
  try {
    const {
      rows
    } = await pool.query('SELECT * FROM public."Locations"');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).send('Error fetching locations');
  }
});

// POST /api/locations - Create new location
router.post('/', async (req, res) => {
  const {
    name,
    color
  } = req.body;
  try {
    const location = await Location.create({
      name,
      color
    });
    res.status(201).json(location);
  } catch (error) {
    console.error('Error adding new location:', error);
    res.status(500).send('Error adding new location');
  }
});

// PUT /api/locations/:id - Update location
router.put('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  const {
    name,
    color
  } = req.body;
  try {
    const location = await Location.findByPk(id);
    if (location) {
      location.name = name;
      location.color = color;
      await location.save();
      res.json(location);
    } else {
      res.status(404).json({
        message: 'Location not found'
      });
    }
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).send('Error updating location');
  }
});

// DELETE /api/locations/:id - Delete location
router.delete('/:id', async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const location = await Location.findByPk(id);
    if (location) {
      await location.destroy();
      res.json({
        message: 'Location deleted'
      });
    } else {
      res.status(404).json({
        message: 'Location not found'
      });
    }
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).send('Error deleting location');
  }
});

module.exports = router;
