const express = require('express');
const fs = require('fs');
const { requireManagerAccess, requireWriteAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const {
  deleteWorkshopRequestAttachmentFiles,
  resolveWorkshopRequestAttachmentAbsolutePath,
} = require('../services/workshopRequestAttachments');
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

router.get('/workshop-requests/:id/attachments/:attachmentId/file', requireWriteAccess, (req, res) => {
  const requestItem = WorkshopRequestStore.findById(req.params.id);
  if (!requestItem) {
    return res.status(404).json({ message: 'Заявка не найдена.' });
  }

  const attachmentId = String(req.params.attachmentId || '').trim();
  const attachment = (Array.isArray(requestItem.attachments) ? requestItem.attachments : [])
    .find((item) => String(item.attachmentId || '').trim() === attachmentId);
  if (!attachment) {
    return res.status(404).json({ message: 'Фото заявки не найдено.' });
  }

  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.name || 'attachment')}`);
  if (attachment.type) {
    res.type(attachment.type);
  }

  if (attachment.url) {
    return res.status(400).json({ message: 'Это вложение является ссылкой. Откройте его как ссылку.' });
  }

  const absolutePath = resolveWorkshopRequestAttachmentAbsolutePath(attachment.relativePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: 'Фото заявки не найдено на диске.' });
  }
  return res.sendFile(absolutePath);
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

router.delete('/workshop-requests/:id', requireManagerAccess(), (req, res) => {
  const requestId = String(req.params.id || '').trim();
  if (!requestId) {
    return res.status(400).json({ message: 'Не указана заявка.' });
  }

  const deletedItem = WorkshopRequestStore.delete(requestId);
  if (deletedItem === null) {
    return res.status(404).json({ message: 'Заявка не найдена.' });
  }
  if (deletedItem === false) {
    return res.status(400).json({ message: 'Некорректная заявка.' });
  }

  deleteWorkshopRequestAttachmentFiles(deletedItem.attachments);

  addActivityLog({
    action: 'workshop-request.delete',
    entityType: 'workshopRequest',
    entityId: deletedItem._id,
    entityName: deletedItem.text,
    actor: getRequestActor(req),
    message: 'Цеховая заявка удалена.',
    details: {
      workshopRequestId: deletedItem._id,
      employeeId: deletedItem.employeeId || '',
      employeeName: deletedItem.employeeName || '',
    },
  });

  return res.json({
    ok: true,
    item: deletedItem,
  });
});

module.exports = router;
