const https = require('https');
const fs = require('fs');
const path = require('path');

function telegramRequest(token, method, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${encodeURIComponent(token)}/${method}`,
      method: body ? 'POST' : 'GET',
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      } : undefined,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (!parsed.ok) {
            reject(new Error(parsed.description || `Telegram API error: ${method}`));
            return;
          }
          resolve(parsed.result);
        } catch (error) {
          reject(new Error(`Не удалось разобрать ответ Telegram API для ${method}.`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function randomMultipartBoundary() {
  return `----KaznadzeiBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildMultipartFormBuffer(fields = {}, files = [], boundary = '') {
  const effectiveBoundary = boundary || randomMultipartBoundary();
  const parts = [];
  const pushBuffer = (value) => {
    parts.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
  };
  const fieldKeys = Object.keys(fields || {});
  for (const key of fieldKeys) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    pushBuffer(`--${effectiveBoundary}\r\n`);
    pushBuffer(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    pushBuffer(String(value));
    pushBuffer('\r\n');
  }
  const fileList = Array.isArray(files) ? files : [];
  for (const file of fileList) {
    if (!file || !file.fieldName) continue;
    const fileName = String(file.fileName || 'file').replace(/[^\w.\- ()[\]]/g, '_');
    const fileBuffer = Buffer.isBuffer(file.buffer)
      ? file.buffer
      : (Buffer.from(String(file.buffer || '')));
    pushBuffer(`--${effectiveBoundary}\r\n`);
    pushBuffer(
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${fileName}"\r\n`
    );
    pushBuffer(`Content-Type: ${String(file.mimeType || 'application/octet-stream').trim() || 'application/octet-stream'}\r\n\r\n`);
    pushBuffer(fileBuffer);
    pushBuffer('\r\n');
  }
  pushBuffer(`--${effectiveBoundary}--\r\n`);
  return {
    boundary: effectiveBoundary,
    buffer: Buffer.concat(parts),
  };
}

function telegramRequestMultipart(token, method, fields = {}, files = []) {
  return new Promise((resolve, reject) => {
    const { boundary, buffer } = buildMultipartFormBuffer(fields, files);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${encodeURIComponent(token)}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': buffer.length,
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (!parsed.ok) {
            reject(new Error(parsed.description || `Telegram API error: ${method} (multipart)`));
            return;
          }
          resolve(parsed.result);
        } catch (error) {
          reject(new Error(`Не удалось разобрать multipart-ответ Telegram API для ${method}.`));
        }
      });
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

function normalizePhotoAttachmentInput(attachment = {}) {
  if (!attachment || typeof attachment !== 'object') return null;
  const fileId = String(attachment.fileId || attachment.file_id || '').trim();
  const url = String(attachment.url || '').trim();
  const relativePath = String(attachment.relativePath || attachment.relative_path || '').trim();
  const absolutePath = String(attachment.absolutePath || attachment.absolute_path || '').trim();
  const name = String(attachment.name || attachment.fileName || attachment.filename || 'photo').trim();
  const mimeType = String(attachment.mimeType || attachment.mime_type || attachment.type || '').trim() || 'image/jpeg';
  const buffer = Buffer.isBuffer(attachment.buffer) ? attachment.buffer : null;
  if (fileId) {
    return { type: 'fileId', value: fileId, name, mimeType };
  }
  if (url && /^https?:\/\//i.test(url)) {
    return { type: 'url', value: url, name, mimeType };
  }
  if (buffer && buffer.length > 0) {
    return { type: 'buffer', buffer, name, mimeType };
  }
  if (absolutePath && fs.existsSync(absolutePath)) {
    try {
      return {
        type: 'buffer',
        buffer: fs.readFileSync(absolutePath),
        name: name || path.basename(absolutePath),
        mimeType,
      };
    } catch (readErr) {
      return null;
    }
  }
  if (relativePath) {
    return {
      type: 'relativePath',
      value: relativePath,
      resolver: attachment.resolver || null,
      name,
      mimeType,
    };
  }
  return null;
}

async function sendPhotoWithAttachment(token, chatId, photoAttachment = {}, extra = {}) {
  const normalized = normalizePhotoAttachmentInput(photoAttachment);
  if (!normalized) {
    throw new Error('Не указано фото для отправки.');
  }
  if (normalized.type === 'fileId' || normalized.type === 'url') {
    return sendPhoto(token, chatId, normalized.value, extra || {});
  }
  if (normalized.type === 'buffer') {
    const fields = { chat_id: chatId };
    if (extra && typeof extra === 'object') {
      for (const key of Object.keys(extra)) {
        fields[key] = extra[key];
      }
    }
    return telegramRequestMultipart(token, 'sendPhoto', fields, [
      {
        fieldName: 'photo',
        fileName: normalized.name || 'photo.jpg',
        mimeType: normalized.mimeType || 'image/jpeg',
        buffer: normalized.buffer,
      },
    ]);
  }
  if (normalized.type === 'relativePath') {
    let absolutePath = '';
    if (typeof normalized.resolver === 'function') {
      absolutePath = normalized.resolver(normalized.value) || '';
    } else {
      absolutePath = path.resolve(process.cwd(), normalized.value);
    }
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      throw new Error('Фото не найдено по относительному пути.');
    }
    const buffer = fs.readFileSync(absolutePath);
    return sendPhotoWithAttachment(token, chatId, {
      buffer,
      name: normalized.name || path.basename(absolutePath),
      mimeType: normalized.mimeType,
    }, extra || {});
  }
  throw new Error('Неподдерживаемый формат фото для отправки.');
}

