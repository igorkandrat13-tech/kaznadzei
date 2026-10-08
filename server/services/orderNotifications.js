const EmployeeStore = require('../stores/employeeStore');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const { sendMessage, sendPhotoWithAttachment, sendMediaGroupWithAttachments } = require('./telegramService');
const { normalizeEmployeeBotKinds } = require('../stores/employeeStore');

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

function formatDurationRussian(msValue) {
  const numericMs = Number(msValue);
  if (!Number.isFinite(numericMs) || numericMs < 0) return '';
  let totalSeconds = Math.floor(numericMs / 1000);
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  totalSeconds -= days * SECONDS_PER_DAY;
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  totalSeconds -= hours * SECONDS_PER_HOUR;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  totalSeconds -= minutes * SECONDS_PER_MINUTE;
  const seconds = totalSeconds;
  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}мин`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}сек`);
  return parts.join(' ');
}

function buildWorkshopRequestCompletedSupplyText(request = {}, options = {}) {
  const requestNumber = Number(request?.requestNumber) || 0;
  const text = String(request?.text || '').trim() || 'Заявка';
  const titleLine = requestNumber > 0 ? `Заявка №${requestNumber}` : 'Заявка';
  const authorName = String(request?.employeeName || options?.authorName || '').trim() || 'Не указан';
  const executorName = String(request?.resolvedBy?.employeeName || options?.executorName || '').trim() || 'Не указан';
  const createdAtStr = String(request?.createdAt || '').trim();
  const resolvedAtStr = String(request?.resolvedAt || options?.resolvedAt || '').trim();
  let durationLine = '';
  if (createdAtStr && resolvedAtStr) {
    const createdMs = new Date(createdAtStr).getTime();
    const resolvedMs = new Date(resolvedAtStr).getTime();
    if (Number.isFinite(createdMs) && Number.isFinite(resolvedMs) && resolvedMs >= createdMs) {
      const durationText = formatDurationRussian(resolvedMs - createdMs);
      if (durationText) {
        durationLine = `Время выполнения - ${durationText}`;
      }
    }
  }
  const lines = [
    titleLine,
    `${text} - Выполнено`,
    `Автор - ${shortFullNameEmployee(authorName)}`,
    `Исполнитель - ${shortFullNameEmployee(executorName)}`,
  ];
  if (durationLine) lines.push(durationLine);
  return lines.filter(Boolean).join('\n');
}

