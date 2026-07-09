const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const { requireAdminAccess, requireManagerAccess, getRequestSettingsPinToken } = require('../middleware/security');
const {
  authenticateRolePassword,
  createAppSessionToken,
  createSettingsPinSessionToken,
  getPublicAuthConfig,
  hashPassword,
  verifySettingsPin,
  verifySettingsPinSessionToken,
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

function normalizePinInput(value, fieldLabel, { allowEmpty = false } = {}) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value || '').trim();
  if (!normalized) {
    if (allowEmpty) return '';
    throw new Error(`Поле "${fieldLabel}" не может быть пустым.`);
  }
  if (!/^\d{4,20}$/.test(normalized)) {
    throw new Error(`Поле "${fieldLabel}" должно содержать от 4 до 20 цифр.`);
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

router.get('/auth/settings-pin/status', requireAdminAccess(), (req, res) => {
  const authConfig = SettingsStore.getAuthConfig();
  let accessGranted = false;

  if (!authConfig.settingsPinHash) {
    accessGranted = true;
  } else {
    try {
      verifySettingsPinSessionToken(getRequestSettingsPinToken(req));
      accessGranted = true;
    } catch {
      accessGranted = false;
    }
  }

  res.json({
    ok: true,
    settingsPinConfigured: Boolean(authConfig.settingsPinHash),
    accessGranted,
  });
});

router.post('/auth/settings-pin/verify', requireAdminAccess(), (req, res) => {
  try {
    const authConfig = SettingsStore.getAuthConfig();
    if (!authConfig.settingsPinHash) {
      return res.json({
        ok: true,
        settingsPinConfigured: false,
        accessGranted: true,
        settingsPinToken: '',
      });
    }

    const pinCode = normalizePinInput(req.body?.pinCode, 'PIN-код настроек');
    verifySettingsPin(pinCode);
    const settingsPinToken = createSettingsPinSessionToken('admin');

    res.json({
      ok: true,
      settingsPinConfigured: true,
      accessGranted: true,
      settingsPinToken,
      message: 'Доступ к настройкам подтвержден.',
    });
  } catch (error) {
    res.status(401).json({ message: error.message || 'Не удалось подтвердить PIN-код настроек.' });
  }
});

router.put('/auth/settings-pin', requireAdminAccess(), (req, res) => {
  try {
    const nextPinCode = normalizePinInput(req.body?.settingsPin, 'PIN-код настроек', { allowEmpty: true });
    const shouldClear = Boolean(req.body?.clear);

    const updates = {
      settingsPinHash: shouldClear ? '' : hashPassword(nextPinCode),
    };

    if (!shouldClear && !nextPinCode) {
      return res.status(400).json({ message: 'Укажите новый PIN-код для настроек.' });
    }

    SettingsStore.updateAuthConfig(updates);
    res.json({
      ok: true,
      message: shouldClear ? 'PIN-код доступа к настройкам удален.' : 'PIN-код доступа к настройкам сохранен.',
      settingsPinToken: shouldClear ? '' : createSettingsPinSessionToken('admin'),
      ...getPublicAuthConfig(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сохранить PIN-код доступа к настройкам.' });
  }
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
