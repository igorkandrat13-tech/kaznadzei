const fs = require('fs');
const path = require('path');
const { id } = require('../stores/store');

const WORKSHOP_REQUEST_ATTACHMENTS_ROOT = path.join(__dirname, '..', 'uploads', 'workshop-requests');

function ensureDirectoryExists(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function getExtensionFromMimeType(mimeType = '') {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  if (normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/jpg') return '.jpg';
  if (normalizedMimeType === 'image/png') return '.png';
  if (normalizedMimeType === 'image/webp') return '.webp';
  if (normalizedMimeType === 'image/gif') return '.gif';
  if (normalizedMimeType === 'image/bmp') return '.bmp';
  return '';
}

function buildStoredFileName(extension = '') {
  const normalizedExtension = String(extension || '').trim().toLowerCase();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${normalizedExtension}`;
}

function createWorkshopRequestAttachment({
  originalName = '',
  mimeType = 'image/jpeg',
  buffer,
  telegramFilePath = '',
  uploadedAt = '',
} = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Не удалось подготовить фото заявки.');
  }

  ensureDirectoryExists(WORKSHOP_REQUEST_ATTACHMENTS_ROOT);

  const fileExtension = path.extname(String(originalName || '').trim()).toLowerCase()
    || path.extname(String(telegramFilePath || '').trim()).toLowerCase()
    || getExtensionFromMimeType(mimeType)
    || '.jpg';
  const storedName = buildStoredFileName(fileExtension);
  const absolutePath = path.join(WORKSHOP_REQUEST_ATTACHMENTS_ROOT, storedName);
  fs.writeFileSync(absolutePath, buffer);

  return {
    attachmentId: id(),
    name: String(originalName || '').trim() || `Фото заявки${fileExtension}`,
    type: String(mimeType || '').trim() || 'image/jpeg',
    size: buffer.length,
    uploadedAt: String(uploadedAt || '').trim() || new Date().toISOString(),
    relativePath: storedName,
  };
}

function resolveWorkshopRequestAttachmentAbsolutePath(relativePath = '') {
  const normalizedRelativePath = String(relativePath || '').trim().replace(/\\/g, '/');
  if (!normalizedRelativePath) return '';
  const absolutePath = path.resolve(WORKSHOP_REQUEST_ATTACHMENTS_ROOT, normalizedRelativePath);
  if (!absolutePath.startsWith(path.resolve(WORKSHOP_REQUEST_ATTACHMENTS_ROOT))) {
    return '';
  }
  return absolutePath;
}

function deleteWorkshopRequestAttachmentFiles(attachments = []) {
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const absolutePath = resolveWorkshopRequestAttachmentAbsolutePath(attachment?.relativePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) continue;
    try {
      fs.unlinkSync(absolutePath);
    } catch (error) {
      console.error('Workshop request attachment delete error:', error.message);
    }
  }
}

ensureDirectoryExists(WORKSHOP_REQUEST_ATTACHMENTS_ROOT);

module.exports = {
  WORKSHOP_REQUEST_ATTACHMENTS_ROOT,
  createWorkshopRequestAttachment,
  deleteWorkshopRequestAttachmentFiles,
  resolveWorkshopRequestAttachmentAbsolutePath,
};