function buildWorkshopRequestReopenSupplyText(request = {}, options = {}) {
  const requestNumber = Number(request?.requestNumber) || 0;
  const text = String(request?.text || '').trim() || 'Заявка';
  const titleLine = requestNumber > 0 ? `Заявка №${requestNumber}` : 'Заявка';
  const authorName = String(request?.employeeName || options?.authorName || '').trim() || 'Не указан';
  const executorName = String(options?.executorName || request?.resolvedBy?.employeeName || '').trim() || 'Не указан';
  const lines = [
    titleLine,
    `${text} - Возврат в работу`,
    `Автор - ${shortFullNameEmployee(authorName)}`,
    `Исполнитель - ${shortFullNameEmployee(executorName)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

const STAGE_STATUS_LABELS = {
  pending: 'Ожидает',
  in_progress: 'В работе',
  completed: 'Готово',
};

function shortFullNameEmployee(fullName = '') {
  const raw = String(fullName || '').trim();
  if (!raw) return 'Администратор';
  const parts = raw.split(/\s+/).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return raw;
  const surname = parts[0];
  const initials = parts.slice(1).map((part) => `${part.charAt(0).toUpperCase()}.`).join('');
  return initials ? `${surname} ${initials}` : surname;
}

function getOrderItemsCount(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.length;
}

function getStageStatusByLegendKey(legendKey = '') {
  const normalized = String(legendKey || '').trim();
  if (normalized === 'ready') return STAGE_STATUS_LABELS.completed;
  if (normalized === 'unprocessed') return STAGE_STATUS_LABELS.pending;
  if (!normalized) return STAGE_STATUS_LABELS.pending;
  return STAGE_STATUS_LABELS.in_progress;
}

function getEmployeeTelegramBotTokens(employee, { notificationType = 'any' } = {}) {
  const settings = SettingsStore.get() || {};
  const kinds = normalizeEmployeeBotKinds(employee);
  const primaryToken = String(settings.telegramBotToken || '').trim();
  const supplyToken = String(settings.telegramSupplyBotToken || '').trim();
  const tokens = [];
  const type = String(notificationType || 'any');
  const allowPrimary = type !== 'request-only';
  const allowSupply = type !== 'status-only';
  if (allowPrimary && kinds.includes('primary') && primaryToken) {
    tokens.push({ botKind: 'primary', token: primaryToken });
  }
  if (allowSupply && kinds.includes('supply') && supplyToken) {
    tokens.push({ botKind: 'supply', token: supplyToken });
  }
  return tokens;
}

function getTelegramReadyEmployeesByRole(role) {
  return EmployeeStore.findAll().filter(employee => (
    employee.role === role
    && String(employee.telegramChatId || '').trim()
  ));
}

function getTelegramReadyEmployeesByIds(employeeIds = []) {
  const normalizedIds = new Set(
    (Array.isArray(employeeIds) ? employeeIds : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  );
  if (!normalizedIds.size) {
    return [];
  }
  return EmployeeStore.findAll().filter((employee) => (
    normalizedIds.has(String(employee._id || '').trim())
    && String(employee.telegramChatId || '').trim()
  ));
}

async function notifyEmployeesByRole(role, text) {
  if (!role || !text) return;

  const employees = getTelegramReadyEmployeesByRole(role);
  const sends = [];
  employees.forEach((employee) => {
    const tokens = getEmployeeTelegramBotTokens(employee, { notificationType: 'status-only' });
    tokens.forEach(({ token }) => {
      sends.push(sendMessage(token, employee.telegramChatId, text));
    });
  });
  if (!sends.length) return;
  await Promise.allSettled(sends);
}

async function notifyEmployeesByIds(employeeIds = [], text = '', options = {}) {
  const normalizedText = String(text || '').trim();
  const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
  const photoAttachments = attachments.filter((attachment) => {
    if (!attachment || typeof attachment !== 'object') return false;
    if (Buffer.isBuffer(attachment.buffer)) return true;
    if (String(attachment.fileId || '').trim()) return true;
    if (/^https?:\/\//i.test(String(attachment.url || '').trim())) return true;
    if (String(attachment.absolutePath || '').trim()) return true;
    if (String(attachment.relativePath || '').trim()) return true;
    return false;
  });
  if (!normalizedText && photoAttachments.length === 0) return;
  const notificationType = String(options?.notificationType || 'any');

  const employees = getTelegramReadyEmployeesByIds(employeeIds);
  if (!employees.length) return;

  const sends = [];
  employees.forEach((employee) => {
    const tokens = getEmployeeTelegramBotTokens(employee, { notificationType });
    tokens.forEach(({ token }) => {
      if (photoAttachments.length === 1 && normalizedText) {
        sends.push(sendPhotoWithAttachment(token, employee.telegramChatId, photoAttachments[0], { caption: normalizedText }).catch(() => (
          sendMessage(token, employee.telegramChatId, normalizedText)
        )));
      } else if (photoAttachments.length > 1) {
        sends.push(sendMediaGroupWithAttachments(token, employee.telegramChatId, photoAttachments, { caption: normalizedText }).catch(async () => {
          if (normalizedText) {
            await sendMessage(token, employee.telegramChatId, normalizedText);
          }
          await Promise.allSettled(
            photoAttachments.map((photoAttachment) => sendPhotoWithAttachment(token, employee.telegramChatId, photoAttachment))
          );
        }));
      } else if (normalizedText) {
        sends.push(sendMessage(token, employee.telegramChatId, normalizedText));
      }
    });
  });
  if (!sends.length) return;
  await Promise.allSettled(sends);
}

async function notifyMaterialRequestWatchers(text = '', options = {}) {
  const recipientIds = SettingsStore.get().telegramRequestNotificationEmployeeIds || [];
  const notificationType = String(options?.notificationType || 'request-only');
  const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
  await notifyEmployeesByIds(recipientIds, text, {
    notificationType,
    attachments,
  });
}

async function notifySupplyWorkshopRequestCompleted(request = {}, options = {}) {
  const text = buildWorkshopRequestCompletedSupplyText(request, options);
  if (!text) return;
  await notifyMaterialRequestWatchers(text, {
    notificationType: 'request-only',
    attachments: Array.isArray(options?.attachments) ? options.attachments : [],
  });
}

async function notifySupplyWorkshopRequestReopened(request = {}, options = {}) {
  const text = buildWorkshopRequestReopenSupplyText(request, options);
  if (!text) return;
  await notifyMaterialRequestWatchers(text, {
    notificationType: 'request-only',
    attachments: Array.isArray(options?.attachments) ? options.attachments : [],
  });
}

function buildSupplyItemRequestCompletedText(item = {}, options = {}) {
  const requestNumber = Number(item?.requestNumber || options?.requestNumber || 0) || 0;
  const name = String(item?.name || options?.name || '').trim() || 'Заявка';
  const titleLine = requestNumber > 0 ? `Заявка №${requestNumber}` : 'Заявка';
  const authorName = String(item?.createdBy?.employeeName || options?.authorName || '').trim() || 'Не указан';
  const executorName = String(item?.completedBy?.employeeName || options?.executorName || '').trim() || 'Не указан';
  const createdAtStr = String(item?.createdAt || '').trim();
  const resolvedAtStr = String(item?.completedAt || options?.resolvedAt || '').trim();
  let durationLine = '';
  if (createdAtStr && resolvedAtStr) {
    const createdMs = new Date(createdAtStr).getTime();
    const resolvedMs = new Date(resolvedAtStr).getTime();
    if (Number.isFinite(createdMs) && Number.isFinite(resolvedMs) && resolvedMs >= createdMs) {
      const durationText = formatDurationRussian(resolvedMs - createdMs);
      if (durationText) {
        durationLine = `Время выполнения - ${durationText}`;
      }
    }
  }
  const lines = [
    titleLine,
    `${name} - Выполнено`,
    `Автор - ${shortFullNameEmployee(authorName)}`,
    `Исполнитель - ${shortFullNameEmployee(executorName)}`,
  ];
  if (durationLine) lines.push(durationLine);
  return lines.filter(Boolean).join('\n');
}

function buildSupplyItemRequestReopenText(item = {}, options = {}) {
  const requestNumber = Number(item?.requestNumber || options?.requestNumber || 0) || 0;
  const name = String(item?.name || options?.name || '').trim() || 'Заявка';
  const titleLine = requestNumber > 0 ? `Заявка №${requestNumber}` : 'Заявка';
  const authorName = String(item?.createdBy?.employeeName || options?.authorName || '').trim() || 'Не указан';
  const executorName = String(options?.executorName || item?.completedBy?.employeeName || '').trim() || 'Не указан';
  const lines = [
    titleLine,
    `${name} - Возврат в работу`,
    `Автор - ${shortFullNameEmployee(authorName)}`,
    `Исполнитель - ${shortFullNameEmployee(executorName)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

async function notifySupplyItemRequestCompleted(item = {}, options = {}) {
  const text = buildSupplyItemRequestCompletedText(item, options);
  if (!text) return;
  await notifyMaterialRequestWatchers(text, {
    notificationType: 'request-only',
    attachments: Array.isArray(options?.attachments) ? options.attachments : [],
  });
}

async function notifySupplyItemRequestReopened(item = {}, options = {}) {
  const text = buildSupplyItemRequestReopenText(item, options);
  if (!text) return;
  await notifyMaterialRequestWatchers(text, {
    notificationType: 'request-only',
    attachments: Array.isArray(options?.attachments) ? options.attachments : [],
  });
}

async function notifyOrderCreated(order) {
  const stages = OrderStore.getOrderStages(order);
  const firstActiveStage = stages.find(stage => stage.status === 'in_progress')
    || stages[0];
  if (!firstActiveStage?.role) return;

  await notifyEmployeesByRole(
    firstActiveStage.role,
    [
      'Новый заказ в работе.',
      `Номер заказа: ${order.orderNumber || 'не указан'}`,
      `Изделие: ${OrderStore.getOrderPrimaryName(order) || 'не указано'}`,
      `Заказчик: ${order.customer || 'не указан'}`,
      `Количество: ${OrderStore.getOrderPrimaryQuantity(order) || 1}`,
      `Материал: ${OrderStore.getOrderPrimaryMaterial(order) || 'не указан'}`,
      `Ваш этап: ${firstActiveStage.stepName || 'без названия'}`,
    ].join('\n')
  );
}

function buildStageWatcherText(order, itemsUpdate = [], options = {}) {
  if (!order) return '';
  const list = Array.isArray(itemsUpdate) ? itemsUpdate : [];
  if (!list.length) return '';
  const orderLine = `Заказ: ${String(order?.orderNumber || 'не указан').trim()}`;
  const blocks = list.map((update) => {
    const itemNumber = String(update?.itemNumber || '').trim();
    const itemName = String(update?.itemName || '').trim();
    const itemLine = itemNumber
      ? `Номер изделия: ${itemNumber} - ${itemName || 'Без названия'}`
      : `Номер изделия: ${itemName || 'Без названия'}`;
    const stageLabel = String(update?.stageLabel || '').trim() || 'Этап производства';
    const statusLine = `Статус изделия: ${stageLabel}`;
    const actor = String(update?.actorName || '').trim() || 'Администратор';
    const actorLine = `Сотрудник: ${shortFullNameEmployee(actor)}`;
    return [orderLine, itemLine, statusLine, actorLine].join('\n');
  }).filter(Boolean);
  return blocks.join('\n\n');
}

async function notifyStageWatchers(order, itemsUpdate, options = {}) {
  const recipientIds = SettingsStore.get().telegramStageNotificationEmployeeIds || [];
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;
  const text = buildStageWatcherText(order, itemsUpdate, options);
  if (!text) return;
  await notifyEmployeesByIds(recipientIds, text, { notificationType: 'status-only' });
}

module.exports = {
  buildWorkshopRequestCompletedSupplyText,
  buildWorkshopRequestReopenSupplyText,
  buildSupplyItemRequestCompletedText,
  buildSupplyItemRequestReopenText,
  formatDurationRussian,
  notifyEmployeesByRole,
  notifyEmployeesByIds,
  notifyMaterialRequestWatchers,
  notifyOrderCreated,
  notifyStageWatchers,
  notifySupplyWorkshopRequestCompleted,
  notifySupplyWorkshopRequestReopened,
  notifySupplyItemRequestCompleted,
  notifySupplyItemRequestReopened,
  buildStageWatcherText,
  getEmployeeTelegramBotTokens,
};
