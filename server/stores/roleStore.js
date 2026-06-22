const { load, save } = require('./store');
const { createRoleKey, getDefaultRoles, normalizeRole, normalizeRoles } = require('../config/roles');

function ensureRoles(db) {
  db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {};
  db.settings.roles = normalizeRoles(db.settings.roles);
  return db.settings.roles;
}

const RoleStore = {
  findAll(options = {}) {
    const includeDeleted = options.includeDeleted === true;
    const roles = ensureRoles(load());
    return includeDeleted ? roles.slice() : roles.filter(role => !role.isDeleted);
  },

  findByKey(roleKey, options = {}) {
    const includeDeleted = options.includeDeleted === true;
    const normalizedKey = String(roleKey || '').trim();
    if (!normalizedKey) return null;
    return this.findAll({ includeDeleted }).find(role => role.key === normalizedKey) || null;
  },

  create(data) {
    const db = load();
    const roles = ensureRoles(db);
    const now = new Date().toISOString();
    const key = createRoleKey(data.label, roles.map(role => role.key));
    const role = normalizeRole({
      ...data,
      key,
      order: roles.length + 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    }, { defaultOrder: roles.length + 1 });
    roles.push(role);
    db.settings.roles = normalizeRoles(roles);
    save();
    return role;
  },

  update(roleKey, updates) {
    const db = load();
    const roles = ensureRoles(db);
    const role = roles.find(item => item.key === String(roleKey || '').trim());
    if (!role) return null;
    const nextRole = normalizeRole({
      ...role,
      ...updates,
      key: role.key,
      updatedAt: new Date().toISOString(),
    }, { defaultOrder: role.order });
    Object.assign(role, nextRole);
    db.settings.roles = normalizeRoles(roles);
    save();
    return role;
  },

  softDelete(roleKey) {
    return this.update(roleKey, { isDeleted: true });
  },

  restore(roleKey) {
    return this.update(roleKey, { isDeleted: false });
  },
};

module.exports = RoleStore;
