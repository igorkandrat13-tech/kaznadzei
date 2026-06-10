const express = require('express');
const ColorStore = require('../stores/colorStore');
const router = express.Router();

router.get('/colors', (req, res) => {
  try {
    res.json(ColorStore.findAll());
  } catch {
    res.json([]);
  }
});

router.post('/colors', (req, res) => {
  try {
    const color = ColorStore.create(req.body);
    res.status(201).json(color);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/colors/:id', (req, res) => {
  try {
    const updated = ColorStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/colors/:id', (req, res) => {
  try {
    ColorStore.deleteOne(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
