const EmployeeStore = require('../stores/employeeStore');
const SettingsStore = require('../stores/settingsStore');
const { sendMessage } = require('./telegramService');

function getRoleLabel(role) {
  const labels = {
    carpenter: 'Столяр',
    assembler: 'Комплектовщик',
    painter: 'Маляр',
    designer: 'Дизайнер',
  };
  return labels[role] || role;
}

function getTelegramReadyEmployeesByRole(role) {
  return EmployeeStore.findAll().filter(employee => (
    employee.role === role
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

async function notifyOrderCreated(order) {
  const firstActiveStage = (order.stages || []).find(stage => stage.status === 'in_progress')
    || (order.stages || [])[0];
  if (!firstActiveStage?.role) return;

  await notifyEmployeesByRole(
    firstActiveStage.role,
    [
      'Новый заказ в работе.',
      `Изделие: ${order.name}`,
      `Заказчик: ${order.customer || 'не указан'}`,
      `Количество: ${order.quantity || 1}`,
      `Материал: ${order.material || 'не указан'}`,
      `Ваш этап: ${firstActiveStage.stepName || 'без названия'}`,
    ].join('\n')
  );
}

async function notifyNextStage(order, completedStepId) {
  const stages = Array.isArray(order.stages) ? order.stages : [];
  const completedIndex = stages.findIndex(stage => stage.stepId === completedStepId);
  if (completedIndex === -1) return;

  const nextStage = stages.slice(completedIndex + 1).find(stage => stage.status !== 'completed');
  if (!nextStage?.role) return;

  await notifyEmployeesByRole(
    nextStage.role,
    [
      'Заказ готов к следующему этапу.',
      `Изделие: ${order.name}`,
      `Заказчик: ${order.customer || 'не указан'}`,
      `Следующий специалист: ${getRoleLabel(nextStage.role)}`,
      `Этап: ${nextStage.stepName || 'без названия'}`,
    ].join('\n')
  );
}

async function notifyOrderCompleted(order) {
  const token = String(SettingsStore.get().telegramBotToken || '').trim();
  if (!token) return;

  const employees = EmployeeStore.findAll().filter(employee => String(employee.telegramChatId || '').trim());
  const text = [
    'Заказ завершен.',
    `Изделие: ${order.name}`,
    `Заказчик: ${order.customer || 'не указан'}`,
    `Количество: ${order.quantity || 1}`,
  ].join('\n');

  await Promise.allSettled(
    employees.map(employee => sendMessage(token, employee.telegramChatId, text))
  );
}

module.exports = {
  notifyEmployeesByRole,
  notifyOrderCreated,
  notifyNextStage,
  notifyOrderCompleted,
};
