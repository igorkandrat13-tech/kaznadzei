const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const UserStore = require('../stores/userStore');
const PermissionRoleStore = require('../stores/permissionRoleStore');
const EmployeeStore = require('../stores/employeeStore');
const {
  requireAdminAccess,
  requireManagerAccess,
  requirePageAccess,
  getRequestSessionToken,
} = require('../middleware/security');
const {
  authenticateRolePassword,
  authenticateUsernamePassword,
  createAppSessionToken,
  createAppSessionTokenForEmployee,
  createAppSessionTokenForUser,
  getEmployeeRolePages,
  getPublicAuthConfig,
  hashPassword,
  verifyAppSessionToken,
} = require('../services/appAuth');
const { verifyTelegramEmployeeSessionToken } = require('../services/telegramWebAppAuth');
const LoginLockout = require('../services/loginLockout');
const {
  ensureSystemFullAccessRole,
  ensureAdministratorUserFromAdminPasswordHash,
  syncAdministratorPasswordHashBiDirection,
  SYSTEM_USERNAME,
  syncAdminUserPasswordOnChange,
} = require('../services/bootAuthSync');

const router = express.Router();

function normalizePasswordInput(value, fieldLabel, { allowEmpty = false, min = 4, max = 120 } = {}) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  if (!normalized) {
    if (allowEmpty) return '';
    throw new Error(`Поле "${fieldLabel}" не может быть пустым.`);
  }
  if (normalized.length < min) {
    throw new Error(`Поле "${fieldLabel}" должно содержать минимум ${min} символа.`);
  }
  if (normalized.length > max) {
    throw new Error(`Поле "${fieldLabel}" слишком длинное.`);
  }
  return normalized;
}

