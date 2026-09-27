const EmployeeStore = require('../stores/employeeStore');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const { sendMessage, sendPhotoWithAttachment, sendMediaGroupWithAttachments } = require('./telegramService');
const { normalizeEmployeeBotKinds } = require('../stores/employeeStore');

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
  await notifyEmployeesByIds(recipientIds, text, {
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
  notifyEmployeesByRole,
  notifyEmployeesByIds,
  notifyMaterialRequestWatchers,
  notifyOrderCreated,
  notifyStageWatchers,
  buildStageWatcherText,
  getEmployeeTelegramBotTokens,
};
