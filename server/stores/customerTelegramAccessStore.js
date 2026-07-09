const { load, save, id } = require('./store');
const { hashPassword, verifyPassword } = require('../services/appAuth');

const PENDING_LINK_TTL_MS = 30 * 60 * 1000;

function normalizeUsername(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.startsWith('@') ? normalized : `@${normalized.replace(/^@+/, '')}`;
}

function normalizeAccessStatus(value = '') {
  return String(value || '').trim() === 'revoked'
    ? 'revoked'
    : 'active';
}

function normalizeAccessRecord(record = {}) {
  const createdAt = String(record.createdAt || '').trim() || new Date().toISOString();
  return {
    _id: String(record._id || id()).trim(),
    customerId: String(record.customerId || '').trim(),
    orderId: String(record.orderId || '').trim(),
    accessToken: String(record.accessToken || '').trim(),
    pinHash: String(record.pinHash || '').trim(),
    pinLast4: String(record.pinLast4 || '').trim(),
    status: normalizeAccessStatus(record.status),
    createdAt,
    updatedAt: String(record.updatedAt || '').trim() || createdAt,
    lastIssuedAt: String(record.lastIssuedAt || '').trim() || createdAt,
    revokedAt: String(record.revokedAt || '').trim(),
    telegramUserId: String(record.telegramUserId || '').trim(),
    telegramChatId: String(record.telegramChatId || '').trim(),
    telegramUsername: normalizeUsername(record.telegramUsername || ''),
    telegramFirstName: String(record.telegramFirstName || '').trim(),
    telegramLastName: String(record.telegramLastName || '').trim(),
    telegramLinkedAt: String(record.telegramLinkedAt || '').trim(),
    telegramLastSeenAt: String(record.telegramLastSeenAt || '').trim(),
    pendingLinkChatId: String(record.pendingLinkChatId || '').trim(),
    pendingLinkTelegramUserId: String(record.pendingLinkTelegramUserId || '').trim(),
    pendingLinkIssuedAt: String(record.pendingLinkIssuedAt || '').trim(),
  };
}

function ensureCollection(db) {
  if (!Array.isArray(db.customerTelegramAccesses)) {
    db.customerTelegramAccesses = [];
  }
  return db.customerTelegramAccesses;
}

