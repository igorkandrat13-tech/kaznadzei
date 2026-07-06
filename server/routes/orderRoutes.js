const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const OrderStore = require('../stores/orderStore');
const RoleStore = require('../stores/roleStore');
const SettingsStore = require('../stores/settingsStore');
const EmployeeStore = require('../stores/employeeStore');
const { requireAdminAccess, requireManagerAccess, requireWriteAccess } = require('../middleware/security');
const {
  normalizeDate,
  sanitizeCommentInput,
  sanitizeOrderAttachmentInput,
  sanitizeOrderInput,
  sanitizeOrderItemInput,
} = require('../utils/validators');
const { addTelegramDiagnosticLog } = require('../services/telegramDiagnostics');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { notifyOrderCreated } = require('../services/orderNotifications');
const {
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
} = require('../services/telegramWebAppAuth');
const router = express.Router();

const ORDER_ATTACHMENTS_ROOT = path.join(__dirname, '..', 'uploads', 'order-attachments');
const ORDER_ATTACHMENT_FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const ORDER_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);
const ORDER_ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
]);
const ORDER_PRIMARY_HEADERS = [
  'Номер заказа',
  'Заказчик',
  'Помещение',
  '№ помещения',
  '№ изделия в заказе',
  'Кол-во изделй',
  'Наименование',
  'Карточка заказа',
  'Комплектация заказа',
  'Примечания',
  'Отгрузка до',
  'СТОЛЯР',
  '',
  'Покраска',
  'Начало изготовления изделия',
  'Окончание изготовления изделия',
  'Время изготовления изделий',
  'Время изготовления заказа',
];
const ORDER_COLUMN_KEY_TO_PRIMARY_INDEX = {
  orderNumber: ORDER_PRIMARY_HEADERS.indexOf('Номер заказа'),
  customer: ORDER_PRIMARY_HEADERS.indexOf('Заказчик'),
  room: ORDER_PRIMARY_HEADERS.indexOf('Помещение'),
  roomNumber: ORDER_PRIMARY_HEADERS.indexOf('№ помещения'),
  itemNumber: ORDER_PRIMARY_HEADERS.indexOf('№ изделия в заказе'),
  quantity: ORDER_PRIMARY_HEADERS.indexOf('Кол-во изделй'),
  name: ORDER_PRIMARY_HEADERS.indexOf('Наименование'),
  orderCard: ORDER_PRIMARY_HEADERS.indexOf('Карточка заказа'),
  packageName: ORDER_PRIMARY_HEADERS.indexOf('Комплектация заказа'),
  notes: ORDER_PRIMARY_HEADERS.indexOf('Примечания'),
  deliveryDate: ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до'),
  carpenter: ORDER_PRIMARY_HEADERS.indexOf('СТОЛЯР'),
  photoLink: ORDER_PRIMARY_HEADERS.indexOf(''),
  paint: ORDER_PRIMARY_HEADERS.indexOf('Покраска'),
  itemStartDate: ORDER_PRIMARY_HEADERS.indexOf('Начало изготовления изделия'),
  itemEndDate: ORDER_PRIMARY_HEADERS.indexOf('Окончание изготовления изделия'),
  itemDuration: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления изделий'),
  duration: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления заказа'),
};

function getAttachmentScope(req = {}) {
  return String(req.query?.scope || req.body?.scope || '').trim().toLowerCase() === 'paint'
    ? 'paint'
    : 'order';
}

function getAttachmentScopeLabel(scope = '') {
  return scope === 'paint'
    ? 'покраски'
    : 'карточки заказа';
}

function ensureDirectoryExists(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function sanitizeFileNameBase(fileName = '') {
  const extension = path.extname(fileName || '').toLowerCase();
  const baseName = path.basename(fileName || '', extension)
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return {
    baseName: baseName || 'file',
    extension,
  };
}

function normalizeUploadedFileName(fileName = '') {
  const normalized = String(fileName || '').trim();
  if (!normalized) return 'file';
  if (!/[ÐÑÃ]/.test(normalized)) {
    return normalized;
  }
  try {
    const decoded = Buffer.from(normalized, 'latin1').toString('utf8').trim();
    if (!decoded) return normalized;
    if (/[А-Яа-яЁё]/.test(decoded)) {
      return decoded;
    }
    return normalized;
  } catch {
    return normalized;
  }
}

function isAllowedAttachmentFile(file = {}) {
  const mimeType = String(file.mimetype || '').trim().toLowerCase();
  const extension = path.extname(normalizeUploadedFileName(file.originalname || '')).toLowerCase();
  return ORDER_ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeType) || ORDER_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension);
}

function createAttachmentUploadError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getStageLegendKeyForPrimaryColumn(columnIndex = -1, secondaryHeaders = []) {
  if (columnIndex < 0) return '';
  let currentIndex = 0;
  for (const cell of Array.isArray(secondaryHeaders) ? secondaryHeaders : []) {
    const span = Number(cell?.colSpan) || 1;
    if (columnIndex >= currentIndex && columnIndex < currentIndex + span) {
      return String(cell?.legendKey || '').trim();
    }
    currentIndex += span;
  }
  return '';
}

