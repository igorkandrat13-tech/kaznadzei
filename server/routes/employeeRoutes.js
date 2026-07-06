const express = require('express');
const EmployeeStore = require('../stores/employeeStore');
const SettingsStore = require('../stores/settingsStore');
const { requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { sendMessage, setChatMenuButton } = require('../services/telegramService');
const { sanitizeEmployeeInput } = require('../utils/validators');

const router = express.Router();

router.get('/employees', requireAdminAccess(), (req, res) => {
  const employees = EmployeeStore.findAll().sort((a, b) => {
    const roleDiff = String(a.role || '').localeCompare(String(b.role || ''), 'ru');
    if (roleDiff !== 0) return roleDiff;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'ru');
  });
  res.json(employees);
});

router.post('/employees', requireAdminAccess(), (req, res) => {
  try {
    const employee = EmployeeStore.create(sanitizeEmployeeInput(req.body || {}));
    addActivityLog({
      action: 'employee.create',
      entityType: 'employee',
      entityId: employee._id,
      entityName: employee.fullName || '',
      actor: getRequestActor(req),
      message: 'Добавлен сотрудник.',
      details: { role: employee.role || '' },
    });
    res.status(201).json(employee);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/employees/:id', requireAdminAccess(), (req, res) => {
  try {
    const updates = sanitizeEmployeeInput(req.body || {}, { partial: true });
    const employee = EmployeeStore.update(req.params.id, updates);
    if (!employee) {
      return res.status(404).json({ message: 'Сотрудник не найден.' });
    }
    addActivityLog({
      action: 'employee.update',
      entityType: 'employee',
      entityId: employee._id,
      entityName: employee.fullName || '',
      actor: getRequestActor(req),
      message: 'Данные сотрудника обновлены.',
      details: { changedFields: Object.keys(updates) },
    });
    res.json(employee);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/employees/:id', requireAdminAccess(), (req, res) => {
  const employee = EmployeeStore.findById(req.params.id);
  if (!employee) {
    return res.status(404).json({ message: 'Сотрудник не найден.' });
  }

  const deleted = EmployeeStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Сотрудник не найден.' });
  }

  addActivityLog({
    action: 'employee.delete',
    entityType: 'employee',
    entityId: employee._id,
    entityName: employee.fullName || '',
    actor: getRequestActor(req),
    message: 'Сотрудник удален.',
    details: { role: employee.role || '' },
  });

  const token = String(SettingsStore.get().telegramBotToken || '').trim();
  const chatId = String(employee.telegramChatId || '').trim();

  const finishResponse = (warningMessage = '') => {
    res.json({
      message: 'Сотрудник удален.',
      warning: warningMessage || '',
    });
  };

  if (!token || !chatId) {
    finishResponse();
    return;
  }

  setChatMenuButton(token, { chatId, type: 'default' })
    .catch(() => null)
    .then(() => sendMessage(
      token,
      chatId,
      `Ваш профиль в системе Kaznadzei удален администратором.\nСотрудник: ${employee.fullName}\nДоступ к заказам и Telegram-функциям отключен.\nЕсли это ошибка, обратитесь к администратору.`
    ))
    .then(() => finishResponse())
    .catch(() => finishResponse('Сотрудник удален, но уведомление в Telegram отправить не удалось.'));
});

module.exports = router;
