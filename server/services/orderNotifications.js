const EmployeeStore = require('../stores/employeeStore');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const { sendMessage } = require('./telegramService');

function getEmployeeTelegramBotToken(employee) {
  const settings = SettingsStore.get() || {};
  const botKind = String(employee?.telegramBotKind || 'primary').trim() === 'supply' ? 'supply' : 'primary';
  if (botKind === 'supply') {
    return String(settings.telegramSupplyBotToken || '').trim();
  }
  return String(settings.telegramBotToken || '').trim();
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
  await Promise.allSettled(
    employees.map((employee) => {
      const token = getEmployeeTelegramBotToken(employee);
      if (!token) return null;
      return sendMessage(token, employee.telegramChatId, text);
    }).filter(Boolean),
  );
}

async function notifyEmployeesByIds(employeeIds = [], text = '') {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return;

  const employees = getTelegramReadyEmployeesByIds(employeeIds);
  if (!employees.length) return;

  await Promise.allSettled(
    employees.map((employee) => {
      const token = getEmployeeTelegramBotToken(employee);
      if (!token) return null;
      return sendMessage(token, employee.telegramChatId, normalizedText);
    }).filter(Boolean),
  );
}

async function notifyMaterialRequestWatchers(text = '') {
  const recipientIds = SettingsStore.get().telegramRequestNotificationEmployeeIds || [];
  await notifyEmployeesByIds(recipientIds, text);
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

module.exports = {
  notifyEmployeesByRole,
  notifyEmployeesByIds,
  notifyMaterialRequestWatchers,
  notifyOrderCreated,
};
