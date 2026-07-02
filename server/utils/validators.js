function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function normalizeString(value, fieldName, options = {}) {
  const required = options.required === true;
  const maxLength = options.maxLength || 255;

  if (value === undefined || value === null) {
    if (required) {
      fail(`Поле "${fieldName}" обязательно.`);
    }
    return options.defaultValue ?? '';
  }

  if (typeof value !== 'string') {
    fail(`Поле "${fieldName}" должно быть строкой.`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    fail(`Поле "${fieldName}" обязательно.`);
  }
  if (normalized.length > maxLength) {
    fail(`Поле "${fieldName}" слишком длинное.`);
  }

  return normalized;
}

function normalizePositiveInt(value, fieldName, options = {}) {
  const required = options.required !== false;
  const min = options.min || 1;

  if (value === undefined || value === null || value === '') {
    if (!required) {
      return undefined;
    }
    fail(`Поле "${fieldName}" обязательно.`);
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min) {
    fail(`Поле "${fieldName}" должно быть целым числом не меньше ${min}.`);
  }

  return numeric;
}

function normalizeDate(value, fieldName, options = {}) {
  if (value === undefined) {
    return options.allowUndefined ? undefined : null;
  }
  if (value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    fail(`Поле "${fieldName}" должно быть строкой даты.`);
  }

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    fail(`Поле "${fieldName}" должно быть в формате YYYY-MM-DD.`);
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    fail(`Поле "${fieldName}" содержит некорректную дату.`);
  }

  return normalized;
}

function normalizeHexColor(value, fieldName = 'hex') {
  const normalized = normalizeString(value, fieldName, { required: true, maxLength: 7 });
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    fail(`Поле "${fieldName}" должно быть HEX-цветом вида #RRGGBB.`);
  }
  return normalized.toUpperCase();
}

function normalizeBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    fail(`Поле "${fieldName}" должно быть булевым значением.`);
  }
  return value;
}

function normalizeManualStageMarks(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`Поле "${fieldName}" должно быть объектом.`);
  }

  return Object.entries(value).reduce((acc, [columnKey, mark]) => {
    const normalizedColumnKey = normalizeString(columnKey, `${fieldName}.key`, { required: true, maxLength: 80 });
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
      fail(`Поле "${fieldName}.${normalizedColumnKey}" должно быть объектом.`);
    }

    acc[normalizedColumnKey] = {
      legendKey: normalizeString(mark.legendKey, `${fieldName}.${normalizedColumnKey}.legendKey`, { required: false, maxLength: 40 }),
      updatedAt: normalizeString(mark.updatedAt, `${fieldName}.${normalizedColumnKey}.updatedAt`, { required: false, maxLength: 80 }),
      updatedBy: normalizeString(mark.updatedBy, `${fieldName}.${normalizedColumnKey}.updatedBy`, { required: false, maxLength: 120 }),
    };
    return acc;
  }, {});
}

function normalizeManualStageClears(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`Поле "${fieldName}" должно быть объектом.`);
  }

  return Object.entries(value).reduce((acc, [columnKey, mark]) => {
    const normalizedColumnKey = normalizeString(columnKey, `${fieldName}.key`, { required: true, maxLength: 80 });
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
      fail(`Поле "${fieldName}.${normalizedColumnKey}" должно быть объектом.`);
    }

    acc[normalizedColumnKey] = {
      updatedAt: normalizeString(mark.updatedAt, `${fieldName}.${normalizedColumnKey}.updatedAt`, { required: false, maxLength: 80 }),
      updatedBy: normalizeString(mark.updatedBy, `${fieldName}.${normalizedColumnKey}.updatedBy`, { required: false, maxLength: 120 }),
    };
    return acc;
  }, {});
}

function normalizeAttachmentRelativePath(value, fieldName, options = {}) {
  const normalized = normalizeString(value, fieldName, {
    required: options.required,
    maxLength: options.maxLength || 500,
  });
  if (!normalized) {
    return '';
  }
  const sanitized = normalized.replace(/\\/g, '/');
  if (sanitized.startsWith('/') || sanitized.includes('..')) {
    fail(`Поле "${fieldName}" содержит некорректный путь.`);
  }
  return sanitized;
}

function normalizeUrl(value, fieldName, options = {}) {
  const normalized = normalizeString(value, fieldName, {
    required: options.required,
    maxLength: options.maxLength || 500,
  });
  if (!normalized && options.allowEmpty !== false) {
    return '';
  }

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      fail(`Поле "${fieldName}" должно быть ссылкой http или https.`);
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    fail(`Поле "${fieldName}" должно быть корректной ссылкой.`);
  }
}

