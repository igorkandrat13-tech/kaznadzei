const { load, save, id } = require('./store');

const EmployeeStore = {
  findAll() {
    return load().employees.slice();
  },

  findById(employeeId) {
    return load().employees.find(item => item._id === employeeId) || null;
  },

  findByPinCode(pinCode) {
    return load().employees.find(item => String(item.pinCode || '').trim() === String(pinCode || '').trim()) || null;
  },

  findByTelegramUserId(telegramUserId) {
    return load().employees.find(item => String(item.telegramUserId || '') === String(telegramUserId || '')) || null;
  },

  create(data) {
    const db = load();
    const employee = {
      _id: id(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.employees.push(employee);
    save();
    return employee;
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
    return employee;
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
    return employee;
  },

  update(employeeId, updates) {
    const db = load();
    const employee = db.employees.find(item => item._id === employeeId);
    if (!employee) return null;
    Object.assign(employee, updates, { updatedAt: new Date().toISOString() });
    save();
    return employee;
  },

  delete(employeeId) {
    const db = load();
    const index = db.employees.findIndex(item => item._id === employeeId);
    if (index === -1) return false;
    db.employees.splice(index, 1);
    save();
    return true;
  },
};

module.exports = EmployeeStore;
