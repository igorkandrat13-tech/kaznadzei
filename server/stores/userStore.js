const { load, save, id } = require('./store');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

const UserStore = {
  findAll() {
    return load().users.map(item => ({ ...item }));
  },

  findById(userId) {
    const raw = load().users.find(item => item._id === userId) || null;
    return raw ? { ...raw } : null;
  },

  findByUsername(username) {
    const target = normalizeUsername(username);
    if (!target) return null;
    const raw = load().users.find(item => normalizeUsername(item.username) === target) || null;
    return raw ? { ...raw } : null;
  },

  count() {
    return load().users.length;
  },

  countByRoleId(roleId) {
    const target = String(roleId || '');
    if (!target) return 0;
    return load().users.filter(item => String(item.roleId || '') === target).length;
  },

  create(data) {
    const db = load();
    const username = String(data.username || '').trim();
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) throw new Error('Имя пользователя не может быть пустым.');
    const existing = db.users.find(item => normalizeUsername(item.username) === normalizedUsername);
    if (existing) throw new Error('Пользователь с таким именем уже существует.');
    const user = {
      _id: id(),
      username,
      passwordHash: String(data.passwordHash || ''),
      employeeId: data.employeeId ? String(data.employeeId) : null,
      roleId: data.roleId ? String(data.roleId) : null,
      isSystem: Boolean(data.isSystem),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.users.push(user);
    save();
    return { ...user };
  },

  update(userId, updates) {
    const db = load();
    const user = db.users.find(item => item._id === userId);
    if (!user) return null;
    const next = { ...user, ...updates };
    if (updates.username !== undefined) {
      const normalizedNext = normalizeUsername(updates.username);
      if (!normalizedNext) throw new Error('Имя пользователя не может быть пустым.');
      const collision = db.users.find(item => item._id !== userId && normalizeUsername(item.username) === normalizedNext);
      if (collision) throw new Error('Пользователь с таким именем уже существует.');
      next.username = String(updates.username).trim();
    }
    Object.assign(user, next, {
      updatedAt: new Date().toISOString(),
    });
    save();
    return { ...user };
  },

  delete(userId) {
    const db = load();
    const index = db.users.findIndex(item => item._id === userId);
    if (index === -1) return false;
    db.users.splice(index, 1);
    save();
    return true;
  },

  clearRoleForUsersByRoleId(roleId) {
    const target = String(roleId || '');
    if (!target) return 0;
    const db = load();
    const now = new Date().toISOString();
    let cleared = 0;
    for (const user of db.users) {
      if (String(user.roleId || '') === target) {
        user.roleId = null;
        user.updatedAt = now;
        cleared += 1;
      }
    }
    if (cleared > 0) {
      save();
    }
    return cleared;
  },
};

module.exports = UserStore;
module.exports.normalizeUsername = normalizeUsername;
