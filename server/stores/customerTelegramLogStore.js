const { load, save, id } = require('./store');

function ensureCollection(db) {
  if (!Array.isArray(db.customerTelegramLogs)) {
    db.customerTelegramLogs = [];
  }
  return db.customerTelegramLogs;
}

function normalizeLogRecord(record = {}) {
  return {
    _id: String(record._id || id()).trim(),
    customerId: String(record.customerId || '').trim(),
    orderId: String(record.orderId || '').trim(),
    accessId: String(record.accessId || '').trim(),
    chatId: String(record.chatId || '').trim(),
    telegramUserId: String(record.telegramUserId || '').trim(),
    type: String(record.type || '').trim(),
    text: String(record.text || '').trim(),
    status: String(record.status || '').trim() || 'sent',
    errorMessage: String(record.errorMessage || '').trim(),
    meta: record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
      ? record.meta
      : {},
    createdAt: String(record.createdAt || '').trim() || new Date().toISOString(),
  };
}

const CustomerTelegramLogStore = {
  add(entry = {}) {
    const db = load();
    const logs = ensureCollection(db);
    const record = normalizeLogRecord(entry);
    logs.push(record);
    save();
    return record;
  },

  findAll({ customerId = '', orderId = '', accessId = '', limit = 100 } = {}) {
    const normalizedCustomerId = String(customerId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedAccessId = String(accessId || '').trim();
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

    return ensureCollection(load())
      .map(normalizeLogRecord)
      .filter((record) => {
        if (normalizedCustomerId && record.customerId !== normalizedCustomerId) return false;
        if (normalizedOrderId && record.orderId !== normalizedOrderId) return false;
        if (normalizedAccessId && record.accessId !== normalizedAccessId) return false;
        return true;
      })
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
      .slice(0, normalizedLimit);
  },
};

module.exports = CustomerTelegramLogStore;