function resolveLegendKeyForManualStageColumn(columnKey = '', secondaryHeaders = []) {
  const primaryColumnIndex = ORDER_COLUMN_KEY_TO_PRIMARY_INDEX[String(columnKey || '').trim()];
  if (!Number.isInteger(primaryColumnIndex)) return '';
  return getStageLegendKeyForPrimaryColumn(primaryColumnIndex, secondaryHeaders);
}

function getActorAllowedManualColumns(actor = {}) {
  const normalizedEmployeeId = String(actor?.employeeId || '').trim();
  if (normalizedEmployeeId) {
    const employee = EmployeeStore.findById(normalizedEmployeeId);
    if (!employee) {
      const error = new Error('Сотрудник пользователя не найден.');
      error.status = 403;
      throw error;
    }
    if (Array.isArray(employee.allowedColumns)) {
      return new Set(employee.allowedColumns);
    }
  }

  const normalizedRole = String(actor?.role || '').trim();
  if (!normalizedRole || normalizedRole === 'admin') {
    return null;
  }

  const role = RoleStore.findByKey(normalizedRole, { includeDeleted: true });
  if (!role || role.isDeleted) {
    const error = new Error('Роль пользователя не найдена или отключена.');
    error.status = 403;
    throw error;
  }

  return new Set(Array.isArray(role.allowedColumns) ? role.allowedColumns : []);
}

function ensureActorCanUseManualColumns(actor = {}, selections = []) {
  const allowedColumns = getActorAllowedManualColumns(actor);
  if (!allowedColumns) return;

  const forbiddenSelection = selections.find((selection) => !allowedColumns.has(String(selection?.columnKey || '').trim()));
  if (!forbiddenSelection) return;

  const error = new Error(`У роли нет доступа к колонке "${forbiddenSelection.columnKey}".`);
  error.status = 403;
  throw error;
}

ensureDirectoryExists(ORDER_ATTACHMENTS_ROOT);

const attachmentStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const orderId = String(req.params?.id || '').trim();
      if (!orderId) {
        return cb(createAttachmentUploadError('Не указан заказ для загрузки файла.'));
      }
      const order = OrderStore.findById(orderId);
      if (!order) {
        return cb(createAttachmentUploadError('Заказ не найден.', 404));
      }
      const targetDirectory = path.join(ORDER_ATTACHMENTS_ROOT, orderId);
      ensureDirectoryExists(targetDirectory);
      return cb(null, targetDirectory);
    } catch (error) {
      return cb(error);
    }
  },
  filename(req, file, cb) {
    const normalizedOriginalName = normalizeUploadedFileName(file.originalname || 'file');
    file.originalname = normalizedOriginalName;
    const { baseName, extension } = sanitizeFileNameBase(normalizedOriginalName);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${baseName}${extension}`);
  },
});

const uploadOrderAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: ORDER_ATTACHMENT_FILE_SIZE_LIMIT, files: 1 },
  fileFilter(req, file, cb) {
    if (!isAllowedAttachmentFile(file)) {
      return cb(createAttachmentUploadError('Разрешены только PDF, Word, Excel и изображения.'));
    }
    return cb(null, true);
  },
});

function maskTelegramValue(value, { tail = 6 } = {}) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= tail) return normalized;
  return `...${normalized.slice(-tail)}`;
}

function getTelegramPayloadDebug(payload = {}) {
  const initData = String(payload.initData || '').trim();
  const unsafeUserId = String(payload.unsafeUser?.id || '').trim();
  const sessionToken = String(payload.sessionToken || '').trim();

  return {
    hasInitData: Boolean(initData),
    initDataLength: initData.length,
    hasUnsafeUser: Boolean(unsafeUserId),
    unsafeUserId: unsafeUserId || '',
    hasSessionToken: Boolean(sessionToken),
    sessionTokenLength: sessionToken.length,
    sessionTokenTail: maskTelegramValue(sessionToken),
  };
}

function logTelegramOrderDebug(event, details = {}) {
  addTelegramDiagnosticLog('telegram-order', event, details);
  console.log(`[telegram-order] ${event}`, JSON.stringify(details));
}

function getTelegramEmployeeDisplayName(employee, telegramUser = null) {
  const fullName = String(employee?.fullName || '').trim();
  if (fullName) return fullName;

  const employeeTelegramName = [
    String(employee?.telegramFirstName || '').trim(),
    String(employee?.telegramLastName || '').trim(),
  ].filter(Boolean).join(' ').trim();
  if (employeeTelegramName) return employeeTelegramName;

  const telegramUserName = [
    String(telegramUser?.first_name || '').trim(),
    String(telegramUser?.last_name || '').trim(),
  ].filter(Boolean).join(' ').trim();
  if (telegramUserName) return telegramUserName;

  const username = String(employee?.telegramUsername || telegramUser?.username || '').trim();
  if (username) {
    return username.startsWith('@') ? username : `@${username}`;
  }

  return '';
}

function resolveTelegramEmployee(token, payload, context = {}) {
  const payloadDebug = getTelegramPayloadDebug(payload);
  if (payload?.sessionToken) {
    try {
      const sessionPayload = verifyTelegramEmployeeSessionToken(token, payload.sessionToken);
      const employeeBySession = EmployeeStore.findById(sessionPayload.employeeId);
      if (!employeeBySession || String(employeeBySession.telegramUserId || '') !== String(sessionPayload.telegramUserId || '')) {
        logTelegramOrderDebug('resolve.session-mismatch', {
          ...context,
          ...payloadDebug,
          employeeId: sessionPayload.employeeId,
          telegramUserId: String(sessionPayload.telegramUserId || ''),
          employeeFound: Boolean(employeeBySession),
          employeeTelegramUserId: String(employeeBySession?.telegramUserId || ''),
        });
        throw new Error('Сотрудник Telegram не найден или session token устарел.');
      }
      logTelegramOrderDebug('resolve.session-token-ok', {
        ...context,
        ...payloadDebug,
        employeeId: employeeBySession._id,
        employeeRole: employeeBySession.role,
      });
      return {
        ...employeeBySession,
        fullName: getTelegramEmployeeDisplayName(employeeBySession),
      };
    } catch (sessionError) {
      const hasTelegramAuthPayload = Boolean(String(payload?.initData || '').trim() || payload?.unsafeUser?.id);
      logTelegramOrderDebug('resolve.session-token-failed', {
        ...context,
        ...payloadDebug,
        hasTelegramAuthPayload,
        message: sessionError.message || 'Session token validation failed.',
      });
      if (!hasTelegramAuthPayload) {
        throw sessionError;
      }
    }
  }

  const telegramUser = resolveTelegramWebAppUser(token, payload || {});
  const employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
  logTelegramOrderDebug('resolve.payload', {
    ...context,
    ...payloadDebug,
    resolvedTelegramUserId: String(telegramUser?.id || ''),
    employeeFound: Boolean(employee),
    employeeId: employee?._id || '',
    employeeRole: employee?.role || '',
  });
  if (!employee) return employee;

  return {
    ...employee,
    fullName: getTelegramEmployeeDisplayName(employee, telegramUser),
  };
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function parseLegacyDataUrl(dataUrl = '') {
  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function resolveOrderAttachmentAbsolutePath(relativePath = '') {
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/');
  if (!normalized) return '';
  const absolutePath = path.resolve(ORDER_ATTACHMENTS_ROOT, normalized);
  const rootWithSeparator = `${path.resolve(ORDER_ATTACHMENTS_ROOT)}${path.sep}`;
  if (absolutePath !== path.resolve(ORDER_ATTACHMENTS_ROOT) && !absolutePath.startsWith(rootWithSeparator)) {
    return '';
  }
  return absolutePath;
}

function deleteStoredAttachmentFile(attachment = {}) {
  const absolutePath = resolveOrderAttachmentAbsolutePath(attachment.relativePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) return;
  fs.unlinkSync(absolutePath);
}

function sanitizeOrderItemsPayload(payload) {
  if (payload === undefined) return undefined;
  if (!Array.isArray(payload)) {
    fail('Список изделий должен быть массивом.');
  }
  return payload.map((item, index) => ({
    ...sanitizeOrderItemInput(item || {}),
    itemNumber: String(item?.itemNumber || index + 1).trim() || String(index + 1),
  }));
}

function getOrderItemOrFail(order, itemId) {
  const item = OrderStore.getOrderItem(order, itemId);
  if (!item) {
    fail('Изделие заказа не найдено.', 404);
  }
  return item;
}

router.get('/orders', (req, res) => {
  try {
    const orders = OrderStore.findAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Не удалось загрузить заказы.' });
  }
});

router.get('/orders/:id', (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/orders/:id/comments', requireWriteAccess, (req, res) => {
  try {
    const itemId = String(req.body?.itemId || '').trim();
    const { role, text } = sanitizeCommentInput(req.body || {});
    const comments = itemId
      ? OrderStore.addComment(req.params.id, itemId, role, text)
      : OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });
    const order = OrderStore.findById(req.params.id);
    const item = OrderStore.getOrderItem(order, itemId);
    addActivityLog({
      action: 'order.comment.upsert',
      entityType: 'order',
      entityId: req.params.id,
      entityName: item?.name || order?.name || '',
      actor: getRequestActor(req, { label: 'Сотрудник' }),
      message: `Комментарий по роли "${role}" сохранен.`,
      details: { role, itemId: item?.itemId || '', textLength: text.length },
    });
    res.status(201).json(comments);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

function handleManualStageMarks(req, res) {
  try {
    const legendKey = String(req.body?.legendKey || '').trim();
    const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
    const settings = SettingsStore.get();
    const secondaryHeaders = settings?.orderStageLegendConfig?.secondaryHeaders || [];
    const isClearRequest = !legendKey && selections.every(
      (selection) => !String(selection?.legendKey || '').trim(),
    );

    if (selections.length === 0) {
      return res.status(400).json({ message: 'Не выбраны ячейки для обновления.' });
    }

    const normalizedSelections = selections.map((selection) => ({
      orderId: String(selection?.orderId || '').trim(),
      itemId: String(selection?.itemId || '').trim(),
      columnKey: String(selection?.columnKey || '').trim(),
      legendKey: isClearRequest
        ? ''
        : (
            String(selection?.legendKey || '').trim()
            || resolveLegendKeyForManualStageColumn(selection?.columnKey, secondaryHeaders)
          ),
    })).filter(selection => selection.orderId && selection.itemId && selection.columnKey);

    if (normalizedSelections.length === 0) {
      return res.status(400).json({ message: 'Некорректный список ячеек.' });
    }

    ensureActorCanUseManualColumns(req.auth || { role: 'admin' }, normalizedSelections);

    const updatedOrders = OrderStore.setManualStageMarks(
      normalizedSelections,
      legendKey,
      req.auth?.role || 'admin'
    );

    if (updatedOrders === false) {
      return res.status(400).json({ message: 'Не удалось обновить ручные этапные отметки.' });
    }

    addActivityLog({
      action: (legendKey || normalizedSelections.some((selection) => selection.legendKey))
        ? 'order.manual-stage.apply'
        : 'order.manual-stage.clear',
      entityType: 'order',
      entityId: normalizedSelections[0]?.orderId || '',
      entityName: normalizedSelections.length === 1
        ? (OrderStore.getOrderPrimaryName(updatedOrders[0]) || '')
        : `Массовое обновление (${normalizedSelections.length} ячеек)`,
      actor: getRequestActor(req, { label: 'Администратор' }),
      message: (legendKey || normalizedSelections.some((selection) => selection.legendKey))
        ? `Ручные этапные отметки применены к ${normalizedSelections.length} ячейкам таблицы.`
        : `Ручные этапные отметки очищены для ${normalizedSelections.length} ячеек таблицы.`,
      details: {
        legendKey,
        selections: normalizedSelections.length,
        mixedLegendKeys: normalizedSelections.some((selection) => selection.legendKey),
      },
    });

    res.json({
      ok: true,
      updatedOrders,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось обновить ручные этапные отметки.' });
  }
}

function handleManualDateOverrides(req, res) {
  try {
    const columnKey = String(req.body?.columnKey || '').trim();
    const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
    const settings = SettingsStore.get();
    const secondaryHeaders = settings?.orderStageLegendConfig?.secondaryHeaders || [];

    if (!['itemStartDate', 'itemEndDate', 'duration'].includes(columnKey)) {
      return res.status(400).json({ message: 'Редактирование дат доступно только для последних датных колонок.' });
    }
    if (selections.length === 0) {
      return res.status(400).json({ message: 'Не выбраны ячейки для изменения даты.' });
    }

    const normalizedSelections = selections.map((selection) => ({
      orderId: String(selection?.orderId || '').trim(),
      itemId: String(selection?.itemId || '').trim(),
      columnKey: String(selection?.columnKey || columnKey).trim(),
      legendKey: String(selection?.legendKey || '').trim()
        || resolveLegendKeyForManualStageColumn(selection?.columnKey || columnKey, secondaryHeaders),
    })).filter(selection => selection.orderId && (selection.itemId || columnKey === 'duration'));

    if (normalizedSelections.length === 0) {
      return res.status(400).json({ message: 'Некорректный список ячеек для изменения даты.' });
    }

    ensureActorCanUseManualColumns(req.auth || { role: 'admin' }, normalizedSelections);

    const payload = {
      columnKey,
      actor: req.auth?.role || 'admin',
    };
    if (columnKey === 'duration') {
      const startDate = normalizeDate(req.body?.startDate ?? '', 'startDate', { allowUndefined: false });
      const endDate = normalizeDate(req.body?.endDate ?? '', 'endDate', { allowUndefined: false });
      if (!startDate && !endDate) {
        return res.status(400).json({ message: 'Укажите хотя бы одну дату для последнего столбца.' });
      }
      if (startDate && endDate && endDate < startDate) {
        return res.status(400).json({ message: 'Дата окончания не может быть раньше даты начала.' });
      }
      payload.startDate = startDate || '';
      payload.endDate = endDate || '';
    } else {
      const date = normalizeDate(req.body?.date ?? '', 'date', { allowUndefined: false });
      if (!date) {
        return res.status(400).json({ message: 'Укажите дату для выбранных ячеек.' });
      }
      payload.date = date;
    }

    const updatedOrders = OrderStore.setManualDateOverrides(normalizedSelections, payload);
    if (!Array.isArray(updatedOrders) || updatedOrders.length === 0) {
      return res.status(400).json({ message: 'Не удалось применить дату. Проверьте выбранные ячейки и попробуйте снова.' });
    }
    addActivityLog({
      action: 'order.manual-date.apply',
      entityType: 'order',
      entityId: normalizedSelections[0]?.orderId || '',
      entityName: normalizedSelections.length === 1
        ? (OrderStore.getOrderPrimaryName(updatedOrders[0]) || '')
        : `Массовое изменение дат (${normalizedSelections.length} ячеек)`,
      actor: getRequestActor(req, { label: 'Администратор' }),
      message: `Ручные даты обновлены для ${normalizedSelections.length} ячеек таблицы.`,
      details: {
        columnKey,
        selections: normalizedSelections.length,
      },
    });

    res.json({
      ok: true,
      updatedOrders,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось обновить даты.' });
  }
}

router.patch('/orders/manual-stage-marks', requireAdminAccess(), handleManualStageMarks);
router.post('/orders/manual-stage-marks', requireAdminAccess(), handleManualStageMarks);
router.patch('/orders/manual-date-overrides', requireAdminAccess(), handleManualDateOverrides);
router.post('/orders/manual-date-overrides', requireAdminAccess(), handleManualDateOverrides);

router.post('/orders/:id/telegram-comment', (req, res) => {
  try {
    const token = String(SettingsStore.get().telegramBotToken || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Токен Telegram-бота не настроен.' });
    }

    const context = {
      route: 'telegram-comment',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
    };
    const employee = resolveTelegramEmployee(token, req.body || {}, context);
    if (!employee) {
      logTelegramOrderDebug('telegram-comment.reject.employee-not-found', context);
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }

    const { role, text } = sanitizeCommentInput({
      role: employee.role,
      text: req.body?.text,
    });

    const comments = context.itemId
      ? OrderStore.addComment(req.params.id, context.itemId, role, text)
      : OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });
    const order = OrderStore.findById(req.params.id);
    const item = getOrderItemOrFail(order, context.itemId);

    logTelegramOrderDebug('telegram-comment.success', {
      ...context,
      employeeId: employee._id,
      employeeRole: employee.role,
    });

    addActivityLog({
      action: 'order.comment.telegram',
      entityType: 'order',
      entityId: req.params.id,
      entityName: item.name || order?.name || '',
      actor: {
        type: 'telegram',
        role: employee.role,
        name: employee.fullName,
        label: `TG: ${employee.fullName}`,
      },
      message: 'Комментарий сохранен из Telegram.',
      details: { role: employee.role, itemId: item.itemId, textLength: text.length },
    });

    res.status(201).json({
      ok: true,
      comments,
      item,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
      },
    });
  } catch (error) {
    logTelegramOrderDebug('telegram-comment.error', {
      route: 'telegram-comment',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось сохранить комментарий из Telegram.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сохранить комментарий из Telegram.' });
  }
});

router.post('/orders/:id/telegram-item-scan', (req, res) => {
  try {
    const token = String(SettingsStore.get().telegramBotToken || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Токен Telegram-бота не настроен.' });
    }

    const context = {
      route: 'telegram-item-scan',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
    };
    const employee = resolveTelegramEmployee(token, req.body || {}, context);
    if (!employee) {
      logTelegramOrderDebug('telegram-item-scan.reject.employee-not-found', context);
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }
    if (!context.itemId) {
      return res.status(400).json({ message: 'Не указан идентификатор изделия.' });
    }

    const updatedOrder = OrderStore.markItemRoleInProgress(req.params.id, context.itemId, employee.role, {
      _id: employee._id,
      fullName: employee.fullName,
    });
    if (!updatedOrder) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (updatedOrder === false) {
      return res.status(404).json({ message: 'Изделие заказа не найдено.' });
    }

    const updatedItem = getOrderItemOrFail(updatedOrder, context.itemId);
    logTelegramOrderDebug('telegram-item-scan.success', {
      ...context,
      employeeId: employee._id,
      employeeRole: employee.role,
    });

    addActivityLog({
      action: 'order.item.scan.telegram',
      entityType: 'orderItem',
      entityId: updatedItem.itemId,
      entityName: updatedItem.name || '',
      actor: {
        type: 'telegram',
        role: employee.role,
        name: employee.fullName,
        label: `TG: ${employee.fullName}`,
      },
      message: 'Изделие открыто сотрудником по QR-коду.',
      details: {
        orderId: req.params.id,
        itemId: updatedItem.itemId,
        role: employee.role,
      },
    });

    res.json({
      ok: true,
      order: updatedOrder,
      item: updatedItem,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
      },
    });
  } catch (error) {
    logTelegramOrderDebug('telegram-item-scan.error', {
      route: 'telegram-item-scan',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось отметить изделие как взятое в работу.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось отметить изделие как взятое в работу.' });
  }
});

router.delete('/orders/:id/comments/:role', requireWriteAccess, (req, res) => {
  try {
    const itemId = String(req.query?.itemId || '').trim();
    const role = String(req.params.role || '').trim();
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }
    const comments = itemId
      ? OrderStore.deleteComment(req.params.id, itemId, role)
      : OrderStore.deleteComment(req.params.id, role);
    if (comments === null) return res.status(404).json({ message: 'Order not found' });
    if (comments === false) return res.status(404).json({ message: 'Comment not found' });
    const order = OrderStore.findById(req.params.id);
    const item = OrderStore.getOrderItem(order, itemId);
    addActivityLog({
      action: 'order.comment.delete',
      entityType: 'order',
      entityId: req.params.id,
      entityName: item?.name || order?.name || '',
      actor: getRequestActor(req, { label: 'Сотрудник' }),
      message: `Комментарий по роли "${role}" удален.`,
      details: { role, itemId: item?.itemId || '' },
    });
    res.json(comments);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.post('/orders', requireManagerAccess(), (req, res) => {
  try {
    const { orderNumber, customer, name, quantity, material, notes, orderDate, startDate, endDate } = sanitizeOrderInput(req.body || {});
    const items = sanitizeOrderItemsPayload(req.body?.items) || [];
    const order = OrderStore.create({
      orderNumber,
      customer,
      orderDate: orderDate || new Date().toISOString().split('T')[0],
      startDate,
      endDate,
      items,
    });
    addActivityLog({
      action: 'order.create',
      entityType: 'order',
      entityId: order._id,
      entityName: OrderStore.getOrderPrimaryName(order) || '',
      actor: getRequestActor(req),
      message: 'Создан новый заказ.',
      details: {
        orderNumber: order.orderNumber || '',
        customer: order.customer || '',
        items: (order.items || []).length,
      },
    });
    notifyOrderCreated(order).catch(() => {});
    res.status(201).json(order);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/orders/:id', requireManagerAccess(), (req, res) => {
  try {
    const updates = sanitizeOrderInput(req.body || {}, { partial: true });
    const items = sanitizeOrderItemsPayload(req.body?.items);
    const previousOrder = OrderStore.findById(req.params.id);
    if (!previousOrder) return res.status(404).json({ message: 'Order not found' });
    const nextOrder = OrderStore.update(req.params.id, {
      ...updates,
      ...(items ? { items } : {}),
    });
    addActivityLog({
      action: 'order.update',
      entityType: 'order',
      entityId: req.params.id,
      entityName: OrderStore.getOrderPrimaryName(nextOrder) || '',
      actor: getRequestActor(req),
      message: 'Заказ обновлен.',
      details: {
        changedFields: Object.keys({ ...updates, ...(items ? { items: true } : {}) }),
        orderNumber: nextOrder?.orderNumber || '',
        notesChanged: OrderStore.getOrderPrimaryNotes(previousOrder) !== OrderStore.getOrderPrimaryNotes(nextOrder),
      },
    });
    res.json(nextOrder);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.post('/orders/:id/archive', requireManagerAccess(), (req, res) => {
  try {
    const archiveResult = OrderStore.archive(req.params.id, {
      role: req.auth?.role || 'manager',
      name: '',
    });
    if (!archiveResult) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (archiveResult.status !== 'archived') {
      return res.status(400).json({
        message: archiveResult.message || 'Не удалось перенести заказ в архив.',
      });
    }

    addActivityLog({
      action: 'order.archive',
      entityType: 'order',
      entityId: req.params.id,
      entityName: OrderStore.getOrderPrimaryName(archiveResult.order) || '',
      actor: getRequestActor(req),
      message: 'Заказ перенесен в архив.',
      details: {
        orderNumber: archiveResult.order?.orderNumber || '',
        archivedAt: archiveResult.order?.archivedAt || '',
      },
    });

    res.json({
      ok: true,
      order: archiveResult.order,
    });
  } catch (error) {
    res.status(error.status || 400).json({
      message: error.message || 'Не удалось перенести заказ в архив.',
    });
  }
});

router.post('/orders/:id/restore', requireManagerAccess(), (req, res) => {
  try {
    const restoreResult = OrderStore.restore(req.params.id);
    if (!restoreResult) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (restoreResult.status !== 'restored') {
      return res.status(400).json({
        message: restoreResult.message || 'Не удалось вернуть заказ в работу.',
      });
    }

    addActivityLog({
      action: 'order.restore',
      entityType: 'order',
      entityId: req.params.id,
      entityName: OrderStore.getOrderPrimaryName(restoreResult.order) || '',
      actor: getRequestActor(req),
      message: 'Заказ возвращен в работу.',
      details: {
        orderNumber: restoreResult.order?.orderNumber || '',
      },
    });

    res.json({
      ok: true,
      order: restoreResult.order,
    });
  } catch (error) {
    res.status(error.status || 400).json({
      message: error.message || 'Не удалось вернуть заказ в работу.',
    });
  }
});

router.get('/orders/:id/items/:itemId/attachments/:attachmentId/file', requireWriteAccess, (req, res) => {
  try {
    const attachmentScope = getAttachmentScope(req);
    const attachmentScopeLabel = getAttachmentScopeLabel(attachmentScope);
    const attachment = OrderStore.getAttachment(req.params.id, req.params.itemId, req.params.attachmentId, { scope: attachmentScope });
    if (attachment === null) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (attachment === 'item_not_found') {
      return res.status(404).json({ message: 'Изделие заказа не найдено.' });
    }
    if (attachment === false) {
      return res.status(404).json({ message: `Файл ${attachmentScopeLabel} не найден.` });
    }

    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.name || 'attachment')}`);
    if (attachment.type) {
      res.type(attachment.type);
    }

    if (attachment.url) {
      return res.status(400).json({ message: 'Это вложение является ссылкой. Откройте его как ссылку.' });
    }

    if (attachment.content) {
      const legacyFile = parseLegacyDataUrl(attachment.content);
      if (!legacyFile) {
        return res.status(404).json({ message: `Файл ${attachmentScopeLabel} поврежден.` });
      }
      if (!attachment.type) {
        res.type(legacyFile.mimeType);
      }
      return res.send(legacyFile.buffer);
    }

    const absolutePath = resolveOrderAttachmentAbsolutePath(attachment.relativePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: `Файл ${attachmentScopeLabel} не найден на диске.` });
    }
    return res.sendFile(absolutePath);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось открыть вложение.' });
  }
});

