const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'db.json');
const DB_TMP_PATH = DB_PATH + '.tmp';
const DB_BAK_PATH = DB_PATH + '.bak';

let cache = null;
let debouncedSaveTimer = null;
let saveInFlight = false;
let pendingSaveAfterCurrent = false;

function normalizeDb(source = {}) {
  return {
    processSteps: Array.isArray(source.processSteps) ? source.processSteps : [],
    orders: Array.isArray(source.orders) ? source.orders : [],
    customers: Array.isArray(source.customers) ? source.customers : [],
    colors: Array.isArray(source.colors) ? source.colors : [],
    settings: source.settings && typeof source.settings === 'object' ? source.settings : {},
    employees: Array.isArray(source.employees) ? source.employees : [],
    activityLogs: Array.isArray(source.activityLogs) ? source.activityLogs : [],
    customerTelegramAccesses: Array.isArray(source.customerTelegramAccesses) ? source.customerTelegramAccesses : [],
    customerTelegramLogs: Array.isArray(source.customerTelegramLogs) ? source.customerTelegramLogs : [],
    customerTelegramBridgeMessages: Array.isArray(source.customerTelegramBridgeMessages) ? source.customerTelegramBridgeMessages : [],
    workshopRequests: Array.isArray(source.workshopRequests) ? source.workshopRequests : [],
    users: Array.isArray(source.users) ? source.users : [],
    permissionRoles: Array.isArray(source.permissionRoles) ? source.permissionRoles : [],
  };
}

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    cache = normalizeDb(JSON.parse(raw));
  } catch {
    try {
      const rawBak = fs.readFileSync(DB_BAK_PATH, 'utf8');
      cache = normalizeDb(JSON.parse(rawBak));
    } catch {
      cache = normalizeDb({});
    }
  }
  return cache;
}

function flushSync() {
  const data = normalizeDb(cache || {});
  const json = JSON.stringify(data);
  try {
    if (fs.existsSync(DB_PATH)) {
      try { fs.copyFileSync(DB_PATH, DB_BAK_PATH); } catch { /* ignore backup errors */ }
    }
  } catch { /* ignore */ }
  try {
    fs.writeFileSync(DB_TMP_PATH, json, { encoding: 'utf8' });
    fs.renameSync(DB_TMP_PATH, DB_PATH);
  } catch (err) {
    try {
      fs.writeFileSync(DB_PATH, json, { encoding: 'utf8' });
    } catch (writeErr) {
      throw writeErr;
    }
  }
}

function performAsyncSave() {
  saveInFlight = true;
  let finished = false;
  const finalize = () => {
    if (finished) return;
    finished = true;
    saveInFlight = false;
    if (pendingSaveAfterCurrent) {
      pendingSaveAfterCurrent = false;
      performAsyncSave();
    }
  };
  try {
    const data = normalizeDb(cache || {});
    const json = JSON.stringify(data);
    try {
      if (fs.existsSync(DB_PATH)) {
        try { fs.copyFileSync(DB_PATH, DB_BAK_PATH); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    fs.writeFile(DB_TMP_PATH, json, { encoding: 'utf8' }, (writeErr) => {
      if (writeErr) {
        try {
          fs.writeFileSync(DB_PATH, json, { encoding: 'utf8' });
        } catch { /* swallow */ }
        return finalize();
      }
      fs.rename(DB_TMP_PATH, DB_PATH, (renameErr) => {
        if (renameErr) {
          try {
            fs.writeFileSync(DB_PATH, json, { encoding: 'utf8' });
            try { fs.unlinkSync(DB_TMP_PATH); } catch { /* ignore */ }
          } catch { /* swallow */ }
        }
        finalize();
      });
    });
  } catch (syncErr) {
    try { flushSync(); } catch { /* ignore */ }
    finalize();
  }
}

function save() {
  if (debouncedSaveTimer) {
    clearTimeout(debouncedSaveTimer);
    debouncedSaveTimer = null;
  }
  if (saveInFlight) {
    pendingSaveAfterCurrent = true;
    return;
  }
  debouncedSaveTimer = setTimeout(() => {
    debouncedSaveTimer = null;
    performAsyncSave();
  }, 300);
}

function saveImmediate() {
  if (debouncedSaveTimer) {
    clearTimeout(debouncedSaveTimer);
    debouncedSaveTimer = null;
  }
  if (saveInFlight) {
    pendingSaveAfterCurrent = true;
    return;
  }
  performAsyncSave();
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getSnapshot() {
  return JSON.parse(JSON.stringify(load()));
}

function replaceSnapshot(nextSnapshot) {
  cache = normalizeDb(nextSnapshot || {});
  save();
}

process.on('exit', () => {
  try {
    if (debouncedSaveTimer) {
      clearTimeout(debouncedSaveTimer);
      debouncedSaveTimer = null;
    }
    flushSync();
  } catch { /* ignore */ }
});

process.on('SIGINT', () => {
  try {
    if (debouncedSaveTimer) {
      clearTimeout(debouncedSaveTimer);
      debouncedSaveTimer = null;
    }
    flushSync();
  } catch { /* ignore */ }
  process.exit(0);
});

process.on('SIGTERM', () => {
  try {
    if (debouncedSaveTimer) {
      clearTimeout(debouncedSaveTimer);
      debouncedSaveTimer = null;
    }
    flushSync();
  } catch { /* ignore */ }
  process.exit(0);
});

module.exports = { load, save, saveImmediate, flushSync, id, getSnapshot, replaceSnapshot, normalizeDb };
