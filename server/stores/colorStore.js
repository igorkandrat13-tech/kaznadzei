const { load, save, id } = require('./store');

const ColorStore = {
  findAll() {
    return load().colors;
  },

  create(data) {
    const db = load();
    const color = { _id: id(), ...data };
    db.colors.push(color);
    save();
    return color;
  },

  update(colorId, data) {
    const db = load();
    const idx = db.colors.findIndex(c => c._id === colorId);
    if (idx === -1) return null;
    db.colors[idx] = { ...db.colors[idx], ...data };
    save();
    return db.colors[idx];
  },

  deleteOne(colorId) {
    const db = load();
    db.colors = db.colors.filter(c => c._id !== colorId);
    save();
  },

  insertMany(arr) {
    const db = load();
    const colors = arr.map(d => ({ _id: id(), ...d }));
    db.colors.push(...colors);
    save();
    return colors;
  },

  deleteMany() {
    const db = load();
    db.colors = [];
    save();
  },

  count() {
    return load().colors.length;
  }
};

module.exports = ColorStore;
