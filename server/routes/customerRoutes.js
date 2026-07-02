const express = require('express');
const CustomerStore = require('../stores/customerStore');
const { requireManagerAccess, requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { sanitizeCustomerInput } = require('../utils/validators');

const router = express.Router();

router.get('/customers', requireManagerAccess(), (req, res) => {
  res.json(CustomerStore.findAll());
});

router.post('/customers', requireManagerAccess(), (req, res) => {
  try {
    const customer = CustomerStore.create(sanitizeCustomerInput(req.body || {}));
    addActivityLog({
      action: 'customer.create',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.fullName || '',
      actor: getRequestActor(req),
      message: 'Карточка заказчика создана.',
      details: {},
    });
    res.status(201).json(customer);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/customers/:id', requireManagerAccess(), (req, res) => {
  try {
    const updates = sanitizeCustomerInput(req.body || {}, { partial: true });
    const customer = CustomerStore.update(req.params.id, updates);
    if (!customer) {
      return res.status(404).json({ message: 'Заказчик не найден.' });
    }
    addActivityLog({
      action: 'customer.update',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.fullName || '',
      actor: getRequestActor(req),
      message: 'Карточка заказчика обновлена.',
      details: { changedFields: Object.keys(updates) },
    });
    res.json(customer);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/customers/:id', requireAdminAccess(), (req, res) => {
  const customer = CustomerStore.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }
  const deleted = CustomerStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }
  addActivityLog({
    action: 'customer.delete',
    entityType: 'customer',
    entityId: customer._id,
    entityName: customer.fullName || '',
    actor: getRequestActor(req),
    message: 'Карточка заказчика удалена.',
    details: {},
  });
  res.json({ ok: true });
});

module.exports = router;
