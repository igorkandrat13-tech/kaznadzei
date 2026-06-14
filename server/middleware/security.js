const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const UNSAFE_ADMIN_TOKENS = new Set(['change-me']);
const SettingsStore = require('../stores/settingsStore');

function getConfiguredAdminToken() {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token || UNSAFE_ADMIN_TOKENS.has(token)) {
    return '';
  }
  return token;
}

function getRequestToken(req) {
  const bearer = req.get('authorization') || '';
  if (bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }
  return (req.get('x-admin-token') || '').trim();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function isLoopbackIp(ip) {
  return LOOPBACK_IPS.has(ip);
}

function checkAdminAccess(req, options = {}) {
  const token = getConfiguredAdminToken();
  const allowLocalWithoutToken = options.allowLocalWithoutToken !== false;

  if (!token) {
    if (allowLocalWithoutToken && isLoopbackIp(getClientIp(req))) {
      return null;
    }

    return {
      status: 503,
      body: {
        message: options.missingTokenMessage || 'Административный токен не настроен или использует небезопасное значение. Укажите свой ADMIN_TOKEN в .env.',
      },
    };
  }

  if (getRequestToken(req) === token) {
    return null;
  }

  return {
    status: 401,
    body: {
      message: options.invalidTokenMessage || 'Требуется административный токен.',
    },
  };
}

function requireAdminAccess(options = {}) {
  return (req, res, next) => {
    const error = checkAdminAccess(req, options);
    if (error) {
      return res.status(error.status).json(error.body);
    }
    next();
  };
}

function requireWriteAccess(req, res, next) {
  next();
}

function isSelfUpdateEnabled() {
  return Boolean(SettingsStore.get().selfUpdateEnabled);
}

function buildSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

module.exports = {
  buildSecurityHeaders,
  checkAdminAccess,
  getConfiguredAdminToken,
  isSelfUpdateEnabled,
  requireAdminAccess,
  requireWriteAccess,
};
