const express = require('express');
const { requireManagerAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { WORKSHOP_REQUEST_STATUS, WorkshopRequestStore } = require('../stores/workshopRequestStore');

const router = express.Router();

function getWorkshopRequestStatusLabel(status = '') {
  return String(status || '').trim() === WORKSHOP_REQUEST_STATUS.COMPLETED
    ? 'Закрыта'
    : 'Открыта';
}

router.get('/workshop-requests', requireManagerAccess(), (req, res) => {
  const items = WorkshopRequestStore.findAll();
  res.json({
    ok: true,
    items,
  });
});

router.patch('/workshop-requests/:id/status', requireManagerAccess(), (req, res) => {
  const requestId = String(req.params.id || '').trim();
  const status = String(req.body?.status || '').trim();
  if (!requestId) {
    return res.status(400).json({ message: 'Не указана заявка.' });
  }
  if (![WORKSHOP_REQUEST_STATUS.OPEN, WORKSHOP_REQUEST_STATUS.COMPLETED].includes(status)) {
    return res.status(400).json({ message: 'Некорректный статус заявки.' });
  }

  const updatedItem = WorkshopRequestStore.updateStatus(requestId, status, {
    employeeId: req.auth?.employeeId || '',
    employeeName: req.auth?.employeeName || req.auth?.name || '',
    role: req.auth?.role || '',
  });
  if (!updatedItem) {
    return res.status(404).json({ message: 'Заявка не найдена.' });
  }

  addActivityLog({
    action: 'workshop-request.status.update',
    entityType: 'workshopRequest',
    entityId: updatedItem._id,
    entityName: updatedItem.text,
    actor: getRequestActor(req),
    message: `Статус цеховой заявки изменен: ${getWorkshopRequestStatusLabel(updatedItem.status)}.`,
    details: {
      workshopRequestId: updatedItem._id,
      status: updatedItem.status,
      employeeId: updatedItem.employeeId || '',
      employeeName: updatedItem.employeeName || '',
    },
  });

  return res.json({
    ok: true,
    item: updatedItem,
  });
});

module.exports = router;
