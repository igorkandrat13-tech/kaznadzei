const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'db.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    cache = {};
  }
  cache.processSteps = cache.processSteps || [];
  cache.orders = cache.orders || [];
  cache.colors = cache.colors || [];
  return cache;
}

function save() {
  const data = {
    processSteps: cache.processSteps || [],
    orders: cache.orders || [],
    colors: cache.colors || [],
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  cache = null;
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { load, save, id };
