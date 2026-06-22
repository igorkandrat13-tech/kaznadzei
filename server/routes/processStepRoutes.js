const express = require('express');
const ProcessStepStore = require('../stores/processStepStore');
const OrderStore = require('../stores/orderStore');
const RoleStore = require('../stores/roleStore');
const { requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { sanitizeProcessStepInput } = require('../utils/validators');
const router = express.Router();

router.get('/processSteps', (req, res) => {
  try {
    const { role } = req.query;
    const steps = role
      ? ProcessStepStore.findByRole(role)
      : ProcessStepStore.findAll().sort((a, b) => {
          const roles = RoleStore.findAll({ includeDeleted: true }).map(item => item.key);
          const oa = roles.indexOf(a.role);
          const ob = roles.indexOf(b.role);
          if (oa !== ob) return oa - ob;
          return a.order - b.order;
        });
    res.json(steps);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Не удалось загрузить этапы.' });
  }
});

router.post('/processSteps', requireAdminAccess(), (req, res) => {
  try {
    const step = ProcessStepStore.create(sanitizeProcessStepInput(req.body || {}));
    OrderStore.syncStagesWithProcessSteps();
    addActivityLog({
      action: 'process-step.create',
      entityType: 'processStep',
      entityId: step._id,
      entityName: step.stepName || '',
      actor: getRequestActor(req),
      message: 'Добавлен этап производства.',
      details: { role: step.role || '', order: step.order || 0 },
    });
    res.status(201).json(step);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.patch('/processSteps/:id', requireAdminAccess(), (req, res) => {
  try {
    const updates = sanitizeProcessStepInput(req.body || {}, { partial: true });
    const updated = ProcessStepStore.update(req.params.id, updates);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    OrderStore.syncStagesWithProcessSteps();
    addActivityLog({
      action: 'process-step.update',
      entityType: 'processStep',
      entityId: updated._id,
      entityName: updated.stepName || '',
      actor: getRequestActor(req),
      message: 'Этап производства обновлен.',
      details: { changedFields: Object.keys(updates) },
    });
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/processSteps/:id', requireAdminAccess(), (req, res) => {
  try {
    const existingStep = ProcessStepStore.findAll().find(item => item._id === req.params.id);
    const deleted = ProcessStepStore.deleteOne(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    OrderStore.syncStagesWithProcessSteps();
    addActivityLog({
      action: 'process-step.delete',
      entityType: 'processStep',
      entityId: req.params.id,
      entityName: existingStep?.stepName || '',
      actor: getRequestActor(req),
      message: 'Этап производства удален.',
      details: { role: existingStep?.role || '' },
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
