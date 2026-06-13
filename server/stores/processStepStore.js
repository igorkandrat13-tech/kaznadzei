const { load, save, id } = require('./store');

const ProcessStepStore = {
  findAll() {
    return load().processSteps;
  },

  findByRole(role) {
    return load().processSteps.filter(s => s.role === role).sort((a, b) => a.order - b.order);
  },

  findById(stepId) {
    return load().processSteps.find(s => s._id === stepId);
  },

  create(data) {
    const db = load();
    const step = { _id: id(), ...data, createdAt: new Date().toISOString() };
    db.processSteps.push(step);
    save();
    return step;
  },

  update(stepId, data) {
    const db = load();
    const idx = db.processSteps.findIndex(s => s._id === stepId);
    if (idx === -1) return null;
    db.processSteps[idx] = { ...db.processSteps[idx], ...data };
    save();
    return db.processSteps[idx];
  },

  deleteOne(stepId) {
    const db = load();
    const initialLength = db.processSteps.length;
    db.processSteps = db.processSteps.filter(s => s._id !== stepId);
    if (db.processSteps.length === initialLength) {
      return false;
    }
    save();
    return true;
  },

  insertMany(arr) {
    const db = load();
    const steps = arr.map(d => ({ _id: id(), ...d, createdAt: new Date().toISOString() }));
    db.processSteps.push(...steps);
    save();
    return steps;
  },

  deleteMany() {
    const db = load();
    db.processSteps = [];
    save();
  },

  count() {
    return load().processSteps.length;
  }
};

module.exports = ProcessStepStore;