async function sendMediaGroupWithAttachments(token, chatId, photoAttachments = [], { caption, parseMode } = {}) {
  const list = (Array.isArray(photoAttachments) ? photoAttachments : [])
    .map((photoAttachment, index) => ({
      normalized: normalizePhotoAttachmentInput(photoAttachment),
      original: photoAttachment,
      index,
    }))
    .filter((entry) => Boolean(entry.normalized));

  if (!list.length) {
    throw new Error('Нет фото для отправки в альбом.');
  }

  const bufferFiles = [];
  const mediaPayload = list.map((entry, i) => {
    const item = entry.normalized;
    const attachKey = `photo${i + 1}`;
    let mediaValue = '';
    if (item.type === 'fileId' || item.type === 'url') {
      mediaValue = item.value;
    } else if (item.type === 'buffer') {
      bufferFiles.push({
        fieldName: attachKey,
        fileName: item.name || `photo${i + 1}.jpg`,
        mimeType: item.mimeType || 'image/jpeg',
        buffer: item.buffer,
      });
      mediaValue = `attach://${attachKey}`;
    } else if (item.type === 'relativePath') {
      let absolutePath = '';
      if (typeof item.resolver === 'function') {
        absolutePath = item.resolver(item.value) || '';
      } else {
        absolutePath = path.resolve(process.cwd(), item.value);
      }
      if (absolutePath && fs.existsSync(absolutePath)) {
        try {
          const buffer = fs.readFileSync(absolutePath);
          bufferFiles.push({
            fieldName: attachKey,
            fileName: item.name || path.basename(absolutePath),
            mimeType: item.mimeType || 'image/jpeg',
            buffer,
          });
          mediaValue = `attach://${attachKey}`;
        } catch (readErr) {
          return null;
        }
      } else {
        return null;
      }
    }
    return {
      type: 'photo',
      media: mediaValue,
      ...(i === 0 && caption ? { caption } : {}),
      ...(i === 0 && caption && parseMode ? { parse_mode: parseMode } : {}),
    };
  }).filter(Boolean);

  if (!mediaPayload.length) {
    throw new Error('Не удалось подготовить альбом с фото.');
  }

  const fields = {
    chat_id: chatId,
    media: JSON.stringify(mediaPayload),
  };
  return telegramRequestMultipart(token, 'sendMediaGroup', fields, bufferFiles);
}

async function getBotInfo(token) {
  return telegramRequest(token, 'getMe');
}

async function getWebhookInfo(token) {
  return telegramRequest(token, 'getWebhookInfo');
}

async function setWebhook(token, url) {
  return telegramRequest(token, 'setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
  });
}

async function sendMessage(token, chatId, text, extra = {}) {
  return telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function sendPhoto(token, chatId, photoUrlOrFileId, extra = {}) {
  return telegramRequest(token, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrlOrFileId,
    ...extra,
  });
}

async function createForumTopic(token, chatId, name) {
  return telegramRequest(token, 'createForumTopic', {
    chat_id: chatId,
    name,
  });
}

async function answerCallbackQuery(token, callbackQueryId, text = '') {
  return telegramRequest(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

async function deleteMessage(token, chatId, messageId) {
  return telegramRequest(token, 'deleteMessage', {
    chat_id: chatId,
    message_id: Number(messageId) || 0,
  });
}

async function getFile(token, fileId) {
  return telegramRequest(token, 'getFile', {
    file_id: fileId,
  });
}

async function downloadTelegramFile(token, filePath) {
  return new Promise((resolve, reject) => {
    const normalizedFilePath = String(filePath || '').trim().replace(/^\/+/, '');
    if (!normalizedFilePath) {
      reject(new Error('Не указан путь к файлу Telegram.'));
      return;
    }

    const encodedFilePath = normalizedFilePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/file/bot${encodeURIComponent(token)}/${encodedFilePath}`,
      method: 'GET',
    }, (res) => {
      if ((res.statusCode || 0) >= 400) {
        reject(new Error('Не удалось скачать файл из Telegram.'));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function setChatMenuButton(token, { chatId, text, url, type } = {}) {
  const payload = {};
  if (chatId) {
    payload.chat_id = chatId;
  }
  if (type === 'default') {
    payload.menu_button = { type: 'default' };
  } else if (text && url) {
    payload.menu_button = {
      type: 'web_app',
      text,
      web_app: { url },
    };
  }
  return telegramRequest(token, 'setChatMenuButton', payload);
}

async function getChatMenuButton(token, { chatId } = {}) {
  const payload = {};
  if (chatId) {
    payload.chat_id = chatId;
  }
  return telegramRequest(token, 'getChatMenuButton', payload);
}

module.exports = {
  getBotInfo,
  getWebhookInfo,
  setWebhook,
  setChatMenuButton,
  getChatMenuButton,
  sendMessage,
  sendPhoto,
  sendPhotoWithAttachment,
  sendMediaGroupWithAttachments,
  deleteMessage,
  createForumTopic,
  answerCallbackQuery,
  getFile,
  downloadTelegramFile,
};
