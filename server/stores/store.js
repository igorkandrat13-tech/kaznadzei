const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'db.json');

let cache = null;

function normalizeDb(source = {}) {
  return {
    processSteps: Array.isArray(source.processSteps) ? source.processSteps : [],
    orders: Array.isArray(source.orders) ? source.orders : [],
    colors: Array.isArray(source.colors) ? source.colors : [],
    settings: source.settings && typeof source.settings === 'object' ? source.settings : {},
    employees: Array.isArray(source.employees) ? source.employees : [],
    activityLogs: Array.isArray(source.activityLogs) ? source.activityLogs : [],
  };
}

function load() {
  if (cache) return cache;
  try {
    cache = normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
  } catch {
    cache = normalizeDb({});
  }
  return cache;
}

function save() {
  const data = normalizeDb(cache || {});
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  cache = null;
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

module.exports = { load, save, id, getSnapshot, replaceSnapshot, normalizeDb };
