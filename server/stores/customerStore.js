const { load, save, id } = require('./store');

function sortCustomers(customers = []) {
  return customers.slice().sort((left, right) => (
    String(left.fullName || '').localeCompare(String(right.fullName || ''), 'ru')
  ));
}

const CustomerStore = {
  findAll() {
    return sortCustomers(load().customers || []);
  },

  findById(customerId) {
    return load().customers.find((item) => item._id === customerId) || null;
  },

  create(data) {
    const db = load();
    const customer = {
      _id: id(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.customers.push(customer);
    save();
    return customer;
  },

  update(customerId, updates = {}) {
    const db = load();
    const customer = db.customers.find((item) => item._id === customerId);
    if (!customer) return null;

    Object.assign(customer, updates, { updatedAt: new Date().toISOString() });
    const displayName = String(customer.fullName || '').trim();
    db.orders.forEach((order) => {
      if (String(order?.customerId || '').trim() !== customerId) return;
      order.customer = displayName;
    });
    save();
    return customer;
  },

  delete(customerId) {
    const db = load();
    const index = db.customers.findIndex((item) => item._id === customerId);
    if (index === -1) return false;

    db.orders.forEach((order) => {
      if (String(order?.customerId || '').trim() !== customerId) return;
      order.customerId = '';
    });
    db.customers.splice(index, 1);
    save();
    return true;
  },
};

module.exports = CustomerStore;