router.post('/orders/:id/items/:itemId/attachments', requireManagerAccess(), (req, res) => {
  uploadOrderAttachment.single('file')(req, res, (uploadError) => {
    try {
      const attachmentScope = getAttachmentScope(req);
      const attachmentScopeLabel = getAttachmentScopeLabel(attachmentScope);
      if (uploadError) {
        throw uploadError;
      }
      if (!req.file) {
        fail('Выберите файл для загрузки.');
      }

      const normalizedFileName = normalizeUploadedFileName(req.file.originalname || '');
      const relativePath = path.relative(ORDER_ATTACHMENTS_ROOT, req.file.path).replace(/\\/g, '/');
      const overwriteRequested = ['1', 'true', 'yes'].includes(String(req.query?.overwrite || req.body?.overwrite || '').trim().toLowerCase());
      const attachment = sanitizeOrderAttachmentInput({
        name: normalizedFileName,
        type: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        storedName: req.file.filename,
        relativePath,
        uploadedAt: new Date().toISOString(),
      });
      const attachmentResult = OrderStore.saveAttachment(req.params.id, req.params.itemId, attachment, {
        overwrite: overwriteRequested,
        scope: attachmentScope,
      });
      if (attachmentResult.status === 'order_not_found') {
        deleteStoredAttachmentFile({ relativePath });
        return res.status(404).json({ message: 'Заказ не найден.' });
      }
      if (attachmentResult.status === 'item_not_found') {
        deleteStoredAttachmentFile({ relativePath });
        return res.status(404).json({ message: 'Изделие заказа не найдено.' });
      }
      if (attachmentResult.status === 'invalid') {
        deleteStoredAttachmentFile({ relativePath });
        return res.status(400).json({ message: `Не удалось сохранить файл ${attachmentScopeLabel}.` });
      }
      if (attachmentResult.status === 'conflict') {
        deleteStoredAttachmentFile({ relativePath });
        return res.status(409).json({
          message: `Файл "${normalizedFileName}" уже загружен в разделе ${attachmentScopeLabel}. Подтвердите перезапись.`,
          code: 'ATTACHMENT_NAME_EXISTS',
          existingAttachment: attachmentResult.existingAttachment || null,
        });
      }

      if (attachmentResult.status === 'overwritten' && attachmentResult.replacedAttachment) {
        deleteStoredAttachmentFile(attachmentResult.replacedAttachment);
      }

      const savedAttachment = attachmentResult.attachment;

      addActivityLog({
        action: attachmentResult.status === 'overwritten' ? 'order.attachment.overwrite' : 'order.attachment.create',
        entityType: 'order',
        entityId: req.params.id,
        entityName: savedAttachment?.name || attachment.name || '',
        actor: getRequestActor(req),
        message: attachmentResult.status === 'overwritten'
          ? `Файл ${attachmentScopeLabel} перезаписан.`
          : `Файл ${attachmentScopeLabel} загружен.`,
        details: {
          itemId: req.params.itemId || '',
          attachmentId: savedAttachment?.attachmentId || '',
          fileName: savedAttachment?.name || '',
          size: savedAttachment?.size || 0,
          type: savedAttachment?.type || '',
          overwritten: attachmentResult.status === 'overwritten',
          scope: attachmentScope,
        },
      });

      res.status(attachmentResult.status === 'overwritten' ? 200 : 201).json({
        ...savedAttachment,
        overwritten: attachmentResult.status === 'overwritten',
      });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      const isMulterLimit = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      res.status(error.status || (isMulterLimit ? 400 : 500)).json({
        message: isMulterLimit
          ? `Размер файла не должен превышать ${Math.round(ORDER_ATTACHMENT_FILE_SIZE_LIMIT / (1024 * 1024))} МБ.`
          : (error.message || 'Не удалось сохранить вложение.'),
      });
    }
  });
});

