const crypto = require('crypto');

const TELEGRAM_EMPLOYEE_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const TELEGRAM_EMPLOYEE_SESSION_EXPIRATION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const TELEGRAM_INIT_DATA_STRICT_TTL_SEC = 24 * 60 * 60;
const TELEGRAM_INIT_DATA_STALE_TTL_SEC = 180 * 24 * 60 * 60;

function extractTelegramInitDataUser(initData) {
  const normalizedInitData = String(initData || '').trim();
  if (!normalizedInitData) return null;
  const params = new URLSearchParams(normalizedInitData);
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch (error) {
    return null;
  }
}

function getTelegramWebAppUser(token, initData, { allowStaleSignature = false } = {}) {
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

  const authDateRaw = Number(params.get('auth_date') || 0);
  const authDateSec = Number.isFinite(authDateRaw) ? authDateRaw : 0;
  const nowSec = Math.floor(Date.now() / 1000);

  if (authDateSec <= 0) {
    throw new Error('Отсутствует дата авторизации в initData Telegram Web App.');
  }

  const ageSec = Math.max(0, nowSec - authDateSec);
  if (ageSec <= TELEGRAM_INIT_DATA_STRICT_TTL_SEC) {
    return {
      ...user,
      signatureStale: false,
      authDateSec,
      ageSec,
    };
  }

  const staleLimit = Math.max(TELEGRAM_INIT_DATA_STRICT_TTL_SEC, Number(TELEGRAM_INIT_DATA_STALE_TTL_SEC || 0));
  if (!allowStaleSignature || ageSec > staleLimit) {
    throw new Error('Подпись Telegram Web App устарела. Для продолжения откройте web app заново через кнопку в боте.');
  }

  return {
    ...user,
    signatureStale: true,
    authDateSec,
    ageSec,
  };
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
    try {
      return getTelegramWebAppUser(token, initData, { allowStaleSignature: true });
    } catch (error) {
      const staleFallbackUser = extractTelegramInitDataUser(initData);
      if (staleFallbackUser && staleFallbackUser.id) {
        return {
          ...staleFallbackUser,
          signatureInvalid: true,
          initDataFallback: true,
        };
      }
      const unsafeUser = payload?.unsafeUser;
      if (!unsafeUser || !unsafeUser.id) {
        throw error;
      }
    }
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
    exp: Date.now() + TELEGRAM_EMPLOYEE_SESSION_TTL_MS,
  };
  const payloadPart = encodeBase64Url(JSON.stringify(payload));
  const signaturePart = crypto
    .createHmac('sha256', String(token || '').trim())
    .update(payloadPart)
    .digest('hex');
  return `${payloadPart}.${signaturePart}`;
}

function verifyTelegramEmployeeSessionToken(token, sessionToken, { allowGracePeriod = false } = {}) {
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

  const exp = Number(payload.exp || 0);
  const now = Date.now();
  const allowGrace = Boolean(allowGracePeriod);
  const graceLimit = exp + TELEGRAM_EMPLOYEE_SESSION_EXPIRATION_GRACE_MS;

  if (exp > 0 && now < exp) {
    return {
      ...payload,
      expired: false,
      graceAllowed: false,
    };
  }

  if (allowGrace && exp > 0 && now <= graceLimit) {
    return {
      ...payload,
      expired: true,
      graceAllowed: true,
    };
  }

  if (exp <= 0) {
    return {
      ...payload,
      expired: false,
      graceAllowed: false,
    };
  }

  throw new Error('Session token Telegram Web App истёк. Откройте сканер заново из бота.');
}

module.exports = {
  createTelegramEmployeeSessionToken,
  getTelegramWebAppUser,
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
};
