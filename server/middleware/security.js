const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const UNSAFE_ADMIN_TOKENS = new Set(['change-me']);
const SettingsStore = require('../stores/settingsStore');
const { canAccessRole, verifyAppSessionToken } = require('../services/appAuth');

const PAGE_KEYS = ['orders', 'requests', 'archive', 'customers', 'employees', 'stages', 'users', 'settings'];

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

function getRequestSessionToken(req) {
  const bearer = req.get('authorization') || '';
  if (bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }
  return '';
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

function requirePageAccess(page, options = {}) {
  return (req, res, next) => {
    if (!PAGE_KEYS.includes(page)) {
      return res.status(500).json({ message: `Неизвестная страница ACL: ${page}` });
    }
    try {
      const sessionToken = getRequestSessionToken(req);
      if (sessionToken) {
        const session = verifyAppSessionToken(sessionToken);
        const hasPermission = Boolean(session.fullAccess || (session.permissions && session.permissions[page]));
        if (hasPermission) {
          req.auth = session;
          return next();
        }
        return res.status(403).json({
          message: options.invalidTokenMessage || `Недостаточно прав для доступа к разделу "${page}".`,
        });
      }
    } catch (error) {
      return res.status(401).json({
        message: options.invalidTokenMessage || error.message || 'Требуется вход по паролю.',
      });
    }

    const fallback = checkAdminAccess(req, options);
    if (fallback) {
      return res.status(fallback.status).json(fallback.body);
    }
    next();
  };
}

function requireAdminAccess(options = {}) {
  return requirePageAccess('settings', options);
}

function requireManagerAccess(options = {}) {
  return requirePageAccess('orders', options);
}

function requireAnyPageAccess(pages = [], options = {}) {
  const normalizedPages = Array.isArray(pages) ? pages.filter(Boolean) : [];
  const badPage = normalizedPages.find((p) => !PAGE_KEYS.includes(p));
  if (badPage) {
    return (_req, res) => res.status(500).json({ message: `Неизвестная страница ACL: ${badPage}` });
  }
  return (req, res, next) => {
    try {
      const sessionToken = getRequestSessionToken(req);
      if (sessionToken) {
        const session = verifyAppSessionToken(sessionToken);
        const hasPermission = Boolean(
          session.fullAccess
          || (
            session.permissions
            && normalizedPages.some((page) => Boolean(session.permissions[page]))
          ),
        );
        if (hasPermission) {
          req.auth = session;
          return next();
        }
        return res.status(403).json({
          message: options.invalidTokenMessage || 'Недостаточно прав для этого действия.',
        });
      }
    } catch (error) {
      return res.status(401).json({
        message: options.invalidTokenMessage || error.message || 'Требуется вход по паролю.',
      });
    }

    const fallback = checkAdminAccess(req, options);
    if (fallback) {
      return res.status(fallback.status).json(fallback.body);
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
  PAGE_KEYS,
  buildSecurityHeaders,
  checkAdminAccess,
  getConfiguredAdminToken,
  isSelfUpdateEnabled,
  requireAnyPageAccess,
  requirePageAccess,
  requireAdminAccess,
  requireManagerAccess,
  requireWriteAccess,
};
