const express = require('express');
const EmployeeStore = require('../stores/employeeStore');
const SettingsStore = require('../stores/settingsStore');
const { requireWriteAccess } = require('../middleware/security');
const { sendMessage } = require('../services/telegramService');
const { sanitizeEmployeeInput } = require('../utils/validators');

const router = express.Router();

router.get('/employees', requireWriteAccess, (req, res) => {
  const employees = EmployeeStore.findAll().sort((a, b) => {
    const roleDiff = String(a.role || '').localeCompare(String(b.role || ''), 'ru');
    if (roleDiff !== 0) return roleDiff;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'ru');
  });
  res.json(employees);
});

router.post('/employees', requireWriteAccess, (req, res) => {
  try {
    const employee = EmployeeStore.create(sanitizeEmployeeInput(req.body || {}));
    res.status(201).json(employee);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/employees/:id', requireWriteAccess, (req, res) => {
  try {
    const employee = EmployeeStore.update(req.params.id, sanitizeEmployeeInput(req.body || {}, { partial: true }));
    if (!employee) {
      return res.status(404).json({ message: 'Сотрудник не найден.' });
    }
    res.json(employee);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/employees/:id', requireWriteAccess, (req, res) => {
  const employee = EmployeeStore.findById(req.params.id);
  if (!employee) {
    return res.status(404).json({ message: 'Сотрудник не найден.' });
  }

  const deleted = EmployeeStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Сотрудник не найден.' });
  }

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

  sendMessage(
    token,
    chatId,
    `Ваш профиль в системе Kaznadzei удален администратором.\nСотрудник: ${employee.fullName}\nДоступ к заказам и Telegram-функциям отключен.\nЕсли это ошибка, обратитесь к администратору.`
  )
    .then(() => finishResponse())
    .catch(() => finishResponse('Сотрудник удален, но уведомление в Telegram отправить не удалось.'));
});

module.exports = router;
