const express = require('express');
const RoleStore = require('../stores/roleStore');
const { requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { sanitizeRoleInput } = require('../utils/validators');

const router = express.Router();

router.get('/roles', (req, res) => {
  const includeDeleted = String(req.query?.includeDeleted || '').trim() === '1';
  res.json(RoleStore.findAll({ includeDeleted }));
});

router.post('/roles', requireAdminAccess(), (req, res) => {
  try {
    const role = RoleStore.create(sanitizeRoleInput(req.body || {}));
    addActivityLog({
      action: 'role.create',
      entityType: 'role',
      entityId: role.key,
      entityName: role.label,
      actor: getRequestActor(req),
      message: 'Производственная роль добавлена.',
      details: { role: role.key },
    });
    res.status(201).json(role);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/roles/:key', requireAdminAccess(), (req, res) => {
  try {
    const role = RoleStore.update(req.params.key, sanitizeRoleInput(req.body || {}, { partial: true }));
    if (!role) {
      return res.status(404).json({ message: 'Роль не найдена.' });
    }
    addActivityLog({
      action: 'role.update',
      entityType: 'role',
      entityId: role.key,
      entityName: role.label,
      actor: getRequestActor(req),
      message: 'Производственная роль обновлена.',
      details: { role: role.key },
    });
    res.json(role);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/roles/:key', requireAdminAccess(), (req, res) => {
  const role = RoleStore.softDelete(req.params.key);
  if (!role) {
    return res.status(404).json({ message: 'Роль не найдена.' });
  }
  addActivityLog({
    action: 'role.delete',
    entityType: 'role',
    entityId: role.key,
    entityName: role.label,
    actor: getRequestActor(req),
    message: 'Производственная роль помечена удаленной.',
    details: { role: role.key },
  });
  res.json(role);
});

router.post('/roles/:key/restore', requireAdminAccess(), (req, res) => {
  const role = RoleStore.restore(req.params.key);
  if (!role) {
    return res.status(404).json({ message: 'Роль не найдена.' });
  }
  addActivityLog({
    action: 'role.restore',
    entityType: 'role',
    entityId: role.key,
    entityName: role.label,
    actor: getRequestActor(req),
    message: 'Производственная роль восстановлена.',
    details: { role: role.key },
  });
  res.json(role);
});

module.exports = router;
