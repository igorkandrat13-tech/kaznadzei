const express = require('express');
const PermissionRoleStore = require('../stores/permissionRoleStore');
const UserStore = require('../stores/userStore');
const { requirePageAccess } = require('../middleware/security');

const router = express.Router();

function normalizeRoleName(value) {
  const s = String(value || '').trim();
  if (s.length < 3) throw new Error('Имя права должно содержать минимум 3 символа.');
  if (s.length > 50) throw new Error('Имя права должно содержать не более 50 символов.');
  return s;
}

function normalizePagesInput(source = {}) {
  return PermissionRoleStore.normalizePages(source || {});
}

function serializeRole(role) {
  const pages = PermissionRoleStore.normalizePages(role.pages);
  const pagesCount = Object.values(pages).filter(Boolean).length;
  const usersCount = UserStore.countByRoleId(role._id);
  return {
    _id: role._id,
    name: role.name,
    isSystem: Boolean(role.isSystem),
    pages,
    pagesCount,
    usersCount,
    createdAt: role.createdAt || '',
    updatedAt: role.updatedAt || '',
  };
}

router.get('/roles', requirePageAccess('users'), (req, res) => {
  try {
    const roles = PermissionRoleStore.findAll().map(serializeRole);
    res.json({ ok: true, roles });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message || 'Ошибка получения ролей.' });
  }
});

router.post('/roles', requirePageAccess('users'), (req, res) => {
  try {
    const name = normalizeRoleName(req.body?.name);
    const pages = normalizePagesInput(req.body?.pages || {});
    const created = PermissionRoleStore.create({ name, isSystem: false, pages });
    res.status(201).json({ ok: true, role: serializeRole(created) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось создать право.' });
  }
});

router.patch('/roles/:id', requirePageAccess('users'), (req, res) => {
  try {
    const roleId = String(req.params?.id || '');
    const existing = PermissionRoleStore.findById(roleId);
    if (!existing) return res.status(404).json({ ok: false, message: 'Право не найдено.' });
    if (existing.isSystem) return res.status(409).json({ ok: false, message: 'Невозможно редактировать системное право.' });
    const patch = {};
    if (req.body.name !== undefined) {
      patch.name = normalizeRoleName(req.body.name);
    }
    if (req.body.pages !== undefined) {
      patch.pages = normalizePagesInput(req.body.pages);
    }
    const updated = PermissionRoleStore.update(roleId, patch);
    res.json({ ok: true, role: serializeRole(updated) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось обновить право.' });
  }
});

router.delete('/roles/:id', requirePageAccess('users'), (req, res) => {
  try {
    const roleId = String(req.params?.id || '');
    const existing = PermissionRoleStore.findById(roleId);
    if (!existing) return res.status(404).json({ ok: false, message: 'Право не найдено.' });
    if (existing.isSystem) return res.status(409).json({ ok: false, message: 'Невозможно удалить системное право.' });
    const usersCount = UserStore.countByRoleId(roleId);
    if (usersCount > 0) {
      const plural = usersCount === 1 ? 'пользователь' : usersCount < 5 ? 'пользователя' : 'пользователей';
      return res.status(409).json({
        ok: false,
        message: `У этого права есть ${usersCount} ${plural} — переназначьте их, чтобы удалить право.`,
      });
    }
    PermissionRoleStore.delete(roleId);
    res.status(204).end();
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, message: error.message || 'Не удалось удалить право.' });
  }
});

module.exports = router;
module.exports._helpers = { serializeRole, normalizeRoleName, normalizePagesInput };
