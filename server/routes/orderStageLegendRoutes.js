const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const { requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { normalizeOrderStageLegendConfig } = require('../config/orderStageLegendConfig');

const router = express.Router();

router.get('/order-stage-legend-config', (req, res) => {
  try {
    const settings = SettingsStore.get();
    res.json(normalizeOrderStageLegendConfig(settings.orderStageLegendConfig || {}));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Не удалось загрузить конфигурацию легенды этапов.' });
  }
});

router.put('/order-stage-legend-config', requireAdminAccess(), (req, res) => {
  try {
    const nextConfig = normalizeOrderStageLegendConfig(req.body || {});
    const settings = SettingsStore.update({ orderStageLegendConfig: nextConfig });
    addActivityLog({
      action: 'settings.order-stage-legend.update',
      entityType: 'settings',
      entityName: 'Легенда этапов заказов',
      actor: getRequestActor(req),
      message: 'Конфигурация легенды этапов обновлена.',
      details: {
        stageKeys: nextConfig.stages.map((item) => item.key),
        secondaryHeaders: nextConfig.secondaryHeaders.length,
      },
    });
    res.json(settings.orderStageLegendConfig || nextConfig);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сохранить конфигурацию легенды этапов.' });
  }
});

module.exports = router;
