const express = require('express');
const ProcessStepStore = require('../stores/processStepStore');
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
  } catch {
    res.json([]);
  }
});

router.post('/processSteps', (req, res) => {
  try {
    const step = ProcessStepStore.create(req.body);
    res.status(201).json(step);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/processSteps/:id', (req, res) => {
  try {
    const updated = ProcessStepStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/processSteps/:id', (req, res) => {
  try {
    ProcessStepStore.deleteOne(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
