const MAX_ENTRIES = 10000;
const FAILED_THRESHOLD = 3;
const LOCK_WINDOW_MS = 60 * 1000;
const EVICT_AFTER_MS = 30 * 60 * 1000;

const state = new Map();

function getClientIpKey(req) {
  const forwarded = req && req.headers && typeof req.headers['x-forwarded-for'] === 'string'
    ? req.headers['x-forwarded-for']
    : '';
  if (forwarded.trim()) return forwarded.split(',')[0].trim();
  if (req && req.ip) return String(req.ip);
  if (req && req.socket && req.socket.remoteAddress) return String(req.socket.remoteAddress);
  return 'unknown';
}

function evictStaleIfNeeded() {
  if (state.size <= MAX_ENTRIES) return;
  const now = Date.now();
  const keys = Array.from(state.keys());
  for (const key of keys) {
    const entry = state.get(key);
    if (!entry || (now - (entry.lastFail || entry.lockUntil || 0)) > EVICT_AFTER_MS) {
      state.delete(key);
    }
    if (state.size <= MAX_ENTRIES) break;
  }
  if (state.size > MAX_ENTRIES) {
    const excess = state.size - Math.floor(MAX_ENTRIES * 0.8);
    const keys2 = Array.from(state.keys()).slice(0, excess);
    for (const k of keys2) state.delete(k);
  }
}

function isLockedOut(ip) {
  const key = String(ip || '');
  const entry = state.get(key);
  if (!entry) return { locked: false, lockRemainingMs: 0, failCount: 0 };
  const now = Date.now();
  if (entry.lockUntil && now < entry.lockUntil) {
    return {
      locked: true,
      lockRemainingMs: Math.max(0, entry.lockUntil - now),
      failCount: entry.failCount || 0,
    };
  }
  return { locked: false, lockRemainingMs: 0, failCount: entry.failCount || 0 };
}

function isLockedOutRequest(req) {
  return isLockedOut(getClientIpKey(req));
}

function recordFailedAttempt(ip) {
  const key = String(ip || '');
  const now = Date.now();
  const current = state.get(key);
  const prevFailCount = current && Number(current.failCount) > 0 ? Number(current.failCount) : 0;
  const nextFailCount = prevFailCount + 1;
  const lockUntil = nextFailCount >= FAILED_THRESHOLD ? now + LOCK_WINDOW_MS : (current?.lockUntil || 0);
  state.set(key, {
    failCount: nextFailCount,
    lastFail: now,
    lockUntil: lockUntil > now ? lockUntil : 0,
  });
  evictStaleIfNeeded();
  return isLockedOut(key);
}

function recordFailedAttemptRequest(req) {
  return recordFailedAttempt(getClientIpKey(req));
}

function recordSuccessfulLogin(ip) {
  const key = String(ip || '');
  state.delete(key);
}

function recordSuccessfulLoginRequest(req) {
  recordSuccessfulLogin(getClientIpKey(req));
}

function resetAll() {
  state.clear();
}

module.exports = {
  FAILED_THRESHOLD,
  LOCK_WINDOW_MS,
  getClientIpKey,
  isLockedOut,
  isLockedOutRequest,
  recordFailedAttempt,
  recordFailedAttemptRequest,
  recordSuccessfulLogin,
  recordSuccessfulLoginRequest,
  resetAll,
};
