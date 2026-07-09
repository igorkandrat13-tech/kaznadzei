const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const ProcessStepStore = require('./server/stores/processStepStore');
const OrderStore = require('./server/stores/orderStore');
const ColorStore = require('./server/stores/colorStore');
const EmployeeStore = require('./server/stores/employeeStore');
const SettingsStore = require('./server/stores/settingsStore');
const RoleStore = require('./server/stores/roleStore');
const { buildSecurityHeaders } = require('./server/middleware/security');
const { getDefaultRoleLabels, getDefaultRoles } = require('./server/config/roles');

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(buildSecurityHeaders);
app.use(express.json({ limit: '5mb' }));

const filesPath = path.join(__dirname, 'files');
if (fs.existsSync(filesPath)) {
  app.use('/files', express.static(filesPath));
}

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

function buildFallbackOrderNumber(order, index) {
  const numericPart = String(index + 1).padStart(4, '0');
  const datePart = String(order?.orderDate || order?.createdAt || '').slice(0, 10).replace(/-/g, '');
  return datePart ? `ORD-${datePart}-${numericPart}` : `ORD-${numericPart}`;
}

function buildDemoStages(progress = 0) {
  const steps = OrderStore.buildInitialStages({ activateFirstStage: true });
  return steps.map((stage, index) => {
    if (index < progress) {
      return {
        ...stage,
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
    }
    if (index === progress) {
      return {
        ...stage,
        status: 'in_progress',
        completedAt: null,
      };
    }
    return {
      ...stage,
      status: 'pending',
      completedAt: null,
    };
  });
}

function seedDemoMultiItemOrders() {
  const existingOrderNumbers = new Set(OrderStore.findAll().map(order => String(order.orderNumber || '').trim()));
  const demoOrders = [
    {
      orderNumber: 'DEMO-2026-KITCHEN',
      customer: 'Тестовый заказчик: Кухня',
      orderDate: '2026-06-22',
      startDate: '2026-06-24',
      endDate: '2026-07-20',
      items: [
        {
          itemNumber: '1',
          productNumber: 'K-001',
          room: 'Кухня',
          roomNumber: '01',
          name: 'Кухонный шкаф верхний',
          quantity: 3,
          material: 'МДФ крашеный',
          deliveryDate: '2026-07-18',
          packageName: 'Фурнитура Blum',
          materialRequests: 'https://example.com/demo-kitchen-top',
          notes: '',
          stages: buildDemoStages(2),
        },
        {
          itemNumber: '2',
          productNumber: 'K-002',
          room: 'Кухня',
          roomNumber: '01',
          name: 'Кухонный остров',
          quantity: 1,
          material: 'Шпон дуба',
          deliveryDate: '2026-07-18',
          packageName: 'Столешница + опоры',
          materialRequests: 'https://example.com/demo-kitchen-island',
          notes: '',
          stages: buildDemoStages(1),
        },
      ],
    },
    {
      orderNumber: 'DEMO-2026-HOUSE',
      customer: 'Тестовый заказчик: Дом',
      orderDate: '2026-06-23',
      startDate: '2026-06-26',
      endDate: '2026-07-28',
      items: [
        {
          itemNumber: '1',
          productNumber: 'H-014',
          room: 'Гостиная',
          roomNumber: '12',
          name: 'Тумба под ТВ',
          quantity: 1,
          material: 'ЛДСП Egger',
          deliveryDate: '2026-07-25',
          packageName: 'Корпус + фасады',
          materialRequests: 'https://example.com/demo-tv-stand',
          notes: '',
          stages: buildDemoStages(3),
        },
        {
          itemNumber: '2',
          productNumber: 'H-015',
          room: 'Спальня',
          roomNumber: '15',
          name: 'Шкаф-купе',
          quantity: 1,
          material: 'ЛДСП + зеркало',
          deliveryDate: '2026-07-26',
          packageName: 'Раздвижная система',
          materialRequests: 'https://example.com/demo-wardrobe',
          notes: '',
          stages: buildDemoStages(0),
        },
      ],
    },
  ];

  let seededCount = 0;
  for (const demoOrder of demoOrders) {
    if (existingOrderNumbers.has(demoOrder.orderNumber)) continue;
    OrderStore.create(demoOrder);
    seededCount += 1;
  }

  if (seededCount > 0) {
    console.log(`${seededCount} demo multi-item orders seeded`);
  }
}

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
  for (const [index, p] of products.entries()) {
    const completedCount = Math.min(p.stageProgress, steps.length);
    const base = new Date();
    base.setDate(base.getDate() - Math.floor(Math.random() * 80) - 10);
    const orderDate = new Date(base);
    const startDate = new Date(base);
    startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 10) + 3);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 30) + 10);
    OrderStore.create({
      orderNumber: `ORD-${String(index + 1).padStart(4, '0')}`,
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
seedDemoMultiItemOrders();

// Migrate existing orders — add new fields if missing
(function migrate() {
  const orders = OrderStore.findAll();
  const employees = EmployeeStore.findAll();
  const settings = SettingsStore.get();
  let changed = OrderStore.ensureOrders(require('./server/stores/store').load());
  for (const [index, o] of orders.entries()) {
    if (!o.orderNumber) { o.orderNumber = buildFallbackOrderNumber(o, index); changed = true; }
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
    roleLabels: settings.roleLabels || getDefaultRoleLabels(),
    roles: settings.roles || getDefaultRoles(),
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
const orderStageLegendRoutes = require('./server/routes/orderStageLegendRoutes');
const updateRoutes = require('./server/routes/updateRoutes');
const settingsRoutes = require('./server/routes/settingsRoutes');
const employeeRoutes = require('./server/routes/employeeRoutes');
const customerRoutes = require('./server/routes/customerRoutes');
const telegramRoutes = require('./server/routes/telegramRoutes');
const authRoutes = require('./server/routes/authRoutes');
const adminToolsRoutes = require('./server/routes/adminToolsRoutes');
const roleRoutes = require('./server/routes/roleRoutes');
app.use('/api', authRoutes);
app.use('/api', roleRoutes);
app.use('/api', processStepRoutes);
app.use('/api', orderRoutes);
app.use('/api', colorRoutes);
app.use('/api', orderStageLegendRoutes);
app.use('/api', updateRoutes);
app.use('/api', settingsRoutes);
app.use('/api', employeeRoutes);
app.use('/api', customerRoutes);
app.use('/api', telegramRoutes);
app.use('/api', adminToolsRoutes);

function resolveClientBuildPath() {
  const candidates = [
    path.join(__dirname, 'client', 'build'),
    path.join(process.cwd(), 'client', 'build'),
    path.join(__dirname, 'build'),
    path.join(process.cwd(), 'build'),
  ];

  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'index.html'))) || candidates[0];
}

const buildPath = resolveClientBuildPath();
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({
      message: 'API server running. Frontend build not found.',
      expectedBuildPath: buildPath,
      hints: [
        'Run: cd client && npm run build',
        'Make sure the deployed server contains client/build/index.html',
        'Restart the service after updating the frontend build',
      ],
    });
  }
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    const fallbackPort = Number(PORT) + 1;
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Stop the existing process or run the server on another port, for example: $env:PORT=${fallbackPort}; npm start`);
    process.exit(1);
  }

  throw error;
});

