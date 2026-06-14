const { load, save } = require('./store');

function getDefaultSettings() {
  return {
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').trim() || `http://localhost:${process.env.PORT || 5000}`,
    telegramBotToken: '',
    selfUpdateEnabled: String(process.env.ENABLE_SELF_UPDATE || '').toLowerCase() === 'true',
    updateBranch: (process.env.UPDATE_BRANCH || '').trim() || 'main',
    updateRepositoryUrl: (process.env.UPDATE_REPOSITORY_URL || process.env.GIT_REMOTE_URL || '').trim(),
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
  };
}

const SettingsStore = {
  get() {
    const db = load();
    return normalizeSettings(db.settings || {});
  },

  update(updates) {
    const db = load();
    db.settings = normalizeSettings({
      ...(db.settings || {}),
      ...updates,
    });
    save();
    return db.settings;
  },
};

module.exports = SettingsStore;
