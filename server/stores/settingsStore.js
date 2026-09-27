const crypto = require('crypto');
const { load, save } = require('./store');
const { getDefaultRoleLabels, getDefaultRoles, normalizeRoleLabels, normalizeRoles } = require('../config/roles');
const { getDefaultOrderStageLegendConfig, normalizeOrderStageLegendConfig } = require('../config/orderStageLegendConfig');

function getDefaultSettings() {
  return {
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').trim() || `http://localhost:${process.env.PORT || 5000}`,
    telegramBotToken: '',
    telegramSupplyBotToken: (process.env.TELEGRAM_SUPPLY_BOT_TOKEN || '').trim(),
    telegramSupergroupChatId: (process.env.TELEGRAM_SUPERGROUP_CHAT_ID || '').trim(),
    telegramSupergroupEnabled: String(process.env.TELEGRAM_SUPERGROUP_ENABLED || '').toLowerCase() === 'true',
    telegramStageNotificationEmployeeIds: [],
    telegramRequestNotificationEmployeeIds: [],
    selfUpdateEnabled: String(process.env.ENABLE_SELF_UPDATE || '').toLowerCase() === 'true',
    updateBranch: (process.env.UPDATE_BRANCH || '').trim() || 'main',
    updateRepositoryUrl: (process.env.UPDATE_REPOSITORY_URL || process.env.GIT_REMOTE_URL || '').trim(),
    adminPasswordHash: '',
    settingsPinHash: '',
    authSessionSecret: (process.env.APP_AUTH_SECRET || '').trim() || crypto.randomBytes(32).toString('hex'),
    strictStageOwnershipEnabled: false,
    roleLabels: getDefaultRoleLabels(),
    roles: getDefaultRoles(),
    orderStageLegendConfig: getDefaultOrderStageLegendConfig(),
  };
}

function normalizeSettings(source = {}) {
  const defaults = getDefaultSettings();
  const roles = normalizeRoles(source.roles ?? defaults.roles);
  const normalizeEmployeeIds = (raw) => {
    const ids = Array.isArray(raw) ? raw : [];
    return ids.map((item) => String(item || '').trim()).filter(Boolean);
  };
  return {
    publicBaseUrl: source.publicBaseUrl ?? defaults.publicBaseUrl,
    telegramBotToken: source.telegramBotToken ?? defaults.telegramBotToken,
    telegramSupplyBotToken: source.telegramSupplyBotToken ?? defaults.telegramSupplyBotToken,
    telegramSupergroupChatId: source.telegramSupergroupChatId ?? defaults.telegramSupergroupChatId,
    telegramSupergroupEnabled: source.telegramSupergroupEnabled ?? defaults.telegramSupergroupEnabled,
    telegramStageNotificationEmployeeIds: normalizeEmployeeIds(source.telegramStageNotificationEmployeeIds ?? defaults.telegramStageNotificationEmployeeIds),
    telegramRequestNotificationEmployeeIds: normalizeEmployeeIds(source.telegramRequestNotificationEmployeeIds ?? defaults.telegramRequestNotificationEmployeeIds),
    selfUpdateEnabled: source.selfUpdateEnabled ?? defaults.selfUpdateEnabled,
    updateBranch: source.updateBranch ?? defaults.updateBranch,
    updateRepositoryUrl: source.updateRepositoryUrl ?? defaults.updateRepositoryUrl,
    adminPasswordHash: source.adminPasswordHash ?? defaults.adminPasswordHash,
    settingsPinHash: source.settingsPinHash ?? defaults.settingsPinHash,
    authSessionSecret: source.authSessionSecret ?? defaults.authSessionSecret,
    strictStageOwnershipEnabled: source.strictStageOwnershipEnabled ?? defaults.strictStageOwnershipEnabled,
    roleLabels: roles.reduce((acc, role) => {
      acc[role.key] = role.label;
      return acc;
    }, normalizeRoleLabels(source.roleLabels ?? defaults.roleLabels)),
    roles,
    orderStageLegendConfig: normalizeOrderStageLegendConfig(source.orderStageLegendConfig ?? defaults.orderStageLegendConfig),
  };
}

function toPublicSettings(source = {}) {
  const normalizeEmployeeIds = (raw) => {
    const ids = Array.isArray(raw) ? raw : [];
    return ids.map((item) => String(item || '').trim()).filter(Boolean);
  };
  return {
    publicBaseUrl: source.publicBaseUrl || '',
    telegramBotToken: source.telegramBotToken || '',
    telegramSupplyBotToken: source.telegramSupplyBotToken || '',
    telegramSupergroupChatId: source.telegramSupergroupChatId || '',
    telegramSupergroupEnabled: Boolean(source.telegramSupergroupEnabled),
    telegramStageNotificationEmployeeIds: normalizeEmployeeIds(source.telegramStageNotificationEmployeeIds),
    telegramRequestNotificationEmployeeIds: normalizeEmployeeIds(source.telegramRequestNotificationEmployeeIds),
    selfUpdateEnabled: Boolean(source.selfUpdateEnabled),
    updateBranch: source.updateBranch || 'main',
    updateRepositoryUrl: source.updateRepositoryUrl || '',
    strictStageOwnershipEnabled: Boolean(source.strictStageOwnershipEnabled),
    roleLabels: normalizeRoleLabels(source.roleLabels || {}),
    roles: normalizeRoles(source.roles || []),
    orderStageLegendConfig: normalizeOrderStageLegendConfig(source.orderStageLegendConfig || {}),
  };
}

function getPersistedNormalizedSettings(db) {
  const currentSettings = db.settings || {};
  const nextSettings = normalizeSettings(currentSettings);
  if (JSON.stringify(currentSettings) !== JSON.stringify(nextSettings)) {
    db.settings = nextSettings;
    save();
    return normalizeSettings(db.settings || {});
  }
  db.settings = nextSettings;
  return nextSettings;
}

const SettingsStore = {
  get() {
    const db = load();
    return toPublicSettings(getPersistedNormalizedSettings(db));
  },

  getWithSecrets() {
    const db = load();
    return { ...getPersistedNormalizedSettings(db) };
  },

  getAuthConfig() {
    const settings = this.getWithSecrets();
    return {
      adminPasswordHash: settings.adminPasswordHash || '',
      settingsPinHash: settings.settingsPinHash || '',
      authSessionSecret: settings.authSessionSecret || '',
    };
  },

  update(updates) {
    const db = load();
    const nextSettings = normalizeSettings({
      ...normalizeSettings(db.settings || {}),
      ...updates,
    });
    db.settings = nextSettings;
    save();
    return toPublicSettings(nextSettings);
  },

  updateAuthConfig(updates) {
    const db = load();
    const nextSettings = normalizeSettings({
      ...normalizeSettings(db.settings || {}),
      ...updates,
    });
    db.settings = nextSettings;
    save();
    return this.getAuthConfig();
  },
};

module.exports = SettingsStore;
