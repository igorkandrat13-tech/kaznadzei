const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const ProcessStepStore = require('./server/stores/processStepStore');
const OrderStore = require('./server/stores/orderStore');
const ColorStore = require('./server/stores/colorStore');
const EmployeeStore = require('./server/stores/employeeStore');
const SettingsStore = require('./server/stores/settingsStore');
const { buildSecurityHeaders } = require('./server/middleware/security');

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(buildSecurityHeaders);
app.use(express.json({ limit: '100kb' }));

const roles = {
  carpenter: { label: 'Столяр', icon: '🪚' },
  designer: { label: 'Дизайнер', icon: '📐' },
  assembler: { label: 'Комплектовщик', icon: '🔧' },
  painter: { label: 'Маляр', icon: '🎨' },
};

const seedSteps = [
  { stepName: 'Подготовка древесины', description: 'Выбор и подготовка пиломатериала', order: 1, role: 'carpenter' },
  { stepName: 'Раскрой', description: 'Распил на заготовки по чертежам', order: 2, role: 'carpenter' },
  { stepName: 'Фрезеровка', description: 'Обработка кромок и пазов', order: 3, role: 'carpenter' },
  { stepName: 'Шлифовка', description: 'Шлифовка поверхностей', order: 4, role: 'carpenter' },
  { stepName: 'Сборка', description: 'Сборка каркаса и ящиков', order: 1, role: 'assembler' },
  { stepName: 'Комплектация', description: 'Установка фурнитуры и ручек', order: 2, role: 'assembler' },
  { stepName: 'Упаковка', description: 'Упаковка готового изделия', order: 3, role: 'assembler' },
  { stepName: 'Покраска', description: 'Нанесение лака/краски', order: 1, role: 'painter' },
  { stepName: 'Разработка эскиза', description: 'Создание эскиза и визуализации', order: 1, role: 'designer' },
  { stepName: 'Подготовка чертежа', description: 'Детализация и спецификация', order: 2, role: 'designer' },
];

const seedColors = [
  { name: 'Орех', hex: '#8B6914' },
  { name: 'Венге', hex: '#3B2F2F' },
  { name: 'Белый', hex: '#F5F5F5' },
  { name: 'Дуб', hex: '#C4A882' },
  { name: 'Чёрный', hex: '#2C2C2C' },
  { name: 'Вишня', hex: '#8B3A3A' },
];

const products = [
  { name: 'Комод "Классика"', customer: 'Иванов А.С.', quantity: 2, material: 'Массив дуба', stageProgress: 4 },
  { name: 'Шкаф "Модерн"', customer: 'Петрова Е.В.', quantity: 1, material: 'ЛДСП', stageProgress: 6 },
  { name: 'Стол "Лофт"', customer: 'ООО "МебельПро"', quantity: 5, material: 'Металл + стекло', stageProgress: 9 },
  { name: 'Стул "Венский"', customer: 'Кафе "Уют"', quantity: 12, material: 'Бук', stageProgress: 2 },
  { name: 'Кровать "Барокко"', customer: 'Сидоров К.М.', quantity: 1, material: 'Массив сосны', stageProgress: 3 },
  { name: 'Тумба "Минимал"', customer: 'ИП "Интерьер"', quantity: 3, material: 'ЛДСП + МДФ', stageProgress: 7 },
  { name: 'Диван "Комфорт"', customer: 'Козлова А.И.', quantity: 1, material: 'ДСП + фанера', stageProgress: 5 },
  { name: 'Стол "Сканди"', customer: 'Ресторан "Норд"', quantity: 8, material: 'Массив берёзы', stageProgress: 1 },
  { name: 'Полка "Эко"', customer: 'Магазин "Декор"', quantity: 20, material: 'Фанера', stageProgress: 8 },
  { name: 'Кресло "Классик"', customer: 'Тихонов Д.П.', quantity: 2, material: 'Массив дуба', stageProgress: 4 },
];

function seed() {
  if (ProcessStepStore.count() === 0) {
    ProcessStepStore.insertMany(seedSteps);
    console.log('Process steps seeded');
  }
  if (ColorStore.count() === 0) {
    ColorStore.insertMany(seedColors);
    console.log('Colors seeded');
  }
  if (OrderStore.count() > 0) return;
  const steps = ProcessStepStore.findAll().sort((a, b) => a.order - b.order);
  for (const p of products) {
    const completedCount = Math.min(p.stageProgress, steps.length);
    const base = new Date();
    base.setDate(base.getDate() - Math.floor(Math.random() * 80) - 10);
    const orderDate = new Date(base);
    const startDate = new Date(base);
    startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 10) + 3);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 30) + 10);
    OrderStore.create({
      name: p.name,
      customer: p.customer || '',
      quantity: p.quantity || 1,
      material: p.material || '',
      notes: '',
      orderDate: orderDate.toISOString().split('T')[0],
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      comments: [],
      stages: steps.map((s, i) => ({
        stepId: s._id,
        stepName: s.stepName,
        role: s.role,
        status: i < completedCount ? 'completed' : i === completedCount ? 'in_progress' : 'pending',
        completedAt: i < completedCount ? new Date().toISOString() : null,
      })),
      overallStatus: completedCount >= steps.length ? 'completed' : 'in_progress',
    });
  }
  console.log(`${products.length} test orders seeded`);
}

