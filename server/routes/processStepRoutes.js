const express = require('express');
const ProcessStepStore = require('../stores/processStepStore');
const OrderStore = require('../stores/orderStore');
const { requireWriteAccess } = require('../middleware/security');
const { sanitizeProcessStepInput } = require('../utils/validators');
const router = express.Router();

router.get('/processSteps', (req, res) => {
  try {
    const { role } = req.query;
    const steps = role
      ? ProcessStepStore.findByRole(role)
      : ProcessStepStore.findAll().sort((a, b) => {
          const roles = ['carpenter', 'assembler', 'painter', 'designer'];
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

router.post('/processSteps', requireWriteAccess, (req, res) => {
  try {
    const step = ProcessStepStore.create(sanitizeProcessStepInput(req.body || {}));
    OrderStore.syncStagesWithProcessSteps();
    res.status(201).json(step);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.patch('/processSteps/:id', requireWriteAccess, (req, res) => {
  try {
    const updated = ProcessStepStore.update(req.params.id, sanitizeProcessStepInput(req.body || {}, { partial: true }));
    if (!updated) return res.status(404).json({ message: 'Not found' });
    OrderStore.syncStagesWithProcessSteps();
    res.json(updated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/processSteps/:id', requireWriteAccess, (req, res) => {
  try {
    const deleted = ProcessStepStore.deleteOne(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    OrderStore.syncStagesWithProcessSteps();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
