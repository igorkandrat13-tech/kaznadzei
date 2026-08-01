const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', '.runtime');
const LOG_PATH = path.join(LOG_DIR, 'telegram-logs.json');
const LEGACY_LOG_PATH = path.join(__dirname, '..', '..', 'telegram-logs.json');
const MAX_LOG_ENTRIES = 400;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function readLogsFromFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function readLogs() {
  if (fs.existsSync(LOG_PATH)) {
    return readLogsFromFile(LOG_PATH);
  }

  const legacyLogs = readLogsFromFile(LEGACY_LOG_PATH);
  if (legacyLogs.length > 0) {
    writeLogs(legacyLogs);
  }
  return legacyLogs;
}

function writeLogs(logs) {
  ensureLogDir();
  const normalizedLogs = Array.isArray(logs) ? logs.slice(-MAX_LOG_ENTRIES) : [];
  fs.writeFileSync(LOG_PATH, JSON.stringify(normalizedLogs, null, 2));
}

function addTelegramDiagnosticLog(scope, event, details = {}) {
  const logs = readLogs();
  logs.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    scope: String(scope || '').trim() || 'telegram',
    event: String(event || '').trim() || 'event',
    details: details && typeof details === 'object' ? details : { value: String(details || '') },
  });
  writeLogs(logs);
}

function getTelegramDiagnosticLogs({ limit = 200 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 200, MAX_LOG_ENTRIES));
  const logs = readLogs();
  return logs.slice(-normalizedLimit).reverse();
}

function clearTelegramDiagnosticLogs() {
  writeLogs([]);
}

module.exports = {
  addTelegramDiagnosticLog,
  getTelegramDiagnosticLogs,
  clearTelegramDiagnosticLogs,
};