function normalizeGitRemote(value, fieldName, options = {}) {
  const normalized = normalizeString(value, fieldName, {
    required: options.required,
    maxLength: options.maxLength || 500,
  });

  if (!normalized) {
    return '';
  }

  const isScpLike = /^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+:[A-Za-z0-9_./-]+(?:\.git)?$/.test(normalized);
  if (isScpLike) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (!['https:', 'ssh:'].includes(parsed.protocol)) {
      fail(`Поле "${fieldName}" должно быть SSH или HTTPS адресом git-репозитория.`);
    }
    return normalized;
  } catch {
    fail(`Поле "${fieldName}" должно быть корректным git remote URL, например git@github.com:owner/repo.git.`);
  }
}

function getKnownRoleKeys() {
  const RoleStore = require('../stores/roleStore');
  return new Set(RoleStore.findAll({ includeDeleted: true }).map(role => role.key));
}

function sanitizeOrderInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.orderNumber !== undefined) {
    data.orderNumber = normalizeString(payload.orderNumber, 'orderNumber', { required: !partial, maxLength: 80 });
  }
  if (!partial || payload.name !== undefined) {
    data.name = normalizeString(payload.name, 'name', { required: false, maxLength: 120 });
  }
  if (!partial || payload.customer !== undefined) {
    data.customer = normalizeString(payload.customer, 'customer', { maxLength: 120 });
  }
  if (!partial || payload.quantity !== undefined) {
    data.quantity = normalizePositiveInt(payload.quantity, 'quantity', { required: false, min: 1 });
  }
  if (!partial || payload.material !== undefined) {
    data.material = normalizeString(payload.material, 'material', { required: false, maxLength: 120 });
  }
  if (!partial || payload.notes !== undefined) {
    data.notes = normalizeString(payload.notes, 'notes', { required: false, maxLength: 2000 });
  }
  if (!partial || payload.orderDate !== undefined) {
    data.orderDate = normalizeDate(payload.orderDate, 'orderDate', { allowUndefined: partial });
  }
  if (!partial || payload.startDate !== undefined) {
    data.startDate = normalizeDate(payload.startDate, 'startDate', { allowUndefined: partial });
  }
  if (!partial || payload.endDate !== undefined) {
    data.endDate = normalizeDate(payload.endDate, 'endDate', { allowUndefined: partial });
  }
  if (!partial || payload.manualDateOverrides !== undefined) {
    if (payload.manualDateOverrides === undefined && partial) {
      data.manualDateOverrides = undefined;
    } else if (!payload.manualDateOverrides || typeof payload.manualDateOverrides !== 'object' || Array.isArray(payload.manualDateOverrides)) {
      fail('Поле "manualDateOverrides" должно быть объектом.');
    } else {
      data.manualDateOverrides = {
        startDate: normalizeDate(payload.manualDateOverrides.startDate, 'manualDateOverrides.startDate', { allowUndefined: true }) || '',
        endDate: normalizeDate(payload.manualDateOverrides.endDate, 'manualDateOverrides.endDate', { allowUndefined: true }) || '',
      };
      if (data.manualDateOverrides.startDate && data.manualDateOverrides.endDate && data.manualDateOverrides.endDate < data.manualDateOverrides.startDate) {
        fail('Дата окончания не может быть раньше даты начала.');
      }
    }
  }

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    fail('Дата окончания не может быть раньше даты начала.');
  }

  return data;
}

function sanitizeOrderAttachmentInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.attachmentId !== undefined) {
    data.attachmentId = normalizeString(payload.attachmentId, 'attachmentId', { maxLength: 80 });
  }
  if (!partial || payload.name !== undefined) {
    data.name = normalizeString(payload.name, 'name', { required: !partial, maxLength: 255 });
  }
  if (!partial || payload.type !== undefined) {
    data.type = normalizeString(payload.type, 'type', { maxLength: 120 });
  }
  if (!partial || payload.size !== undefined) {
    data.size = normalizePositiveInt(payload.size, 'size', { required: false, min: 1 });
  }
  if (!partial || payload.storedName !== undefined) {
    data.storedName = normalizeString(payload.storedName, 'storedName', { maxLength: 255 });
  }
  if (!partial || payload.relativePath !== undefined) {
    data.relativePath = normalizeAttachmentRelativePath(payload.relativePath, 'relativePath', { maxLength: 500 });
  }
  if (!partial || payload.uploadedAt !== undefined) {
    data.uploadedAt = normalizeString(payload.uploadedAt, 'uploadedAt', { maxLength: 80 });
  }
  if (!partial || payload.content !== undefined) {
    const content = normalizeString(payload.content, 'content', { required: false, maxLength: 15 * 1024 * 1024 });
    if (content && !/^data:[^;]+;base64,[A-Za-z0-9+/=]+$/i.test(content)) {
      fail('Поле "content" должно быть data URL в base64.');
    }
    data.content = content;
  }
  if (!partial || payload.url !== undefined) {
    data.url = normalizeUrl(payload.url, 'url', { required: false, maxLength: 2000 });
  }

  if (!partial && !data.content && !data.relativePath && !data.url) {
    fail('Для вложения требуется файл или ссылка.');
  }

  return data;
}

function sanitizeOrderItemInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.itemId !== undefined) {
    data.itemId = normalizeString(payload.itemId, 'itemId', { maxLength: 80 });
  }
  if (!partial || payload.itemNumber !== undefined) {
    data.itemNumber = normalizeString(payload.itemNumber, 'itemNumber', { maxLength: 40 });
  }
  if (!partial || payload.productNumber !== undefined) {
    data.productNumber = normalizeString(payload.productNumber, 'productNumber', { maxLength: 40 });
  }
  if (!partial || payload.room !== undefined) {
    data.room = normalizeString(payload.room, 'room', { maxLength: 120 });
  }
  if (!partial || payload.roomNumber !== undefined) {
    data.roomNumber = normalizeString(payload.roomNumber, 'roomNumber', { maxLength: 40 });
  }
  if (!partial || payload.name !== undefined) {
    data.name = normalizeString(payload.name, 'name', { required: !partial, maxLength: 160 });
  }
  if (!partial || payload.quantity !== undefined) {
    data.quantity = normalizePositiveInt(payload.quantity, 'quantity', { required: !partial, min: 1 });
  }
  if (!partial || payload.material !== undefined) {
    data.material = normalizeString(payload.material, 'material', { maxLength: 120 });
  }
  if (!partial || payload.deliveryDate !== undefined) {
    data.deliveryDate = normalizeDate(payload.deliveryDate, 'deliveryDate', { allowUndefined: partial });
  }
  if (!partial || payload.packageName !== undefined) {
    data.packageName = normalizeString(payload.packageName, 'packageName', { maxLength: 1000 });
  }
  if (!partial || payload.packageItems !== undefined) {
    if (payload.packageItems === undefined && partial) {
      data.packageItems = undefined;
    } else {
      if (!Array.isArray(payload.packageItems)) {
        fail('Поле "packageItems" должно быть массивом.');
      }
      data.packageItems = payload.packageItems.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          fail(`Поле "packageItems[${index}]" должно быть объектом.`);
        }
        return {
          id: normalizeString(item.id, `packageItems[${index}].id`, { maxLength: 80 }),
          name: normalizeString(item.name, `packageItems[${index}].name`, { required: true, maxLength: 160 }),
          isCompleted: item.isCompleted === undefined ? false : normalizeBoolean(item.isCompleted, `packageItems[${index}].isCompleted`),
          completedAt: item.completedAt === undefined ? null : normalizeDate(item.completedAt, `packageItems[${index}].completedAt`, { allowUndefined: true }),
        };
      });
    }
  }
  if (!partial || payload.photoLink !== undefined) {
    data.photoLink = normalizeString(payload.photoLink, 'photoLink', { maxLength: 500 });
  }
  if (!partial || payload.notes !== undefined) {
    data.notes = normalizeString(payload.notes, 'notes', { maxLength: 2000 });
  }
  if (!partial || payload.manualStageMarks !== undefined) {
    data.manualStageMarks = normalizeManualStageMarks(payload.manualStageMarks, 'manualStageMarks');
  }
  if (!partial || payload.manualStageClears !== undefined) {
    data.manualStageClears = normalizeManualStageClears(payload.manualStageClears, 'manualStageClears');
  }

  return data;
}

function sanitizeCommentInput(payload) {
  return {
    role: normalizeString(payload.role, 'role', { required: true, maxLength: 40 }),
    text: normalizeString(payload.text, 'text', { required: true, maxLength: 1000 }),
  };
}

function sanitizeProcessStepInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};
  const allowedRoles = getKnownRoleKeys();

  if (!partial || payload.stepName !== undefined) {
    data.stepName = normalizeString(payload.stepName, 'stepName', { required: !partial, maxLength: 120 });
  }
  if (!partial || payload.description !== undefined) {
    data.description = normalizeString(payload.description, 'description', { required: !partial, maxLength: 500 });
  }
  if (!partial || payload.role !== undefined) {
    const role = normalizeString(payload.role, 'role', { required: !partial, maxLength: 40 });
    if (role && !allowedRoles.has(role)) {
      fail('Поле "role" содержит недопустимую роль.');
    }
    data.role = role;
  }
  if (!partial || payload.order !== undefined) {
    data.order = normalizePositiveInt(payload.order, 'order', { required: !partial, min: 1 });
  }

  return data;
}

function sanitizeColorInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.name !== undefined) {
    data.name = normalizeString(payload.name, 'name', { required: !partial, maxLength: 80 });
  }
  if (!partial || payload.hex !== undefined) {
    data.hex = normalizeHexColor(payload.hex);
  }

  return data;
}

function sanitizeSettingsInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.publicBaseUrl !== undefined) {
    data.publicBaseUrl = normalizeUrl(payload.publicBaseUrl, 'publicBaseUrl', { required: !partial, allowEmpty: false });
  }
  if (!partial || payload.telegramBotToken !== undefined) {
    data.telegramBotToken = normalizeString(payload.telegramBotToken, 'telegramBotToken', { maxLength: 200 });
  }
  if (!partial || payload.selfUpdateEnabled !== undefined) {
    data.selfUpdateEnabled = normalizeBoolean(payload.selfUpdateEnabled, 'selfUpdateEnabled');
  }
  if (!partial || payload.updateBranch !== undefined) {
    data.updateBranch = normalizeString(payload.updateBranch, 'updateBranch', { required: !partial, maxLength: 80 });
  }
  if (!partial || payload.updateRepositoryUrl !== undefined) {
    data.updateRepositoryUrl = normalizeGitRemote(payload.updateRepositoryUrl, 'updateRepositoryUrl', { maxLength: 500 });
  }

  return data;
}

function sanitizeEmployeeInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};
  const allowedRoles = getKnownRoleKeys();

  if (!partial || payload.fullName !== undefined) {
    data.fullName = normalizeString(payload.fullName, 'fullName', { required: !partial, maxLength: 160 });
  }
  if (!partial || payload.role !== undefined) {
    const role = normalizeString(payload.role, 'role', { required: !partial, maxLength: 40 });
    if (role && !allowedRoles.has(role)) {
      fail('Поле "role" содержит недопустимую роль.');
    }
    data.role = role;
  }
  if (!partial || payload.telegramUsername !== undefined) {
    const username = normalizeString(payload.telegramUsername, 'telegramUsername', { maxLength: 80 });
    data.telegramUsername = username ? username.replace(/^@+/, '@') : '';
  }
  if (!partial || payload.password !== undefined) {
    data.password = normalizeString(payload.password, 'password', { required: !partial, maxLength: 120 });
  }
  if (!partial || payload.pinCode !== undefined) {
    const pinCode = normalizeString(payload.pinCode, 'pinCode', { required: !partial, maxLength: 20 });
    if (pinCode && !/^[A-Za-z0-9_-]{4,20}$/.test(pinCode)) {
      fail('Поле "pinCode" должно содержать 4-20 символов: буквы, цифры, "_" или "-".');
    }
    data.pinCode = pinCode;
  }

  return data;
}

function sanitizeRoleInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.label !== undefined) {
    data.label = normalizeString(payload.label, 'label', { required: !partial, maxLength: 80 });
  }
  if (!partial || payload.icon !== undefined) {
    data.icon = normalizeString(payload.icon, 'icon', { maxLength: 8 });
  }
  if (!partial || payload.shortTitle !== undefined) {
    data.shortTitle = normalizeString(payload.shortTitle, 'shortTitle', { maxLength: 120 });
  }
  if (!partial || payload.description !== undefined) {
    data.description = normalizeString(payload.description, 'description', { maxLength: 500 });
  }
  if (!partial || payload.noStepsText !== undefined) {
    data.noStepsText = normalizeString(payload.noStepsText, 'noStepsText', { maxLength: 160 });
  }

  return data;
}

module.exports = {
  normalizeDate,
  sanitizeColorInput,
  sanitizeCommentInput,
  sanitizeEmployeeInput,
  sanitizeOrderAttachmentInput,
  sanitizeOrderInput,
  sanitizeOrderItemInput,
  sanitizeProcessStepInput,
  sanitizeRoleInput,
  sanitizeSettingsInput,
};
