const express = require('express');
const EmployeeStore = require('../stores/employeeStore');
const { requireWriteAccess } = require('../middleware/security');
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
  const deleted = EmployeeStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Сотрудник не найден.' });
  }
  res.json({ message: 'Сотрудник удален.' });
});

module.exports = router;
