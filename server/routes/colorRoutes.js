const express = require('express');
const ColorStore = require('../stores/colorStore');
const { requireAdminAccess } = require('../middleware/security');
const { sanitizeColorInput } = require('../utils/validators');
const router = express.Router();

router.get('/colors', (req, res) => {
  try {
    res.json(ColorStore.findAll());
  } catch (error) {
    res.status(500).json({ message: error.message || 'Не удалось загрузить цвета.' });
  }
});

router.post('/colors', requireAdminAccess(), (req, res) => {
  try {
    const color = ColorStore.create(sanitizeColorInput(req.body || {}));
    res.status(201).json(color);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/colors/:id', requireAdminAccess(), (req, res) => {
  try {
    const updated = ColorStore.update(req.params.id, sanitizeColorInput(req.body || {}, { partial: true }));
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/colors/:id', requireAdminAccess(), (req, res) => {
  try {
    ColorStore.deleteOne(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
