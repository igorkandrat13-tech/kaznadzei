const { id, load, save } = require('./store');

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeBridgeRecord(record = {}) {
  const createdAt = String(record.createdAt || '').trim() || new Date().toISOString();
  return {
    _id: String(record._id || id()).trim(),
    orderId: String(record.orderId || '').trim(),
    accessId: String(record.accessId || '').trim(),
    customerChatId: String(record.customerChatId || '').trim(),
    customerTelegramUserId: String(record.customerTelegramUserId || '').trim(),
    customerMessageId: normalizePositiveInteger(record.customerMessageId),
    topicChatId: String(record.topicChatId || '').trim(),
    topicThreadId: normalizePositiveInteger(record.topicThreadId),
    topicMessageId: normalizePositiveInteger(record.topicMessageId),
    employeeReplyMessageId: normalizePositiveInteger(record.employeeReplyMessageId),
    customerReplyMessageId: normalizePositiveInteger(record.customerReplyMessageId),
    createdAt,
    updatedAt: String(record.updatedAt || '').trim() || createdAt,
  };
}

function ensureCollection(db) {
  if (!Array.isArray(db.customerTelegramBridgeMessages)) {
    db.customerTelegramBridgeMessages = [];
  }
  return db.customerTelegramBridgeMessages;
}

const CustomerTelegramBridgeStore = {
  findAll() {
    return ensureCollection(load()).map(normalizeBridgeRecord);
  },

  create(payload = {}) {
    const db = load();
    const collection = ensureCollection(db);
    const record = normalizeBridgeRecord(payload);
    collection.push(record);
    save();
    return normalizeBridgeRecord(record);
  },

  findByTopicMessage({ topicChatId = '', topicThreadId = 0, topicMessageId = 0 } = {}) {
    const normalizedChatId = String(topicChatId || '').trim();
    const normalizedThreadId = normalizePositiveInteger(topicThreadId);
    const normalizedMessageId = normalizePositiveInteger(topicMessageId);
    if (!normalizedChatId || !normalizedThreadId || !normalizedMessageId) {
      return null;
    }
    return this.findAll().find((record) => (
      record.topicChatId === normalizedChatId
      && record.topicThreadId === normalizedThreadId
      && record.topicMessageId === normalizedMessageId
    )) || null;
  },

  markEmployeeReplySent(bridgeId, employeeReplyMessageId) {
    const normalizedBridgeId = String(bridgeId || '').trim();
    const normalizedReplyMessageId = normalizePositiveInteger(employeeReplyMessageId);
    if (!normalizedBridgeId || !normalizedReplyMessageId) return null;

    const db = load();
    const collection = ensureCollection(db);
    const record = collection.find((entry) => String(entry?._id || '').trim() === normalizedBridgeId);
    if (!record) return null;

    record.employeeReplyMessageId = normalizedReplyMessageId;
    record.updatedAt = new Date().toISOString();
    save();
    return normalizeBridgeRecord(record);
  },

  markCustomerReplySent(bridgeId, customerReplyMessageId) {
    const normalizedBridgeId = String(bridgeId || '').trim();
    const normalizedReplyMessageId = normalizePositiveInteger(customerReplyMessageId);
    if (!normalizedBridgeId || !normalizedReplyMessageId) return null;

    const db = load();
    const collection = ensureCollection(db);
    const record = collection.find((entry) => String(entry?._id || '').trim() === normalizedBridgeId);
    if (!record) return null;

    record.customerReplyMessageId = normalizedReplyMessageId;
    record.updatedAt = new Date().toISOString();
    save();
    return normalizeBridgeRecord(record);
  },
};

module.exports = CustomerTelegramBridgeStore;