function getAccessAgeMs(access = {}) {
  const issuedAt = Date.parse(String(access.pendingLinkIssuedAt || '').trim());
  if (Number.isNaN(issuedAt)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Date.now() - issuedAt;
}

function isPendingLinkActive(access = {}) {
  return Boolean(
    String(access.pendingLinkChatId || '').trim()
    && String(access.pendingLinkTelegramUserId || '').trim()
    && getAccessAgeMs(access) <= PENDING_LINK_TTL_MS
  );
}

function clearPendingLink(access) {
  access.pendingLinkChatId = '';
  access.pendingLinkTelegramUserId = '';
  access.pendingLinkIssuedAt = '';
}

function findMatchingAccess(accesses = [], matcher) {
  return accesses
    .map(normalizeAccessRecord)
    .find((access) => matcher(access)) || null;
}

const CustomerTelegramAccessStore = {
  findAll({ includeRevoked = false } = {}) {
    return ensureCollection(load())
      .map(normalizeAccessRecord)
      .filter((access) => includeRevoked || access.status === 'active');
  },

  findById(accessId, { includeRevoked = false } = {}) {
    const normalizedAccessId = String(accessId || '').trim();
    if (!normalizedAccessId) return null;
    return findMatchingAccess(this.findAll({ includeRevoked }), (access) => access._id === normalizedAccessId);
  },

  findByCustomerId(customerId, { includeRevoked = false } = {}) {
    const normalizedCustomerId = String(customerId || '').trim();
    return this.findAll({ includeRevoked }).filter((access) => access.customerId === normalizedCustomerId);
  },

  findByOrderId(orderId, { includeRevoked = false } = {}) {
    const normalizedOrderId = String(orderId || '').trim();
    return this.findAll({ includeRevoked }).filter((access) => access.orderId === normalizedOrderId);
  },

  findByCustomerAndOrder(customerId, orderId, { includeRevoked = false } = {}) {
    const normalizedCustomerId = String(customerId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    return findMatchingAccess(this.findAll({ includeRevoked }), (access) => (
      access.customerId === normalizedCustomerId
      && access.orderId === normalizedOrderId
    ));
  },

  findByAccessToken(accessToken) {
    const normalizedAccessToken = String(accessToken || '').trim();
    if (!normalizedAccessToken) return null;
    return findMatchingAccess(this.findAll(), (access) => access.accessToken === normalizedAccessToken);
  },

  findLinkedByTelegramUserId(telegramUserId) {
    const normalizedTelegramUserId = String(telegramUserId || '').trim();
    if (!normalizedTelegramUserId) return [];
    return this.findAll().filter((access) => access.telegramUserId === normalizedTelegramUserId);
  },

  findLinkedByTelegramChatId(chatId) {
    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedChatId) return [];
    return this.findAll().filter((access) => access.telegramChatId === normalizedChatId);
  },

  findPendingByTelegramContext({ chatId, telegramUserId } = {}) {
    const normalizedChatId = String(chatId || '').trim();
    const normalizedTelegramUserId = String(telegramUserId || '').trim();
    if (!normalizedChatId || !normalizedTelegramUserId) return null;
    return findMatchingAccess(this.findAll(), (access) => (
      access.pendingLinkChatId === normalizedChatId
      && access.pendingLinkTelegramUserId === normalizedTelegramUserId
      && isPendingLinkActive(access)
    ));
  },

  issueAccess({ customerId, orderId, accessToken, pinCode }) {
    const normalizedCustomerId = String(customerId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedAccessToken = String(accessToken || '').trim();
    const normalizedPinCode = String(pinCode || '').trim();
    if (!normalizedCustomerId || !normalizedOrderId || !normalizedAccessToken || !normalizedPinCode) {
      throw new Error('Недостаточно данных для выдачи Telegram-доступа заказчику.');
    }

    const db = load();
    const accesses = ensureCollection(db);
    const now = new Date().toISOString();
    let access = accesses.find((item) => String(item?.orderId || '').trim() === normalizedOrderId) || null;

    if (!access) {
      access = normalizeAccessRecord({
        _id: id(),
        customerId: normalizedCustomerId,
        orderId: normalizedOrderId,
        createdAt: now,
      });
      accesses.push(access);
    }

    access.customerId = normalizedCustomerId;
    access.orderId = normalizedOrderId;
    access.accessToken = normalizedAccessToken;
    access.pinHash = hashPassword(normalizedPinCode);
    access.pinLast4 = normalizedPinCode.slice(-4);
    access.status = 'active';
    access.revokedAt = '';
    access.updatedAt = now;
    access.lastIssuedAt = now;
    clearPendingLink(access);

    save();
    return normalizeAccessRecord(access);
  },

  beginTelegramLink(accessId, telegramData = {}) {
    const normalizedAccessId = String(accessId || '').trim();
    const normalizedChatId = String(telegramData.chatId || '').trim();
    const normalizedTelegramUserId = String(telegramData.telegramUserId || '').trim();
    if (!normalizedAccessId || !normalizedChatId || !normalizedTelegramUserId) {
      throw new Error('Недостаточно данных для начала Telegram-привязки.');
    }

    const db = load();
    const accesses = ensureCollection(db);
    const access = accesses.find((item) => String(item?._id || '').trim() === normalizedAccessId);
    if (!access || normalizeAccessStatus(access.status) !== 'active') {
      return null;
    }

    const now = new Date().toISOString();
    for (const item of accesses) {
      if (String(item?._id || '').trim() === normalizedAccessId) continue;
      if (String(item?.pendingLinkChatId || '').trim() !== normalizedChatId) continue;
      clearPendingLink(item);
      item.updatedAt = now;
    }

    access.pendingLinkChatId = normalizedChatId;
    access.pendingLinkTelegramUserId = normalizedTelegramUserId;
    access.pendingLinkIssuedAt = now;
    access.updatedAt = now;
    save();
    return normalizeAccessRecord(access);
  },

  verifyPinCode(accessId, pinCode) {
    const access = this.findById(accessId);
    const normalizedPinCode = String(pinCode || '').trim();
    if (!access || !normalizedPinCode || !access.pinHash) {
      return false;
    }
    return verifyPassword(normalizedPinCode, access.pinHash);
  },

  linkTelegramUser(accessId, telegramData = {}) {
    const normalizedAccessId = String(accessId || '').trim();
    if (!normalizedAccessId) return null;

    const db = load();
    const accesses = ensureCollection(db);
    const access = accesses.find((item) => String(item?._id || '').trim() === normalizedAccessId);
    if (!access || normalizeAccessStatus(access.status) !== 'active') {
      return null;
    }

    const now = new Date().toISOString();
    access.telegramUserId = String(telegramData.telegramUserId || '').trim();
    access.telegramChatId = String(telegramData.chatId || '').trim();
    access.telegramUsername = normalizeUsername(telegramData.username || '');
    access.telegramFirstName = String(telegramData.firstName || '').trim();
    access.telegramLastName = String(telegramData.lastName || '').trim();
    access.telegramLinkedAt = now;
    access.telegramLastSeenAt = now;
    access.updatedAt = now;
    clearPendingLink(access);
    save();
    return normalizeAccessRecord(access);
  },

  touchLinkedByTelegramContext({ chatId, telegramUserId, username, firstName, lastName } = {}) {
    const normalizedChatId = String(chatId || '').trim();
    const normalizedTelegramUserId = String(telegramUserId || '').trim();
    if (!normalizedChatId && !normalizedTelegramUserId) {
      return [];
    }

    const db = load();
    const accesses = ensureCollection(db);
    const now = new Date().toISOString();
    const touched = [];

    for (const access of accesses) {
      if (normalizeAccessStatus(access.status) !== 'active') continue;
      const matchesUser = normalizedTelegramUserId && String(access.telegramUserId || '').trim() === normalizedTelegramUserId;
      const matchesChat = normalizedChatId && String(access.telegramChatId || '').trim() === normalizedChatId;
      if (!matchesUser && !matchesChat) continue;

      access.telegramChatId = normalizedChatId || String(access.telegramChatId || '').trim();
      access.telegramUserId = normalizedTelegramUserId || String(access.telegramUserId || '').trim();
      access.telegramUsername = normalizeUsername(username || access.telegramUsername || '');
      access.telegramFirstName = String(firstName || access.telegramFirstName || '').trim();
      access.telegramLastName = String(lastName || access.telegramLastName || '').trim();
      access.telegramLastSeenAt = now;
      access.updatedAt = now;
      touched.push(normalizeAccessRecord(access));
    }

    if (touched.length > 0) {
      save();
    }
    return touched;
  },

  revokeByCustomerId(customerId) {
    const normalizedCustomerId = String(customerId || '').trim();
    if (!normalizedCustomerId) return 0;

    const db = load();
    const accesses = ensureCollection(db);
    const now = new Date().toISOString();
    let revokedCount = 0;

    for (const access of accesses) {
      if (String(access.customerId || '').trim() !== normalizedCustomerId) continue;
      if (normalizeAccessStatus(access.status) === 'revoked') continue;
      access.status = 'revoked';
      access.revokedAt = now;
      access.updatedAt = now;
      clearPendingLink(access);
      revokedCount += 1;
    }

    if (revokedCount > 0) {
      save();
    }
    return revokedCount;
  },

  revokeByOrderId(orderId) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) return 0;

    const db = load();
    const accesses = ensureCollection(db);
    const now = new Date().toISOString();
    let revokedCount = 0;

    for (const access of accesses) {
      if (String(access.orderId || '').trim() !== normalizedOrderId) continue;
      if (normalizeAccessStatus(access.status) === 'revoked') continue;
      access.status = 'revoked';
      access.revokedAt = now;
      access.updatedAt = now;
      clearPendingLink(access);
      revokedCount += 1;
    }

    if (revokedCount > 0) {
      save();
    }
    return revokedCount;
  },
};

module.exports = CustomerTelegramAccessStore;
