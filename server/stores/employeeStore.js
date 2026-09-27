const { load, save, id } = require('./store');

const VALID_BOT_KINDS = ['primary', 'supply'];

function normalizeEmployeeBotKinds(employee) {
  if (!employee || typeof employee !== 'object') return ['primary'];
  if (Array.isArray(employee.telegramBotKinds)) {
    const cleaned = employee.telegramBotKinds
      .map((k) => String(k || '').trim())
      .filter((k) => VALID_BOT_KINDS.includes(k));
    return cleaned.length ? Array.from(new Set(cleaned)) : ['primary'];
  }
  const singleKind = String(employee.telegramBotKind || 'primary').trim();
  return singleKind === 'supply' ? ['supply'] : ['primary'];
}

function employeeHasBotKind(employee, botKind) {
  const target = botKind === 'supply' ? 'supply' : 'primary';
  return normalizeEmployeeBotKinds(employee).includes(target);
}

const EmployeeStore = {
  findAll() {
    return load().employees.map((item) => ({ ...item, telegramBotKinds: normalizeEmployeeBotKinds(item) }));
  },

  findById(employeeId) {
    const raw = load().employees.find(item => item._id === employeeId) || null;
    if (!raw) return null;
    return { ...raw, telegramBotKinds: normalizeEmployeeBotKinds(raw) };
  },

  findByPinCode(pinCode, options = {}) {
    const botKind = options?.botKind === 'supply' ? 'supply' : 'primary';
    const raw = load().employees.find(item => {
      return String(item.pinCode || '').trim() === String(pinCode || '').trim() && employeeHasBotKind(item, botKind);
    }) || null;
    if (!raw) return null;
    return { ...raw, telegramBotKinds: normalizeEmployeeBotKinds(raw) };
  },

  findByTelegramUserId(telegramUserId, options = {}) {
    const botKind = options?.botKind === 'supply' ? 'supply' : 'primary';
    const raw = load().employees.find(item => {
      return String(item.telegramUserId || '') === String(telegramUserId || '') && employeeHasBotKind(item, botKind);
    }) || null;
    if (!raw) return null;
    return { ...raw, telegramBotKinds: normalizeEmployeeBotKinds(raw) };
  },

  create(data) {
    const db = load();
    const kinds = normalizeEmployeeBotKinds(data);
    const employee = {
      _id: id(),
      ...data,
      telegramBotKinds: kinds,
      telegramBotKind: kinds.includes('supply') ? 'supply' : 'primary',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.employees.push(employee);
    save();
    return { ...employee, telegramBotKinds: normalizeEmployeeBotKinds(employee) };
  },

  linkTelegramUser(employeeId, telegramData) {
    const db = load();
    const employee = db.employees.find(item => item._id === employeeId);
    if (!employee) return null;
    Object.assign(employee, {
      telegramUserId: String(telegramData.userId),
      telegramChatId: String(telegramData.chatId),
      telegramUsername: telegramData.username || employee.telegramUsername || '',
      telegramFirstName: telegramData.firstName || '',
      telegramLastName: telegramData.lastName || '',
      telegramAuthorizedAt: new Date().toISOString(),
      telegramLastSeenAt: new Date().toISOString(),
      pinCode: '',
      updatedAt: new Date().toISOString(),
    });
    save();
    return { ...employee, telegramBotKinds: normalizeEmployeeBotKinds(employee) };
  },

  touchTelegramUser(employeeId, updates = {}) {
    const db = load();
    const employee = db.employees.find(item => item._id === employeeId);
    if (!employee) return null;
    Object.assign(employee, updates, {
      telegramLastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    save();
    return { ...employee, telegramBotKinds: normalizeEmployeeBotKinds(employee) };
  },

  update(employeeId, updates) {
    const db = load();
    const employee = db.employees.find(item => item._id === employeeId);
    if (!employee) return null;
    const merged = { ...employee, ...updates };
    const kinds = normalizeEmployeeBotKinds(merged);
    Object.assign(employee, updates, {
      telegramBotKinds: kinds,
      telegramBotKind: kinds.includes('supply') ? 'supply' : 'primary',
      updatedAt: new Date().toISOString(),
    });
    save();
    return { ...employee, telegramBotKinds: normalizeEmployeeBotKinds(employee) };
  },

  delete(employeeId) {
    const db = load();
    const index = db.employees.findIndex(item => item._id === employeeId);
    if (index === -1) return false;
    const removed = db.employees[index] || {};
    if (typeof removed === 'object' && removed !== null) {
      const blankFields = [
        'telegramUserId', 'telegramChatId', 'telegramUsername',
        'telegramFirstName', 'telegramLastName',
        'telegramAuthorizedAt', 'telegramLastSeenAt',
        'pinCode',
      ];
      blankFields.forEach((f) => { removed[f] = ''; });
      removed.updatedAt = new Date().toISOString();
    }
    db.employees.splice(index, 1);
    save();
    return true;
  },
};

module.exports = EmployeeStore;
module.exports.normalizeEmployeeBotKinds = normalizeEmployeeBotKinds;
module.exports.employeeHasBotKind = employeeHasBotKind;
