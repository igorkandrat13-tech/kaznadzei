const crypto = require('crypto');
const SettingsStore = require('../stores/settingsStore');

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const UNSAFE_ADMIN_TOKENS = new Set(['change-me']);

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

function getBootstrapAdminPassword() {
  const token = String(process.env.ADMIN_TOKEN || '').trim();
  if (!token || UNSAFE_ADMIN_TOKENS.has(token)) {
    return '';
  }
  return token;
}

function normalizePassword(value) {
  return String(value || '').trim();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const normalizedPassword = normalizePassword(password);
  const passwordHash = crypto
    .createHash('sha256')
    .update(`${salt}:${normalizedPassword}`)
    .digest('hex');
  return `${salt}:${passwordHash}`;
}

function verifyPassword(password, storedHash) {
  const normalizedHash = String(storedHash || '').trim();
  const normalizedPassword = normalizePassword(password);
  if (!normalizedHash || !normalizedPassword) {
    return false;
  }

  const [salt, existingHash] = normalizedHash.split(':');
  if (!salt || !existingHash) {
    return false;
  }

  const nextHash = crypto
    .createHash('sha256')
    .update(`${salt}:${normalizedPassword}`)
    .digest('hex');

  const provided = Buffer.from(existingHash, 'hex');
  const expected = Buffer.from(nextHash, 'hex');
  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

function getAuthSessionSecret() {
  const config = SettingsStore.getAuthConfig();
  return String(config.authSessionSecret || '').trim();
}

function signPayload(payload) {
  const payloadPart = encodeBase64Url(JSON.stringify(payload));
  const signaturePart = crypto
    .createHmac('sha256', getAuthSessionSecret())
    .update(payloadPart)
    .digest('hex');
  return `${payloadPart}.${signaturePart}`;
}

function verifySignedPayload(sessionToken) {
  const normalizedToken = String(sessionToken || '').trim();
  if (!normalizedToken) {
    throw new Error('Не передана сессия авторизации.');
  }

  const [payloadPart, signaturePart] = normalizedToken.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('Некорректная сессия авторизации.');
  }

  const expectedSignature = crypto
    .createHmac('sha256', getAuthSessionSecret())
    .update(payloadPart)
    .digest('hex');

  const provided = Buffer.from(signaturePart, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Сессия авторизации не прошла проверку.');
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart));
  } catch (error) {
    throw new Error('Не удалось разобрать сессию авторизации.');
  }

  return payload;
}

function createAppSessionToken(role) {
  const normalizedRole = String(role || '').trim();
  return signPayload({
    role: normalizedRole,
    exp: Date.now() + SESSION_TTL_MS,
    tokenType: 'app-session',
  });
}

function verifyAppSessionToken(sessionToken) {
  const payload = verifySignedPayload(sessionToken);

  const hasNewFormat = payload && (payload.userId || payload.tokenType === 'app-session' && payload.permissions);
  const hasLegacyFormat = payload && payload.role;

  if (!hasNewFormat && !hasLegacyFormat) {
    throw new Error('Сессия авторизации неполная.');
  }

  if (Number(payload.exp || 0) < Date.now()) {
    throw new Error('Сессия авторизации истекла. Выполните вход снова.');
  }

  if (hasLegacyFormat && !hasNewFormat) {
    const fullAccess = payload.role === 'admin';
    const managerAccess = payload.role === 'admin' || payload.role === 'manager';
    payload.userId = payload.userId || 'legacy';
    payload.username = payload.username || (fullAccess ? 'Administrator' : 'manager');
    payload.roleId = payload.roleId || '';
    payload.roleKey = fullAccess ? 'full-access' : (managerAccess ? 'legacy-manager' : 'legacy-worker');
    payload.fullAccess = fullAccess;
    payload.permissions = {
      orders: managerAccess,
      requests: managerAccess,
      archive: fullAccess,
      customers: fullAccess,
      employees: fullAccess,
      stages: fullAccess,
      users: fullAccess,
      settings: fullAccess,
    };
  }

  return payload;
}

function canAccessRole(actualRole, requiredRole) {
  if (requiredRole === 'manager') {
    return actualRole === 'manager' || actualRole === 'admin';
  }
  if (requiredRole === 'admin') {
    return actualRole === 'admin';
  }
  return false;
}

function authenticateRolePassword(role, password) {
  const normalizedRole = String(role || '').trim();
  const normalizedPassword = normalizePassword(password);
  const config = SettingsStore.getAuthConfig();

  if (!normalizedPassword) {
    throw new Error('Введите пароль.');
  }

  if (normalizedRole === 'admin') {
    if (config.adminPasswordHash) {
      if (!verifyPassword(normalizedPassword, config.adminPasswordHash)) {
        throw new Error('Неверный пароль администратора.');
      }
      return { role: 'admin', bootstrapUsed: false };
    }

    const bootstrapPassword = getBootstrapAdminPassword();
    if (!bootstrapPassword) {
      throw new Error('Пароль администратора ещё не настроен. Задайте его из панели администратора после bootstrap-входа.');
    }
    if (normalizedPassword !== bootstrapPassword) {
      throw new Error('Неверный пароль администратора.');
    }
    return { role: 'admin', bootstrapUsed: true };
  }

  throw new Error('Неизвестная роль для входа.');
}

function getPublicAuthConfig() {
  const config = SettingsStore.getAuthConfig();
  return {
    adminPasswordConfigured: Boolean(config.adminPasswordHash),
    adminBootstrapAvailable: Boolean(!config.adminPasswordHash && getBootstrapAdminPassword()),
  };
}

function createAppSessionTokenForUser(user, role) {
  const userId = String(user?._id || '');
  const username = String(user?.username || '');
  const roleId = String(role?._id || '');
  const isSystemRole = Boolean(role?.isSystem);
  const pages = role?.pages && typeof role.pages === 'object' ? role.pages : {};
  const permissions = {};
  for (const key of ['orders', 'requests', 'archive', 'customers', 'employees', 'stages', 'users', 'settings']) {
    permissions[key] = isSystemRole ? true : Boolean(pages[key]);
  }
  const fullAccess = isSystemRole;
  return signPayload({
    tokenType: 'app-session',
    userId,
    username,
    roleId,
    roleKey: isSystemRole ? 'full-access' : 'custom',
    fullAccess,
    permissions,
    exp: Date.now() + SESSION_TTL_MS,
  });
}

function authenticateUsernamePassword(username, password) {
  const UserStore = require('../stores/userStore');
  const PermissionRoleStore = require('../stores/permissionRoleStore');
  const normalizedUsername = String(username || '').trim();
  const normalizedPassword = normalizePassword(password);
  if (!normalizedUsername) throw new Error('Введите имя пользователя.');
  if (!normalizedPassword) throw new Error('Введите пароль.');
  const user = UserStore.findByUsername(normalizedUsername);
  if (!user) throw new Error('Неверное имя пользователя или пароль.');
  if (!verifyPassword(normalizedPassword, user.passwordHash || '')) {
    throw new Error('Неверное имя пользователя или пароль.');
  }
  const role = user.roleId ? PermissionRoleStore.findById(user.roleId) : null;
  return { user, role: role || null };
}

module.exports = {
  authenticateRolePassword,
  authenticateUsernamePassword,
  canAccessRole,
  createAppSessionToken,
  createAppSessionTokenForUser,
  getPublicAuthConfig,
  getBootstrapAdminPassword,
  hashPassword,
  verifyAppSessionToken,
  verifyPassword,
};