seed();

// Migrate existing orders — add new fields if missing
(function migrate() {
  const orders = OrderStore.findAll();
  const employees = EmployeeStore.findAll();
  const steps = ProcessStepStore.findAll();
  const settings = SettingsStore.get();
  let changed = false;
  for (const o of orders) {
    if (!o.customer) { o.customer = ''; changed = true; }
    if (!o.quantity) { o.quantity = 1; changed = true; }
    if (!o.material) { o.material = ''; changed = true; }
    if (!o.notes) { o.notes = ''; changed = true; }
    if (!o.orderDate) { o.orderDate = o.createdAt ? o.createdAt.split('T')[0] : ''; changed = true; }
    if (!o.startDate) { o.startDate = ''; changed = true; }
    if (!o.endDate) { o.endDate = ''; changed = true; }
    if (!Array.isArray(o.comments)) { o.comments = []; changed = true; }
    if (!Array.isArray(o.stages) || o.stages.length === 0) {
      o.stages = OrderStore.buildInitialStages();
      changed = true;
    }
    if (Array.isArray(o.stages)) {
      for (const stage of o.stages) {
        if (stage.stepId) continue;
        const matchedStep = steps.find(step => step.stepName === stage.stepName && step.role === stage.role)
          || steps.find(step => step.stepName === stage.stepName);
        if (matchedStep) {
          stage.stepId = matchedStep._id;
          changed = true;
        }
      }
    }
    const overallStatus = OrderStore.calculateOverallStatus(o.stages);
    if (o.overallStatus !== overallStatus) {
      o.overallStatus = overallStatus;
      changed = true;
    }
  }

  for (const employee of employees) {
    if (!employee.telegramUserId) { employee.telegramUserId = ''; changed = true; }
    if (!employee.telegramChatId) { employee.telegramChatId = ''; changed = true; }
    if (!employee.telegramFirstName) { employee.telegramFirstName = ''; changed = true; }
    if (!employee.telegramLastName) { employee.telegramLastName = ''; changed = true; }
    if (!employee.telegramAuthorizedAt) { employee.telegramAuthorizedAt = ''; changed = true; }
    if (!employee.telegramLastSeenAt) { employee.telegramLastSeenAt = ''; changed = true; }
  }

  const nextSettings = {
    publicBaseUrl: settings.publicBaseUrl,
    telegramBotToken: settings.telegramBotToken || '',
    selfUpdateEnabled: Boolean(settings.selfUpdateEnabled),
    updateBranch: settings.updateBranch || 'main',
    updateRepositoryUrl: settings.updateRepositoryUrl || process.env.UPDATE_REPOSITORY_URL || process.env.GIT_REMOTE_URL || '',
  };
  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(nextSettings);

  if (changed) {
    const { save } = require('./server/stores/store');
    save();
    console.log('Existing orders migrated with new fields');
  }

  if (settingsChanged) {
    SettingsStore.update(nextSettings);
    console.log('Application settings migrated with new fields');
  }

  if (OrderStore.syncStagesWithProcessSteps()) {
    console.log('Order stages synchronized with process steps');
  }
})();

const processStepRoutes = require('./server/routes/processStepRoutes');
const orderRoutes = require('./server/routes/orderRoutes');
const colorRoutes = require('./server/routes/colorRoutes');
const updateRoutes = require('./server/routes/updateRoutes');
const settingsRoutes = require('./server/routes/settingsRoutes');
const employeeRoutes = require('./server/routes/employeeRoutes');
const telegramRoutes = require('./server/routes/telegramRoutes');
const authRoutes = require('./server/routes/authRoutes');
app.use('/api', authRoutes);
app.use('/api', processStepRoutes);
app.use('/api', orderRoutes);
app.use('/api', colorRoutes);
app.use('/api', updateRoutes);
app.use('/api', settingsRoutes);
app.use('/api', employeeRoutes);
app.use('/api', telegramRoutes);

app.get('/api/roles', (req, res) => {
  res.json(roles);
});

const buildPath = path.join(__dirname, 'client', 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({ message: 'API server running. Frontend: cd client && npm start' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
