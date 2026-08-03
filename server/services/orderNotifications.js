const EmployeeStore = require('../stores/employeeStore');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const { sendMessage } = require('./telegramService');

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
  const token = String(SettingsStore.get().telegramBotToken || '').trim();
  if (!token || !role || !text) return;

  const employees = getTelegramReadyEmployeesByRole(role);
  await Promise.allSettled(
    employees.map(employee => sendMessage(token, employee.telegramChatId, text))
  );
}

async function notifyEmployeesByIds(employeeIds = [], text = '') {
  const token = String(SettingsStore.get().telegramBotToken || '').trim();
  const normalizedText = String(text || '').trim();
  if (!token || !normalizedText) return;

  const employees = getTelegramReadyEmployeesByIds(employeeIds);
  if (!employees.length) return;

  await Promise.allSettled(
    employees.map((employee) => sendMessage(token, employee.telegramChatId, normalizedText))
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