function getMeFromSession(req) {
  try {
    const token = getRequestSessionToken(req);
    if (!token) return null;
    const payload = verifyAppSessionToken(token);
    if (payload?.userId) {
      const user = UserStore.findById(payload.userId);
      if (!user) return null;
      const employee = user.employeeId ? EmployeeStore.findById(user.employeeId) : null;
      const role = user.roleId ? PermissionRoleStore.findById(user.roleId) : null;
      return {
        userId: user._id,
        username: user.username,
        employeeId: user.employeeId || null,
        employeeName: employee ? (employee.fullName || employee.name || '') : '',
        role: role
          ? {
              _id: role._id,
              name: role.name,
              pages: role.pages || PermissionRoleStore.normalizePages({}),
              isSystem: Boolean(role.isSystem),
            }
          : null,
        fullAccess: Boolean(payload.fullAccess),
        permissions: payload.permissions || PermissionRoleStore.normalizePages({}),
      };
    }
    if (payload?.employeeId) {
      const employee = EmployeeStore.findById(payload.employeeId);
      const permissions = payload.permissions || PermissionRoleStore.normalizePages({});
      return {
        userId: '',
        username: '',
        employeeId: payload.employeeId,
        employeeName: employee ? (employee.fullName || employee.name || '') : (payload.employeeName || ''),
        employeeRole: employee ? String(employee.role || '') : String(payload.roleKey || '').replace(/^employee:/, ''),
        role: {
          _id: '',
          name: employee ? String(employee.role || '') : String(payload.roleKey || '').replace(/^employee:/, ''),
          pages: permissions,
          isSystem: false,
        },
        fullAccess: Boolean(payload.fullAccess),
        permissions,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function getConfiguredBotToken(botKind = 'primary') {
  const normalized = botKind === 'supply' ? 'supply' : 'primary';
  const settings = SettingsStore.get();
  return normalized === 'supply'
    ? String(settings.telegramSupplyBotToken || '').trim()
    : String(settings.telegramBotToken || '').trim();
}

router.post('/auth/employee-login', express.json({ limit: '16kb' }), (req, res) => {
  try {
    const employeeSessionToken = String((req.body || {}).sessionToken || '').trim();
    if (!employeeSessionToken) {
      return res.status(400).json({ ok: false, message: 'Не передан sessionToken сотрудника.' });
    }
    let payload = null;
    const primaryToken = getConfiguredBotToken('primary');
    const supplyToken = getConfiguredBotToken('supply');
    for (const botToken of [primaryToken, supplyToken]) {
      if (!botToken) continue;
      try {
        payload = verifyTelegramEmployeeSessionToken(botToken, employeeSessionToken);
        break;
      } catch (_err) {
        payload = null;
      }
    }
    if (!payload) {
      return res.status(401).json({ ok: false, message: 'Session token сотрудника не прошёл проверку. Откройте ссылку из бота заново.' });
    }
    const employee = EmployeeStore.findById(payload.employeeId);
    if (!employee) {
      return res.status(404).json({ ok: false, message: 'Сотрудник не найден в системе. Обратитесь к администратору.' });
    }
    const sessionToken = createAppSessionTokenForEmployee(employee);
    const pages = getEmployeeRolePages(employee.role);
    const pagesCount = Object.values(pages).filter(Boolean).length;
    res.json({
      ok: true,
      sessionToken,
      role: 'manager',
      bootstrapUsed: false,
      me: {
        userId: '',
        username: '',
        employeeId: employee._id,
        employeeName: employee.fullName || employee.name || '',
        employeeRole: String(employee.role || ''),
        fullAccess: false,
        pagesCount,
        role: {
          _id: '',
          name: String(employee.role || ''),
          pages,
          isSystem: false,
        },
      },
      permissions: pages,
    });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, message: error.message || 'Не удалось выполнить вход сотрудника.' });
  }
});

router.get('/auth/config', (req, res) => {
  res.json(getPublicAuthConfig());
});

router.post('/auth/setup', (req, res) => {
  try {
    const authConfig = SettingsStore.getAuthConfig();
    const existingAdmin = UserStore.findByUsername(SYSTEM_USERNAME);
    if (authConfig.adminPasswordHash || existingAdmin) {
      return res.status(409).json({
        ok: false,
        message: 'Первичная настройка уже выполнена. Для изменения пароля используйте раздел "Пользователи".',
      });
    }
    const adminPassword = normalizePasswordInput(req.body?.adminPassword, 'Пароль администратора', { min: 4 });
    const confirmPassword = normalizePasswordInput(req.body?.passwordConfirm || req.body?.adminPassword, 'Подтвердите пароль', { min: 4 });
    if (adminPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: 'Пароли не совпадают.' });
    }
    const hashed = hashPassword(adminPassword);
    SettingsStore.updateAuthConfig({ adminPasswordHash: hashed });
    const { role } = ensureSystemFullAccessRole();
    const adminUser = UserStore.create({
      username: SYSTEM_USERNAME,
      passwordHash: hashed,
      employeeId: null,
      roleId: role._id,
      isSystem: true,
    });
    syncAdministratorPasswordHashBiDirection(adminUser._id);
    const sessionToken = createAppSessionTokenForUser(adminUser, role);
    res.json({
      ok: true,
      role: 'admin',
      sessionToken,
      me: {
        userId: adminUser._id,
        username: adminUser.username,
        fullAccess: true,
        role: { name: role.name, isSystem: true, pages: role.pages },
      },
      message: 'Пароль администратора сохранен.',
      ...getPublicAuthConfig(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось выполнить первичную настройку пароля.' });
  }
});

router.post('/auth/login', (req, res) => {
  try {
    const lockState = LoginLockout.isLockedOutRequest(req);
    if (lockState.locked) {
      return res.status(423).json({
        ok: false,
        message: `Слишком много неудачных попыток. Повторите через ${Math.ceil(lockState.lockRemainingMs / 1000)} секунд.`,
        lockSecondsRemaining: Math.ceil(lockState.lockRemainingMs / 1000),
        lockUntilMs: Date.now() + lockState.lockRemainingMs,
      });
    }

    const hasRoleField = req.body && ('role' in req.body);
    if (hasRoleField) {
      LoginLockout.recordFailedAttemptRequest(req);
      return res.status(400).json({
        ok: false,
        message: 'Схема входа обновлена — используйте Имя пользователя и Пароль.',
      });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    let authResult = null;
    try {
      authResult = authenticateUsernamePassword(username, password);
    } catch (authError) {
      LoginLockout.recordFailedAttemptRequest(req);
      const nextLock = LoginLockout.isLockedOutRequest(req);
      if (nextLock.locked) {
        return res.status(423).json({
          ok: false,
          message: authError.message || 'Неверное имя пользователя или пароль.',
          lockSecondsRemaining: Math.ceil(nextLock.lockRemainingMs / 1000),
          lockUntilMs: Date.now() + nextLock.lockRemainingMs,
        });
      }
      return res.status(401).json({ ok: false, message: authError.message || 'Неверное имя пользователя или пароль.' });
    }

    if (!authResult.role) {
      LoginLockout.recordFailedAttemptRequest(req);
      return res.status(401).json({ ok: false, message: 'Для пользователя не настроены права доступа.' });
    }

    LoginLockout.recordSuccessfulLoginRequest(req);
    const sessionToken = createAppSessionTokenForUser(authResult.user, authResult.role);
    const EmployeeStore = require('../stores/employeeStore');
    const employee = authResult.user.employeeId ? EmployeeStore.findById(authResult.user.employeeId) : null;
    res.json({
      ok: true,
      sessionToken,
      role: authResult.role.isSystem ? 'admin' : 'manager',
      bootstrapUsed: false,
      me: {
        userId: authResult.user._id,
        username: authResult.user.username,
        employeeId: authResult.user.employeeId || null,
        employeeName: employee ? (employee.fullName || employee.name || '') : '',
        fullAccess: Boolean(authResult.role.isSystem),
        role: {
          _id: authResult.role._id,
          name: authResult.role.name,
          isSystem: Boolean(authResult.role.isSystem),
          pages: authResult.role.pages,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message || 'Не удалось выполнить вход.' });
  }
});

router.get('/auth/session', requireManagerAccess(), (req, res) => {
  const me = getMeFromSession(req);
  res.json({
    ok: true,
    role: req.auth?.role || (me?.fullAccess ? 'admin' : 'manager'),
    me,
  });
});

router.put('/auth/passwords', requireAdminAccess(), (req, res) => {
  res.status(501).json({
    ok: false,
    message: 'Используйте раздел "Пользователи" для смены паролей.',
    help: 'PATCH /api/users/:id с полями password и passwordConfirm.',
  });
});

module.exports = router;
module.exports._helpers = { normalizePasswordInput, getMeFromSession };
