const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const { requireAdminAccess, requireManagerAccess } = require('../middleware/security');
const {
  authenticateRolePassword,
  createAppSessionToken,
  getPublicAuthConfig,
  hashPassword,
} = require('../services/appAuth');

const router = express.Router();

function normalizePasswordInput(value, fieldLabel) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Поле "${fieldLabel}" не может быть пустым.`);
  }
  if (normalized.length < 4) {
    throw new Error(`Поле "${fieldLabel}" должно содержать минимум 4 символа.`);
  }
  if (normalized.length > 120) {
    throw new Error(`Поле "${fieldLabel}" слишком длинное.`);
  }
  return normalized;
}

router.get('/auth/config', (req, res) => {
  res.json(getPublicAuthConfig());
});

router.post('/auth/setup', (req, res) => {
  try {
    const authConfig = SettingsStore.getAuthConfig();
    if (authConfig.adminPasswordHash) {
      return res.status(409).json({
        message: 'Первичная настройка уже выполнена. Для изменения пароля используйте админ-панель.',
      });
    }

    const adminPassword = normalizePasswordInput(req.body?.adminPassword, 'Пароль администратора');

    SettingsStore.updateAuthConfig({
      adminPasswordHash: hashPassword(adminPassword),
    });

    const sessionToken = createAppSessionToken('admin');
    res.json({
      ok: true,
      role: 'admin',
      sessionToken,
      message: 'Пароль администратора сохранен.',
      ...getPublicAuthConfig(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось выполнить первичную настройку пароля.' });
  }
});

router.post('/auth/login', (req, res) => {
  try {
    const role = String(req.body?.role || '').trim();
    const password = String(req.body?.password || '');
    const authResult = authenticateRolePassword(role, password);
    const sessionToken = createAppSessionToken(authResult.role);

    res.json({
      ok: true,
      sessionToken,
      role: authResult.role,
      bootstrapUsed: Boolean(authResult.bootstrapUsed),
    });
  } catch (error) {
    res.status(401).json({ message: error.message || 'Не удалось выполнить вход.' });
  }
});

router.get('/auth/session', requireManagerAccess(), (req, res) => {
  res.json({
    ok: true,
    role: req.auth?.role || '',
  });
});

router.put('/auth/passwords', requireAdminAccess(), (req, res) => {
  try {
    const adminPassword = normalizePasswordInput(req.body?.adminPassword, 'Пароль администратора');

    if (adminPassword === undefined) {
      return res.status(400).json({ message: 'Укажите пароль администратора для обновления.' });
    }

    const updates = {};
    if (adminPassword !== undefined) {
      updates.adminPasswordHash = hashPassword(adminPassword);
    }

    SettingsStore.updateAuthConfig(updates);
    res.json({
      ok: true,
      message: 'Пароль администратора обновлен.',
      ...getPublicAuthConfig(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось обновить пароль администратора.' });
  }
});

module.exports = router;
