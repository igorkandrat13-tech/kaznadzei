const { id, load, save } = require('./store');

const WORKSHOP_REQUEST_STATUS = {
  OPEN: 'open',
  COMPLETED: 'completed',
};

function normalizeStatus(status = '') {
  return String(status || '').trim().toLowerCase() === WORKSHOP_REQUEST_STATUS.COMPLETED
    ? WORKSHOP_REQUEST_STATUS.COMPLETED
    : WORKSHOP_REQUEST_STATUS.OPEN;
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeActor(actor = {}) {
  return {
    employeeId: String(actor.employeeId || actor._id || '').trim(),
    employeeName: String(actor.employeeName || actor.fullName || '').trim(),
    role: String(actor.role || '').trim(),
    telegramChatId: String(actor.telegramChatId || actor.chatId || '').trim(),
  };
}

function sortByCreatedAtDesc(left = {}, right = {}) {
  const leftTime = new Date(left.createdAt || 0).getTime();
  const rightTime = new Date(right.createdAt || 0).getTime();
  return rightTime - leftTime;
}

const WorkshopRequestStore = {
  findAll() {
    return load().workshopRequests
      .slice()
      .sort(sortByCreatedAtDesc);
  },

  findById(requestId) {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return null;
    return load().workshopRequests.find((item) => item._id === normalizedRequestId) || null;
  },

  create(data = {}) {
    const text = normalizeText(data.text);
    if (!text) return 'empty_text';

    const db = load();
    const actor = normalizeActor(data.actor);
    const now = new Date().toISOString();
    const nextItem = {
      _id: id(),
      text,
      status: normalizeStatus(data.status),
      source: 'telegram-workshop',
      employeeId: actor.employeeId,
      employeeName: actor.employeeName,
      employeeRole: actor.role,
      telegramChatId: actor.telegramChatId,
      resolvedAt: '',
      resolvedBy: {
        employeeId: '',
        employeeName: '',
        role: '',
      },
      createdAt: now,
      updatedAt: now,
    };
    db.workshopRequests.push(nextItem);
    save();
    return nextItem;
  },

  updateStatus(requestId, nextStatus, actor = {}) {
    const db = load();
    const normalizedRequestId = String(requestId || '').trim();
    const item = db.workshopRequests.find((entry) => entry._id === normalizedRequestId);
    if (!item) return null;

    const status = normalizeStatus(nextStatus);
    if (item.status === status) {
      return item;
    }

    const normalizedActor = normalizeActor(actor);
    item.status = status;
    item.updatedAt = new Date().toISOString();
    if (status === WORKSHOP_REQUEST_STATUS.COMPLETED) {
      item.resolvedAt = item.updatedAt;
      item.resolvedBy = {
        employeeId: normalizedActor.employeeId,
        employeeName: normalizedActor.employeeName,
        role: normalizedActor.role,
      };
    } else {
      item.resolvedAt = '';
      item.resolvedBy = {
        employeeId: '',
        employeeName: '',
        role: '',
      };
    }

    save();
    return item;
  },
};

module.exports = {
  WORKSHOP_REQUEST_STATUS,
  WorkshopRequestStore,
};
