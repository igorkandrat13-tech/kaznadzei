const crypto = require('crypto');

function getTelegramWebAppUser(token, initData) {
  const normalizedToken = String(token || '').trim();
  const normalizedInitData = String(initData || '').trim();

  if (!normalizedToken) {
    throw new Error('Токен Telegram-бота не настроен.');
  }

  if (!normalizedInitData) {
    throw new Error('Не передан initData Telegram Web App.');
  }

  const params = new URLSearchParams(normalizedInitData);
  const hash = params.get('hash');
  if (!hash) {
    throw new Error('Отсутствует hash в initData Telegram Web App.');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(normalizedToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const providedHash = Buffer.from(hash, 'hex');
  const expectedHash = Buffer.from(calculatedHash, 'hex');

  if (providedHash.length !== expectedHash.length || !crypto.timingSafeEqual(providedHash, expectedHash)) {
    throw new Error('Подпись Telegram Web App не прошла проверку.');
  }

  const userJson = params.get('user');
  if (!userJson) {
    throw new Error('В initData отсутствуют данные пользователя Telegram.');
  }

  let user;
  try {
    user = JSON.parse(userJson);
  } catch (error) {
    throw new Error('Не удалось разобрать пользователя Telegram из initData.');
  }

  if (!user?.id) {
    throw new Error('Некорректные данные пользователя Telegram.');
  }

  return user;
}

function getTelegramWebAppUserFallback(payload) {
  const unsafeUser = payload?.unsafeUser;
  if (!unsafeUser || !unsafeUser.id) {
    throw new Error('Не переданы данные пользователя Telegram Web App.');
  }

  return {
    id: unsafeUser.id,
    username: unsafeUser.username || '',
    first_name: unsafeUser.first_name || '',
    last_name: unsafeUser.last_name || '',
  };
}

function resolveTelegramWebAppUser(token, payload) {
  const initData = String(payload?.initData || '').trim();
  if (initData) {
    return getTelegramWebAppUser(token, initData);
  }

  return getTelegramWebAppUserFallback(payload);
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function createTelegramEmployeeSessionToken(token, employee) {
  const payload = {
    employeeId: employee._id,
    telegramUserId: String(employee.telegramUserId || ''),
    role: employee.role || '',
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  const payloadPart = encodeBase64Url(JSON.stringify(payload));
  const signaturePart = crypto
    .createHmac('sha256', String(token || '').trim())
    .update(payloadPart)
    .digest('hex');
  return `${payloadPart}.${signaturePart}`;
}

function verifyTelegramEmployeeSessionToken(token, sessionToken) {
  const normalizedToken = String(token || '').trim();
  const normalizedSessionToken = String(sessionToken || '').trim();
  if (!normalizedToken || !normalizedSessionToken) {
    throw new Error('Не передан session token Telegram Web App.');
  }

  const [payloadPart, signaturePart] = normalizedSessionToken.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('Некорректный session token Telegram Web App.');
  }

  const expectedSignature = crypto
    .createHmac('sha256', normalizedToken)
    .update(payloadPart)
    .digest('hex');

  const provided = Buffer.from(signaturePart, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Session token Telegram Web App не прошёл проверку.');
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart));
  } catch (error) {
    throw new Error('Не удалось разобрать session token Telegram Web App.');
  }

  if (!payload?.employeeId || !payload?.telegramUserId) {
    throw new Error('Session token Telegram Web App неполный.');
  }

  if (Number(payload.exp || 0) < Date.now()) {
    throw new Error('Session token Telegram Web App истёк. Откройте сканер заново из бота.');
  }

  return payload;
}

module.exports = {
  createTelegramEmployeeSessionToken,
  getTelegramWebAppUser,
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
};
