const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const { requireWriteAccess } = require('../middleware/security');
const { sanitizeSettingsInput } = require('../utils/validators');

const router = express.Router();

router.get('/settings', requireWriteAccess, (req, res) => {
  res.json(SettingsStore.get());
});

router.put('/settings', requireWriteAccess, (req, res) => {
  try {
    const updates = sanitizeSettingsInput(req.body || {});
    const settings = SettingsStore.update(updates);
    res.json(settings);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