router.post('/orders/:id/items/:itemId/attachments/link', requireManagerAccess(), (req, res) => {
  try {
    const attachmentScope = getAttachmentScope(req);
    const attachmentScopeLabel = getAttachmentScopeLabel(attachmentScope);
    const overwriteRequested = ['1', 'true', 'yes'].includes(String(req.query?.overwrite || req.body?.overwrite || '').trim().toLowerCase());
    const attachment = sanitizeOrderAttachmentInput({
      name: req.body?.name,
      type: 'text/uri-list',
      uploadedAt: new Date().toISOString(),
      url: req.body?.url,
    });
    const attachmentResult = OrderStore.saveAttachment(req.params.id, req.params.itemId, attachment, {
      overwrite: overwriteRequested,
      scope: attachmentScope,
    });
    if (attachmentResult.status === 'order_not_found') {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (attachmentResult.status === 'item_not_found') {
      return res.status(404).json({ message: 'Изделие заказа не найдено.' });
    }
    if (attachmentResult.status === 'invalid') {
      return res.status(400).json({ message: `Не удалось сохранить ссылку ${attachmentScopeLabel}.` });
    }
    if (attachmentResult.status === 'conflict') {
      return res.status(409).json({
        message: `Вложение "${attachment.name}" уже загружено в разделе ${attachmentScopeLabel}. Подтвердите перезапись.`,
        code: 'ATTACHMENT_NAME_EXISTS',
        existingAttachment: attachmentResult.existingAttachment || null,
      });
    }

    const savedAttachment = attachmentResult.attachment;
    addActivityLog({
      action: attachmentResult.status === 'overwritten' ? 'order.attachment.overwrite' : 'order.attachment.create',
      entityType: 'order',
      entityId: req.params.id,
      entityName: savedAttachment?.name || attachment.name || '',
      actor: getRequestActor(req),
      message: attachmentResult.status === 'overwritten'
        ? `Ссылка ${attachmentScopeLabel} перезаписана.`
        : `Ссылка ${attachmentScopeLabel} добавлена.`,
      details: {
        itemId: req.params.itemId || '',
        attachmentId: savedAttachment?.attachmentId || '',
        fileName: savedAttachment?.name || '',
        url: savedAttachment?.url || '',
        overwritten: attachmentResult.status === 'overwritten',
        scope: attachmentScope,
      },
    });

    res.status(attachmentResult.status === 'overwritten' ? 200 : 201).json({
      ...savedAttachment,
      overwritten: attachmentResult.status === 'overwritten',
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сохранить ссылку.' });
  }
});

router.delete('/orders/:id/items/:itemId/attachments/:attachmentId', requireManagerAccess(), (req, res) => {
  try {
    const attachmentScope = getAttachmentScope(req);
    const attachmentScopeLabel = getAttachmentScopeLabel(attachmentScope);
    const deletedAttachment = OrderStore.deleteAttachment(req.params.id, req.params.itemId, req.params.attachmentId, { scope: attachmentScope });
    if (deletedAttachment === null) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (deletedAttachment === 'item_not_found') {
      return res.status(404).json({ message: 'Изделие заказа не найдено.' });
    }
    if (deletedAttachment === false) {
      return res.status(404).json({ message: `Файл ${attachmentScopeLabel} не найден.` });
    }

    deleteStoredAttachmentFile(deletedAttachment);

    addActivityLog({
      action: 'order.attachment.delete',
      entityType: 'order',
      entityId: req.params.id,
      entityName: deletedAttachment.name || req.params.attachmentId,
      actor: getRequestActor(req),
      message: `Файл ${attachmentScopeLabel} удален.`,
      details: {
        itemId: req.params.itemId || '',
        attachmentId: deletedAttachment.attachmentId,
        fileName: deletedAttachment.name,
        scope: attachmentScope,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось удалить вложение.' });
  }
});

router.delete('/orders/:id', requireManagerAccess(), (req, res) => {
  try {
    const db = require('../stores/store');
    const data = db.load();
    const idx = data.orders.findIndex(o => o._id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Order not found' });
    const deletedOrder = data.orders[idx];
    for (const item of deletedOrder.items || []) {
      for (const attachment of item.attachments || []) {
        deleteStoredAttachmentFile(attachment);
      }
    }
    data.orders.splice(idx, 1);
    db.save();
    addActivityLog({
      action: 'order.delete',
      entityType: 'order',
      entityId: req.params.id,
      entityName: OrderStore.getOrderPrimaryName(deletedOrder) || '',
      actor: getRequestActor(req),
      message: 'Заказ удален.',
      details: {
        orderNumber: deletedOrder?.orderNumber || '',
        customer: deletedOrder?.customer || '',
      },
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/orders/:id/items/:itemId/qrcode', async (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const item = OrderStore.getOrderItem(order, req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Order item not found' });
    const publicBaseUrl = SettingsStore.get().publicBaseUrl;
    const url = new URL(`/order/${order._id}/item/${item.itemId}`, publicBaseUrl).toString();
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.type('image/png').send(png);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/orders/:id/qrcode', async (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const item = OrderStore.getOrderItem(order);
    if (!item) return res.status(404).json({ message: 'Order item not found' });
    const publicBaseUrl = SettingsStore.get().publicBaseUrl;
    const url = new URL(`/order/${order._id}/item/${item.itemId}`, publicBaseUrl).toString();
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.type('image/png').send(png);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
