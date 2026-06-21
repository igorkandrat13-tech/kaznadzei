const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '..', 'telegram-logs.json');
const MAX_LOG_ENTRIES = 400;

function readLogs() {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeLogs(logs) {
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
