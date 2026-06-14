const { load, save } = require('./store');

function getDefaultSettings() {
  return {
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').trim() || `http://localhost:${process.env.PORT || 5000}`,
    telegramBotUrl: '',
    selfUpdateEnabled: String(process.env.ENABLE_SELF_UPDATE || '').toLowerCase() === 'true',
    updateBranch: (process.env.UPDATE_BRANCH || '').trim() || 'main',
  };
}

const SettingsStore = {
  get() {
    const db = load();
    return {
      ...getDefaultSettings(),
      ...(db.settings || {}),
    };
  },

  update(updates) {
    const db = load();
    db.settings = {
      ...getDefaultSettings(),
      ...(db.settings || {}),
      ...updates,
    };
    save();
    return db.settings;
  },
};

module.exports = SettingsStore;
