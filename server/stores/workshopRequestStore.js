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

function normalizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).reduce((acc, attachment) => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return acc;
    const attachmentId = String(attachment.attachmentId || '').trim();
    const name = String(attachment.name || '').trim();
    if (!attachmentId || !name) return acc;
    acc.push({
      attachmentId,
      name,
      type: String(attachment.type || '').trim(),
      size: Number(attachment.size) || 0,
      uploadedAt: String(attachment.uploadedAt || '').trim(),
      relativePath: String(attachment.relativePath || '').trim(),
      url: String(attachment.url || '').trim(),
    });
    return acc;
  }, []);
}

function normalizeWorkshopRequestItem(item = {}) {
  return {
    ...item,
    text: normalizeText(item.text),
    status: normalizeStatus(item.status),
    employeeId: String(item.employeeId || '').trim(),
    employeeName: String(item.employeeName || '').trim(),
    employeeRole: String(item.employeeRole || '').trim(),
    telegramChatId: String(item.telegramChatId || '').trim(),
    createdAt: String(item.createdAt || '').trim(),
    updatedAt: String(item.updatedAt || '').trim(),
    resolvedAt: String(item.resolvedAt || '').trim(),
    resolvedBy: {
      employeeId: String(item?.resolvedBy?.employeeId || '').trim(),
      employeeName: String(item?.resolvedBy?.employeeName || '').trim(),
      role: String(item?.resolvedBy?.role || '').trim(),
    },
    attachments: normalizeAttachments(item.attachments),
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
      .map((item) => normalizeWorkshopRequestItem(item))
      .sort(sortByCreatedAtDesc);
  },

  findById(requestId) {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return null;
    const item = load().workshopRequests.find((entry) => entry._id === normalizedRequestId) || null;
    return item ? normalizeWorkshopRequestItem(item) : null;
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
      attachments: normalizeAttachments(data.attachments),
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

  delete(requestId) {
    const db = load();
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return false;
    const itemIndex = db.workshopRequests.findIndex((entry) => entry._id === normalizedRequestId);
    if (itemIndex === -1) return null;
    const [deletedItem] = db.workshopRequests.splice(itemIndex, 1);
    save();
    return deletedItem || null;
  },
};

module.exports = {
  WORKSHOP_REQUEST_STATUS,
  WorkshopRequestStore,
};
