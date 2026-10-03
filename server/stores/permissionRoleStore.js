const { load, save, id } = require('./store');

const PAGE_KEYS = ['orders', 'requests', 'archive', 'customers', 'employees', 'stages', 'users', 'settings'];

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizePages(source = {}) {
  const pages = {};
  for (const key of PAGE_KEYS) {
    pages[key] = Boolean(source[key]);
  }
  return pages;
}

const PermissionRoleStore = {
  PAGE_KEYS,

  findAll() {
    return load().permissionRoles.map(item => ({ ...item, pages: normalizePages(item.pages) }));
  },

  findById(roleId) {
    const raw = load().permissionRoles.find(item => item._id === roleId) || null;
    return raw ? { ...raw, pages: normalizePages(raw.pages) } : null;
  },

  findByName(name) {
    const target = normalizeName(name);
    if (!target) return null;
    const raw = load().permissionRoles.find(item => normalizeName(item.name) === target) || null;
    return raw ? { ...raw, pages: normalizePages(raw.pages) } : null;
  },

  findSystemFullAccess() {
    const db = load();
    const raw = db.permissionRoles.find(item => Boolean(item.isSystem)) || null;
    if (!raw) return null;
    return { ...raw, pages: normalizePages(raw.pages) };
  },

  count() {
    return load().permissionRoles.length;
  },

  create(data) {
    const db = load();
    const name = normalizeName(data.name);
    if (!name) throw new Error('Имя права не может быть пустым.');
    const collision = db.permissionRoles.find(item => normalizeName(item.name) === name);
    if (collision) throw new Error('Право с таким именем уже существует.');
    const role = {
      _id: id(),
      name,
      isSystem: Boolean(data.isSystem),
      pages: normalizePages(data.pages || {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.permissionRoles.push(role);
    save();
    return { ...role, pages: normalizePages(role.pages) };
  },

  update(roleId, updates) {
    const db = load();
    const role = db.permissionRoles.find(item => item._id === roleId);
    if (!role) return null;
    if (updates.name !== undefined) {
      const nextName = normalizeName(updates.name);
      if (!nextName) throw new Error('Имя права не может быть пустым.');
      const collision = db.permissionRoles.find(item => item._id !== roleId && normalizeName(item.name) === nextName);
      if (collision) throw new Error('Право с таким именем уже существует.');
      role.name = nextName;
    }
    if (updates.pages !== undefined) {
      role.pages = normalizePages(updates.pages);
    }
    if (updates.isSystem !== undefined) {
      role.isSystem = Boolean(updates.isSystem);
    }
    role.updatedAt = new Date().toISOString();
    save();
    return { ...role, pages: normalizePages(role.pages) };
  },

  delete(roleId) {
    const db = load();
    const index = db.permissionRoles.findIndex(item => item._id === roleId);
    if (index === -1) return false;
    db.permissionRoles.splice(index, 1);
    save();
    return true;
  },
};

module.exports = PermissionRoleStore;
module.exports.PAGE_KEYS = PAGE_KEYS;
module.exports.normalizePages = normalizePages;
