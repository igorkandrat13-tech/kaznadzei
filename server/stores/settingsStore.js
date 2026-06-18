const crypto = require('crypto');
const { load, save } = require('./store');

function getDefaultSettings() {
  return {
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').trim() || `http://localhost:${process.env.PORT || 5000}`,
    telegramBotToken: '',
    selfUpdateEnabled: String(process.env.ENABLE_SELF_UPDATE || '').toLowerCase() === 'true',
    updateBranch: (process.env.UPDATE_BRANCH || '').trim() || 'main',
    updateRepositoryUrl: (process.env.UPDATE_REPOSITORY_URL || process.env.GIT_REMOTE_URL || '').trim(),
    adminPasswordHash: '',
    managerPasswordHash: '',
    authSessionSecret: (process.env.APP_AUTH_SECRET || '').trim() || crypto.randomBytes(32).toString('hex'),
  };
}

function normalizeSettings(source = {}) {
  const defaults = getDefaultSettings();
  return {
    publicBaseUrl: source.publicBaseUrl ?? defaults.publicBaseUrl,
    telegramBotToken: source.telegramBotToken ?? defaults.telegramBotToken,
    selfUpdateEnabled: source.selfUpdateEnabled ?? defaults.selfUpdateEnabled,
    updateBranch: source.updateBranch ?? defaults.updateBranch,
    updateRepositoryUrl: source.updateRepositoryUrl ?? defaults.updateRepositoryUrl,
    adminPasswordHash: source.adminPasswordHash ?? defaults.adminPasswordHash,
    managerPasswordHash: source.managerPasswordHash ?? defaults.managerPasswordHash,
    authSessionSecret: source.authSessionSecret ?? defaults.authSessionSecret,
  };
}

function toPublicSettings(source = {}) {
  return {
    publicBaseUrl: source.publicBaseUrl || '',
    telegramBotToken: source.telegramBotToken || '',
    selfUpdateEnabled: Boolean(source.selfUpdateEnabled),
    updateBranch: source.updateBranch || 'main',
    updateRepositoryUrl: source.updateRepositoryUrl || '',
  };
}

const SettingsStore = {
  get() {
    const db = load();
    db.settings = normalizeSettings(db.settings || {});
    return toPublicSettings(db.settings);
  },

  getWithSecrets() {
    const db = load();
    db.settings = normalizeSettings(db.settings || {});
    return { ...db.settings };
  },

  getAuthConfig() {
    const settings = this.getWithSecrets();
    return {
      adminPasswordHash: settings.adminPasswordHash || '',
      managerPasswordHash: settings.managerPasswordHash || '',
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
