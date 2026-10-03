const express = require('express');
const UserStore = require('../stores/userStore');
const PermissionRoleStore = require('../stores/permissionRoleStore');
const EmployeeStore = require('../stores/employeeStore');
const { requirePageAccess, getRequestSessionToken } = require('../middleware/security');
const { hashPassword, verifyAppSessionToken, authenticateUsernamePassword } = require('../services/appAuth');
const { syncAdminUserPasswordOnChange, SYSTEM_USERNAME, SYSTEM_ROLE_NAME } = require('../services/bootAuthSync');

const router = express.Router();

const USERNAME_REGEXP = /^[A-Za-z0-9._-]+$/;

function normalizeUsernameInput(value) {
  const s = String(value || '').trim();
  if (s.length < 3) throw new Error('Имя пользователя должно содержать минимум 3 символа.');
  if (s.length > 40) throw new Error('Имя пользователя должно содержать не более 40 символов.');
  if (!USERNAME_REGEXP.test(s)) throw new Error('Имя пользователя может содержать только латинские буквы, цифры, точки, дефисы и подчеркивания.');
  return s;
}

function normalizePasswordInputPair(pw1, pw2, { allowEmpty = false } = {}) {
  const a = pw1 === undefined || pw1 === null ? '' : String(pw1);
  const b = pw2 === undefined || pw2 === null ? '' : String(pw2);
  if (allowEmpty && !a && !b) return null;
  if (!a || !b) throw new Error('Заполните оба поля пароля.');
  if (a.length < 4) throw new Error('Пароль должен содержать минимум 4 символа.');
  if (a.length > 120) throw new Error('Пароль слишком длинный.');
  if (a !== b) throw new Error('Пароли не совпадают.');
  return a;
}

function serializeUser(user, { includePermissions = false } = {}) {
  const employee = user.employeeId ? EmployeeStore.findById(user.employeeId) : null;
  const role = user.roleId ? PermissionRoleStore.findById(user.roleId) : null;
  const out = {
    _id: user._id,
    username: user.username,
    employeeId: user.employeeId || null,
    employeeName: employee ? employee.fullName || employee.name || '' : '',
    roleId: user.roleId || null,
    roleName: role ? role.name : '',
    roleIsSystem: role ? Boolean(role.isSystem) : false,
    isSystem: Boolean(user.isSystem),
    pagesCount: role ? Object.values(role.pages || {}).filter(Boolean).length : 0,
    createdAt: user.createdAt || '',
    updatedAt: user.updatedAt || '',
  };
  if (includePermissions && role) {
    out.permissions = role.pages || PermissionRoleStore.normalizePages({});
    out.fullAccess = Boolean(role.isSystem);
  }
  return out;
}

function getCurrentUserFromReq(req) {
  try {
    const token = getRequestSessionToken(req);
    if (!token) return null;
    const payload = verifyAppSessionToken(token);
    return payload?.userId ? UserStore.findById(payload.userId) : null;
  } catch {
    return null;
  }
}

router.get('/users/me', (req, res) => {
  try {
    const current = getCurrentUserFromReq(req);
    if (!current) return res.status(401).json({ ok: false, message: 'Требуется вход по паролю.' });
    res.json({ ok: true, me: serializeUser(current, { includePermissions: true }) });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message || 'Ошибка получения профиля.' });
  }
});

router.get('/users', requirePageAccess('users'), (req, res) => {
  try {
    const users = UserStore.findAll().map(u => serializeUser(u));
    res.json({ ok: true, users });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message || 'Ошибка получения пользователей.' });
  }
});

router.post('/users', requirePageAccess('users'), (req, res) => {
  try {
    const username = normalizeUsernameInput(req.body?.username);
    const rawPassword = normalizePasswordInputPair(req.body?.password, req.body?.passwordConfirm);
    const roleId = String(req.body?.roleId || '').trim();
    const employeeId = req.body?.employeeId ? String(req.body.employeeId).trim() || null : null;

    if (!roleId) throw new Error('Выберите права пользователя (роль).');
    const role = PermissionRoleStore.findById(roleId);
    if (!role) throw new Error('Выбранная роль не существует.');

    if (employeeId) {
      const emp = EmployeeStore.findById(employeeId);
      if (!emp) throw new Error('Выбранный сотрудник не найден.');
    }

    const created = UserStore.create({
      username,
      passwordHash: hashPassword(rawPassword),
      roleId,
      employeeId,
      isSystem: false,
    });

    if (created.isSystem || created.username.toLowerCase() === SYSTEM_USERNAME.toLowerCase()) {
      syncAdminUserPasswordOnChange(created._id, created.passwordHash);
    }

    res.status(201).json({ ok: true, user: serializeUser(created) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось создать пользователя.' });
  }
});

router.patch('/users/:id', requirePageAccess('users'), (req, res) => {
  try {
    const userId = String(req.params?.id || '');
    const existing = UserStore.findById(userId);
    if (!existing) return res.status(404).json({ ok: false, message: 'Пользователь не найден.' });

    const patch = {};
    let usernameChanged = false;

    if (req.body.username !== undefined) {
      if (existing.isSystem) throw new Error('Невозможно изменить имя системного пользователя.');
      patch.username = normalizeUsernameInput(req.body.username);
      usernameChanged = true;
    }

    if (req.body.roleId !== undefined) {
      const newRoleId = String(req.body.roleId || '').trim();
      if (!newRoleId) throw new Error('Выберите права пользователя (роль).');
      const nextRole = PermissionRoleStore.findById(newRoleId);
      if (!nextRole) throw new Error('Выбранная роль не существует.');
      if (existing.isSystem && !nextRole.isSystem) throw new Error('Системный пользователь должен оставаться с ролью "Полные права".');
      patch.roleId = newRoleId;
    }

    if (req.body.employeeId !== undefined) {
      const employeeId = req.body.employeeId ? String(req.body.employeeId).trim() : null;
      if (employeeId) {
        const emp = EmployeeStore.findById(employeeId);
        if (!emp) throw new Error('Выбранный сотрудник не найден.');
      }
      patch.employeeId = employeeId;
    }

    const pair = normalizePasswordInputPair(req.body?.password, req.body?.passwordConfirm, { allowEmpty: true });
    if (pair) {
      patch.passwordHash = hashPassword(pair);
    }

    const updated = UserStore.update(userId, patch);

    if (updated && (existing.isSystem || String(updated.username || '').toLowerCase() === SYSTEM_USERNAME.toLowerCase())) {
      if (patch.passwordHash) {
        syncAdminUserPasswordOnChange(updated._id, patch.passwordHash);
      }
    }

    res.json({ ok: true, user: serializeUser(updated) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось обновить пользователя.' });
  }
});

router.delete('/users/:id', requirePageAccess('users'), (req, res) => {
  try {
    const userId = String(req.params?.id || '');
    const existing = UserStore.findById(userId);
    if (!existing) return res.status(404).json({ ok: false, message: 'Пользователь не найден.' });
    if (existing.isSystem) return res.status(409).json({ ok: false, message: 'Невозможно удалить системного пользователя.' });
    UserStore.delete(userId);
    res.status(204).end();
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, message: error.message || 'Не удалось удалить пользователя.' });
  }
});

module.exports = router;
module.exports._helpers = { normalizeUsernameInput, normalizePasswordInputPair, serializeUser };
