const { load, save, id } = require('./store');

function sortCustomers(customers = []) {
  return customers.slice().sort((left, right) => (
    String(left.fullName || '').localeCompare(String(right.fullName || ''), 'ru')
  ));
}

function normalizeComparableCustomerName(value = '') {
  return String(value || '').trim().toLowerCase();
}

function hasUniqueComparableCustomerName(customers = [], customer = {}) {
  const targetName = normalizeComparableCustomerName(customer.fullName);
  if (!targetName) return false;
  return customers.filter((item) => normalizeComparableCustomerName(item?.fullName) === targetName).length === 1;
}

function isOrderLinkedToCustomer(order = {}, customer = {}, customers = []) {
  const normalizedCustomerId = String(customer?._id || '').trim();
  if (!normalizedCustomerId) return false;
  if (String(order?.customerId || '').trim() === normalizedCustomerId) {
    return true;
  }

  if (String(order?.customerId || '').trim()) {
    return false;
  }

  if (!hasUniqueComparableCustomerName(customers, customer)) {
    return false;
  }

  return normalizeComparableCustomerName(order?.customer) === normalizeComparableCustomerName(customer?.fullName);
}

const CustomerStore = {
  findAll() {
    return sortCustomers(load().customers || []);
  },

  findById(customerId) {
    return load().customers.find((item) => item._id === customerId) || null;
  },

  findLinkedOrders(customerId) {
    const db = load();
    const customer = db.customers.find((item) => item._id === customerId);
    if (!customer) return [];
    return (db.orders || []).filter((order) => isOrderLinkedToCustomer(order, customer, db.customers));
  },

  isOrderLinked(customerId, order) {
    const db = load();
    const customer = db.customers.find((item) => item._id === customerId);
    if (!customer) return false;
    return isOrderLinkedToCustomer(order, customer, db.customers);
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
      if (!isOrderLinkedToCustomer(order, customer, db.customers)) return;
      order.customerId = customerId;
      order.customer = displayName;
    });
    save();
    return customer;
  },

  delete(customerId) {
    const db = load();
    const index = db.customers.findIndex((item) => item._id === customerId);
    if (index === -1) return false;
    const customer = db.customers[index];

    db.orders.forEach((order) => {
      if (!isOrderLinkedToCustomer(order, customer, db.customers)) return;
      order.customerId = '';
    });
    db.customers.splice(index, 1);
    save();
    return true;
  },
};

module.exports = CustomerStore;
