const express = require('express');
const ColorStore = require('../stores/colorStore');
const { requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
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
    addActivityLog({
      action: 'color.create',
      entityType: 'color',
      entityId: color._id,
      entityName: color.name || '',
      actor: getRequestActor(req),
      message: 'Добавлен цвет.',
      details: { hex: color.hex || '' },
    });
    res.status(201).json(color);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/colors/:id', requireAdminAccess(), (req, res) => {
  try {
    const updates = sanitizeColorInput(req.body || {}, { partial: true });
    const updated = ColorStore.update(req.params.id, updates);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    addActivityLog({
      action: 'color.update',
      entityType: 'color',
      entityId: updated._id,
      entityName: updated.name || '',
      actor: getRequestActor(req),
      message: 'Цвет обновлен.',
      details: { changedFields: Object.keys(updates) },
    });
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/colors/:id', requireAdminAccess(), (req, res) => {
  try {
    const color = ColorStore.findAll().find(item => item._id === req.params.id);
    ColorStore.deleteOne(req.params.id);
    addActivityLog({
      action: 'color.delete',
      entityType: 'color',
      entityId: req.params.id,
      entityName: color?.name || '',
      actor: getRequestActor(req),
      message: 'Цвет удален.',
      details: { hex: color?.hex || '' },
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
