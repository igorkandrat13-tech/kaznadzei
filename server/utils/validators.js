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

function sanitizeOrderInput(payload, options = {}) {
  const partial = options.partial === true;
  const data = {};

  if (!partial || payload.name !== undefined) {
    data.name = normalizeString(payload.name, 'name', { required: !partial, maxLength: 120 });
  }
  if (!partial || payload.customer !== undefined) {
    data.customer = normalizeString(payload.customer, 'customer', { maxLength: 120 });
  }
  if (!partial || payload.quantity !== undefined) {
    data.quantity = normalizePositiveInt(payload.quantity, 'quantity', { required: !partial, min: 1 });
  }
  if (!partial || payload.material !== undefined) {
    data.material = normalizeString(payload.material, 'material', { maxLength: 120 });
  }
  if (!partial || payload.notes !== undefined) {
    data.notes = normalizeString(payload.notes, 'notes', { maxLength: 2000 });
  }
  if (!partial || payload.startDate !== undefined) {
    data.startDate = normalizeDate(payload.startDate, 'startDate', { allowUndefined: partial });
  }
  if (!partial || payload.endDate !== undefined) {
    data.endDate = normalizeDate(payload.endDate, 'endDate', { allowUndefined: partial });
  }

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    fail('Дата окончания не может быть раньше даты начала.');
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

  if (!partial || payload.stepName !== undefined) {
    data.stepName = normalizeString(payload.stepName, 'stepName', { required: !partial, maxLength: 120 });
  }
  if (!partial || payload.description !== undefined) {
    data.description = normalizeString(payload.description, 'description', { required: !partial, maxLength: 500 });
  }
  if (!partial || payload.role !== undefined) {
    data.role = normalizeString(payload.role, 'role', { required: !partial, maxLength: 40 });
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

module.exports = {
  sanitizeColorInput,
  sanitizeCommentInput,
  sanitizeOrderInput,
  sanitizeProcessStepInput,
};
