const path = require('path');
const PptxGenJS = require('pptxgenjs');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'TRAE';
pptx.company = 'Kaznadzei';
pptx.subject = 'Telegram supergroup architecture';
pptx.title = 'Telegram Supergroup for Kaznadzei';
pptx.lang = 'ru-RU';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'ru-RU',
};

const colors = {
  navy: '16324F',
  blue: '2F6CAD',
  sky: 'DDEEFE',
  light: 'F7FAFD',
  line: 'A9C7E6',
  gold: 'D9A441',
  sand: 'FFF5DE',
  green: '2F8F62',
  mint: 'E8F6EF',
  coral: 'C56C4B',
  rose: 'FFF0E8',
  text: '243746',
  muted: '5E7387',
  white: 'FFFFFF',
  dark: '102033',
};

const logoPath = path.resolve(__dirname, '..', 'files', 'Logo-1024x307.png');
const outputPath = path.resolve(__dirname, 'telegram-supergroup-architecture.pptx');

function addTitle(slide, title, subtitle = '') {
  slide.addText(title, {
    x: 0.6,
    y: 0.4,
    w: 8.8,
    h: 0.45,
    fontFace: 'Aptos Display',
    fontSize: 24,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 0.86,
      w: 10.8,
      h: 0.28,
      fontSize: 10.5,
      color: colors.muted,
      margin: 0,
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: 0.6,
    y: 1.2,
    w: 12.0,
    h: 0,
    line: { color: colors.line, pt: 1.2 },
  });
}

function addFooter(slide, text = 'Проектная схема без кода') {
  slide.addText(text, {
    x: 0.6,
    y: 6.95,
    w: 4.0,
    h: 0.2,
    fontSize: 8.5,
    color: colors.muted,
    align: 'left',
    margin: 0,
  });
}

function addRoundedPanel(slide, opts) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    rectRadius: 0.08,
    fill: { color: opts.fill || colors.white },
    line: { color: opts.line || colors.line, pt: opts.linePt || 1.1 },
    shadow: { type: 'outer', color: 'BCCFE3', blur: 1, angle: 45, distance: 1, opacity: 0.12 },
  });
}

function addBulletList(slide, items, opts) {
  const runs = [];
  items.forEach((item) => {
    runs.push({
      text: item,
      options: {
        bullet: { indent: 12 },
        hanging: 3,
        breakLine: true,
      },
    });
  });
  slide.addText(runs, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    fontSize: opts.fontSize || 11,
    color: opts.color || colors.text,
    valign: 'top',
    margin: opts.margin || 0.08,
    paraSpaceAfterPt: 7,
  });
}

function addArrow(slide, x1, y1, x2, y2, color = colors.blue, text = '') {
  slide.addShape(pptx.ShapeType.chevron, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    fill: { color, transparency: 8 },
    line: { color, pt: 0.8 },
  });
  if (text) {
    slide.addText(text, {
      x: x1 + 0.08,
      y: y1 + 0.04,
      w: Math.max(0.2, x2 - x1 - 0.16),
      h: Math.max(0.18, y2 - y1 - 0.08),
      fontSize: 8.5,
      bold: true,
      color: colors.white,
      align: 'center',
      valign: 'mid',
      margin: 0,
    });
  }
}

function addTag(slide, text, x, y, w, fill, color = colors.text) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.28,
    rectRadius: 0.08,
    fill: { color: fill },
    line: { color: fill, pt: 0.6 },
  });
  slide.addText(text, {
    x: x + 0.04,
    y: y + 0.03,
    w: w - 0.08,
    h: 0.18,
    fontSize: 8.5,
    bold: true,
    color,
    align: 'center',
    margin: 0,
  });
}

function makeTitleSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: colors.light };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 1.55,
    fill: { color: colors.navy },
    line: { color: colors.navy, pt: 0 },
  });
  slide.addImage({
    path: logoPath,
    x: 0.6,
    y: 0.32,
    w: 2.9,
    h: 0.87,
  });
  slide.addText('Схема работы Telegram Supergroup', {
    x: 0.8,
    y: 1.95,
    w: 7.8,
    h: 0.6,
    fontFace: 'Aptos Display',
    fontSize: 25,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  slide.addText('Для проекта Kaznadzei: заказчик общается с ботом, сотрудники работают в одной supergroup с темами по заказам, бот выступает мостом между двумя контурами.', {
    x: 0.8,
    y: 2.65,
    w: 7.0,
    h: 1.05,
    fontSize: 12.5,
    color: colors.text,
    margin: 0,
    breakLine: false,
    valign: 'top',
  });

  addRoundedPanel(slide, { x: 8.35, y: 1.95, w: 4.1, h: 3.2, fill: colors.white });
  addTag(slide, 'Ключевая идея', 8.65, 2.2, 1.52, colors.sand, colors.coral);
  addBulletList(slide, [
    'Один Telegram-бот для заказчиков и сотрудников',
    'Одна внутренняя supergroup "Фабрика Казнадзей"',
    'Одна тема внутри группы = один заказ',
    'Бот пересылает клиентские сообщения в нужную тему',
    'Ответ сотрудника из темы уходит заказчику в личный чат с ботом',
  ], { x: 8.55, y: 2.65, w: 3.5, h: 2.15, fontSize: 10.5 });

  addRoundedPanel(slide, { x: 0.8, y: 4.25, w: 11.65, h: 1.65, fill: colors.sky, line: colors.sky });
  slide.addText('Почему эта схема подходит', {
    x: 1.05,
    y: 4.5,
    w: 2.2,
    h: 0.25,
    fontSize: 12.5,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  slide.addText([
    { text: 'Заказчик не видит чужие заказы. ' },
    { text: 'Сотрудники получают единое рабочее пространство. ', options: { bold: true } },
    { text: 'История сообщений, файлов и статусов собирается по каждому заказу внутри своей темы.' },
  ], {
    x: 1.05,
    y: 4.88,
    w: 10.8,
    h: 0.6,
    fontSize: 11.5,
    color: colors.text,
    margin: 0,
  });

  addFooter(slide);
}

function makeArchitectureSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: colors.light };
  addTitle(slide, '1. Общая архитектура', 'Как связаны заказчик, бот и внутренняя supergroup сотрудников');

  addRoundedPanel(slide, { x: 0.75, y: 1.7, w: 2.85, h: 4.55, fill: colors.white });
  addTag(slide, 'Внешний контур', 1.0, 1.95, 1.65, colors.mint, colors.green);
  slide.addText('Заказчик', {
    x: 1.0,
    y: 2.35,
    w: 1.6,
    h: 0.25,
    fontSize: 17,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  addBulletList(slide, [
    'Сидит только в личке с ботом',
    'Получает уведомления по статусам и этапам',
    'Открывает заказ, изделия и файлы',
    'Пишет вопросы, комментарии и при необходимости отправляет вложения',
  ], { x: 0.98, y: 2.8, w: 2.3, h: 2.05, fontSize: 10.4 });
  addRoundedPanel(slide, { x: 1.0, y: 5.1, w: 2.35, h: 0.85, fill: colors.sand, line: colors.sand });
  slide.addText('Личка с ботом\n= только его заказы', {
    x: 1.15,
    y: 5.28,
    w: 2.0,
    h: 0.42,
    fontSize: 11,
    bold: true,
    color: colors.coral,
    align: 'center',
    margin: 0,
  });

  addRoundedPanel(slide, { x: 4.2, y: 1.55, w: 4.1, h: 4.85, fill: colors.white, line: colors.gold, linePt: 1.4 });
  addTag(slide, 'Центральный мост', 4.5, 1.82, 1.62, colors.sand, colors.coral);
  slide.addText('Telegram-бот + backend', {
    x: 4.52,
    y: 2.2,
    w: 2.8,
    h: 0.3,
    fontSize: 18,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  addBulletList(slide, [
    'Знает, к какому заказу относится клиент',
    'Хранит связь: orderId -> internalTopicId',
    'Пересылает клиентские сообщения в тему заказа',
    'Отправляет ответы сотрудников обратно заказчику',
    'Публикует изменения статусов, файлов и сроков',
  ], { x: 4.5, y: 2.65, w: 3.35, h: 2.15, fontSize: 10.4 });
  addRoundedPanel(slide, { x: 4.55, y: 5.12, w: 3.3, h: 0.92, fill: colors.sky, line: colors.sky });
  slide.addText('Ключевая привязка\norderId + topicId + customerChatId', {
    x: 4.72,
    y: 5.3,
    w: 2.95,
    h: 0.46,
    fontSize: 11,
    bold: true,
    color: colors.blue,
    align: 'center',
    margin: 0,
  });

  addRoundedPanel(slide, { x: 8.9, y: 1.7, w: 3.7, h: 4.55, fill: colors.white });
  addTag(slide, 'Внутренний контур', 9.16, 1.95, 1.82, colors.sky, colors.blue);
  slide.addText('Supergroup\n"Фабрика Казнадзей"', {
    x: 9.2,
    y: 2.28,
    w: 2.8,
    h: 0.55,
    fontSize: 17,
    bold: true,
    color: colors.navy,
    align: 'left',
    margin: 0,
  });
  addBulletList(slide, [
    'Видна только сотрудникам',
    'Каждая тема = отдельный заказ',
    'Внутри темы живут статусы, сообщения клиента, внутренние обсуждения и файлы',
  ], { x: 9.15, y: 3.05, w: 2.95, h: 1.5, fontSize: 10.4 });
  addRoundedPanel(slide, { x: 9.18, y: 4.82, w: 3.06, h: 1.08, fill: colors.light, line: colors.line });
  slide.addText('Темы:\n• Заказ 124\n• Заказ 17\n• Заказ 205', {
    x: 9.4,
    y: 5.03,
    w: 2.55,
    h: 0.6,
    fontSize: 11,
    color: colors.text,
    margin: 0,
  });

  addArrow(slide, 3.45, 3.45, 4.1, 3.75, colors.blue, 'вопрос / файл');
  addArrow(slide, 8.3, 2.78, 8.95, 3.08, colors.green, 'в тему заказа');
  addArrow(slide, 8.3, 4.12, 8.95, 4.42, colors.gold, 'системные события');
  addArrow(slide, 4.1, 4.75, 3.45, 5.05, colors.coral, 'ответ клиенту');

  addFooter(slide);
}

function makeFlowSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: colors.light };
  addTitle(slide, '2. Как ходят сообщения', 'Три основных сценария: уведомления, вопрос клиента, ответ сотрудника');

  const rows = [
    {
      y: 1.65,
      title: 'A. Автоуведомление по заказу',
      fill: colors.mint,
      line: colors.green,
      steps: [
        ['Система', 'В таблице меняется этап или статус изделия'],
        ['Бот', 'Понимает, к какому заказу относится событие'],
        ['Личка клиента', 'Отправляет уведомление заказчику'],
        ['Тема заказа', 'Публикует то же событие в supergroup для сотрудников'],
      ],
    },
    {
      y: 3.35,
      title: 'B. Сообщение от заказчика',
      fill: colors.sky,
      line: colors.blue,
      steps: [
        ['Заказчик', 'Пишет вопрос в личку боту'],
        ['Бот', 'Определяет orderId и находит topicId'],
        ['Тема заказа', 'Пересылает сообщение в нужную тему'],
        ['Сотрудники', 'Видят вопрос и обсуждают его внутри темы'],
      ],
    },
    {
      y: 5.05,
      title: 'C. Ответ сотрудника клиенту',
      fill: colors.sand,
      line: colors.gold,
      steps: [
        ['Сотрудник', 'Отвечает reply на клиентское сообщение в теме'],
        ['Бот', 'Считывает reply и понимает, кому отправить ответ'],
        ['Личка клиента', 'Доставляет сообщение обратно заказчику'],
        ['История', 'Связка reply остаётся у заказа как единая переписка'],
      ],
    },
  ];

  rows.forEach((row) => {
    addRoundedPanel(slide, { x: 0.72, y: row.y, w: 11.88, h: 1.25, fill: colors.white, line: row.line });
    addTag(slide, row.title, 0.95, row.y + 0.16, 2.45, row.fill, colors.text);
    row.steps.forEach((step, index) => {
      const baseX = 3.65 + index * 2.1;
      addRoundedPanel(slide, { x: baseX, y: row.y + 0.18, w: 1.84, h: 0.82, fill: colors.light, line: colors.line, linePt: 0.8 });
      slide.addText(step[0], {
        x: baseX + 0.08,
        y: row.y + 0.28,
        w: 1.68,
        h: 0.18,
        fontSize: 9.5,
        bold: true,
        color: colors.navy,
        align: 'center',
        margin: 0,
      });
      slide.addText(step[1], {
        x: baseX + 0.1,
        y: row.y + 0.48,
        w: 1.64,
        h: 0.32,
        fontSize: 8.6,
        color: colors.text,
        align: 'center',
        valign: 'mid',
        margin: 0,
      });
      if (index < row.steps.length - 1) {
        addArrow(slide, baseX + 1.88, row.y + 0.48, baseX + 2.05, row.y + 0.68, row.line, '');
      }
    });
  });

  addFooter(slide);
}

function makeDataSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: colors.light };
  addTitle(slide, '3. Что нужно хранить в системе', 'Минимальные сущности для связки заказа, темы и лички клиента');

  addRoundedPanel(slide, { x: 0.75, y: 1.55, w: 3.7, h: 4.9, fill: colors.white });
  slide.addText('Карточка заказа', {
    x: 1.0,
    y: 1.9,
    w: 1.9,
    h: 0.25,
    fontSize: 17,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  addBulletList(slide, [
    'orderId',
    'orderNumber',
    'customerId',
    'customerTelegramChatId',
    'internalGroupId',
    'internalTopicId',
    'bridgeEnabled',
    'assignedEmployeeIds',
    'lastCustomerStatusMessageId',
  ], { x: 1.0, y: 2.35, w: 2.7, h: 3.25, fontSize: 10.5 });

  addRoundedPanel(slide, { x: 4.78, y: 1.55, w: 3.7, h: 4.9, fill: colors.white });
  slide.addText('Таблица связок сообщений', {
    x: 5.03,
    y: 1.9,
    w: 2.5,
    h: 0.25,
    fontSize: 17,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  addBulletList(slide, [
    'bridgeMessageId',
    'orderId',
    'customerChatId',
    'customerMessageId',
    'internalTopicId',
    'topicMessageId',
    'direction: inbound / outbound',
    'messageType: text / file / photo / system',
    'status: sent / delivered / failed',
  ], { x: 5.03, y: 2.35, w: 2.65, h: 3.25, fontSize: 10.5 });

  addRoundedPanel(slide, { x: 8.82, y: 1.55, w: 3.7, h: 4.9, fill: colors.white });
  slide.addText('Правила публикации', {
    x: 9.05,
    y: 1.9,
    w: 2.0,
    h: 0.25,
    fontSize: 17,
    bold: true,
    color: colors.navy,
    margin: 0,
  });
  addBulletList(slide, [
    'Из клиента внутрь можно пересылать автоматически',
    'Из темы клиенту отправляется только явный ответ сотрудника',
    'Внутренние заметки не уходят заказчику',
    'Файлы и фото можно маркировать как клиентские или внутренние',
    'У каждого события должна быть защита от дублей и циклов',
  ], { x: 9.05, y: 2.35, w: 2.7, h: 3.25, fontSize: 10.5 });

  addFooter(slide);
}

function makeRoadmapSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: colors.light };
  addTitle(slide, '4. Рекомендуемый MVP', 'Как внедрять постепенно, не ломая текущего бота и существующие сценарии');

  const blocks = [
    {
      x: 0.9,
      title: 'Шаг 1',
      subtitle: 'Внутренняя supergroup',
      fill: colors.sky,
      bullets: [
        'Создать группу "Фабрика Казнадзей"',
        'Включить темы',
        'Одна тема = один заказ',
        'Бот публикует туда системные события по заказу',
      ],
    },
    {
      x: 3.95,
      title: 'Шаг 2',
      subtitle: 'Мост от клиента внутрь',
      fill: colors.mint,
      bullets: [
        'Клиент пишет боту в личку',
        'Бот определяет заказ',
        'Сообщение пересылается в нужную тему',
        'Сотрудники начинают работать из темы заказа',
      ],
    },
    {
      x: 7.0,
      title: 'Шаг 3',
      subtitle: 'Reply-ответ клиенту',
      fill: colors.sand,
      bullets: [
        'Сотрудник отвечает reply на сообщение клиента',
        'Бот отправляет ответ обратно в личку заказчику',
        'Переписка остаётся связанной по заказу',
      ],
    },
    {
      x: 10.05,
      title: 'Шаг 4',
      subtitle: 'Дальнейшее усиление',
      fill: colors.rose,
      bullets: [
        'Файлы и фото',
        'Кнопки "Открыть заказ" и "Открыть изделие"',
        'Непрочитанные сообщения',
        'Ответственный по заказу',
      ],
    },
  ];

  blocks.forEach((block) => {
    addRoundedPanel(slide, { x: block.x, y: 1.8, w: 2.3, h: 3.95, fill: colors.white });
    addTag(slide, block.title, block.x + 0.23, 2.08, 0.82, block.fill, colors.text);
    slide.addText(block.subtitle, {
      x: block.x + 0.2,
      y: 2.46,
      w: 1.9,
      h: 0.42,
      fontSize: 13,
      bold: true,
      color: colors.navy,
      margin: 0,
      fit: 'shrink',
    });
    addBulletList(slide, block.bullets, {
      x: block.x + 0.16,
      y: 3.0,
      w: 1.95,
      h: 2.35,
      fontSize: 9.6,
    });
  });

  addRoundedPanel(slide, { x: 1.1, y: 6.0, w: 11.0, h: 0.58, fill: colors.navy, line: colors.navy });
  slide.addText('Главный принцип MVP: клиент остаётся в личке с ботом, сотрудники работают в supergroup, бот связывает два контура и не раскрывает клиенту внутреннюю переписку.', {
    x: 1.35,
    y: 6.15,
    w: 10.5,
    h: 0.18,
    fontSize: 10.5,
    bold: true,
    color: colors.white,
    align: 'center',
    margin: 0,
  });

  addFooter(slide);
}

makeTitleSlide();
makeArchitectureSlide();
makeFlowSlide();
makeDataSlide();
makeRoadmapSlide();

pptx.writeFile({ fileName: outputPath }).then(() => {
  console.log(`PPTX created: ${outputPath}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
