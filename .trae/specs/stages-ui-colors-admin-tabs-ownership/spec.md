# Цвета этапов, вкладки Настроек и Управление этапами (strict ownership)

## 1. Проблема и пользователи

**Проблемы, описанные пользователем verbatim (2026-09-16):

A) **Цвета шапки vs ячеек не совпадают.** На скриншотах таблицы header (вторая строка "Этапы производства") отличаются от закрашенных ячеек в таблице OrdersWorkspace для одних и тех же легендов. В частности пользователь приводит скриншоты:
- Укомплектован = #DFC590 в настройках, но в таблице он жёлтым/оранжевым (головный ячейки `0/0 выглядят с tan;
- Набирается заготовка = #9EB4F5 в настройках (синийв ячейка Фиолетовыев столбце Набирается заготовка Синие = несоответствие;
- Сборка после покраски, Контроль качества, Доставка/Монтаж — разные оттенки фиолетового в шапке и в ячейках;
- Также виден случай ячеек столбца Время = желтый (#ffd924) даже при отмеченной ручной отметки — явная несогласованность цветов.

Пользователь просит проверить связь между «Настройки → Этапы производства» и «Главная таблица заказов»: цветов вторичной шапки (secondaryHeaders defaultHex/hex) и цвета закрашенных вручную или автозакрашенных ячеек table cells (`getSecondaryHeaderBackground`, `resolveManualMarkColors`).

B) **Настройки — Общие параметры** сейчас представляют собой свалку: обновления, бот, доступы — всё в одном scroll. Надо разделить на **вкладки внутри "Обновления, ТГ бот, Доступ** (типа обновления = updates, telegram бот = bot/tg, доступ = access/pin+access checks). Сейчас `activeRole === 'general' renders UpdatesOverview + telegram settings + token controls all together. Split into 3 in-page tabs using existing `settingsTabs or a dedicated subTab for Общие.

C) **Настройки — Сотрудники:** перед кнопкой **«Уведомления в ТГ» (openTelegramNotificationModal)** сделай аналогичную кнопку. По клику — **маленькую модалку внутри** (Modal size=sm, single switch** — **«Управление этапами»** – boolean switch. Behavior: OFF (default): любой сотрудник, имеющий доступ к этапу по allowedColumns может и принимать (apply) И отменять (cancel) этап; ON = только тот сотрудник, кто принял этап (тот чей `updatedBy` actor == в manualStageMarks record stored) может его отменять. Другие сотрудники с access к этапу видят, могут принимать, но отменять не могут — ошибка "Только исполнитель может отменить этап. Исполнитель: Иван И.». Хранить глобально в record employee `strictStageOwnershipEnabled` по умолчанию false. enforce server-side в orderStore. Mark/cancel mark logic.

**Пользователи:**
- Admin role (owner / директор): задает настройки, вкладки;
- Employees (workshop manager, painter, carpenter, painterpost, QC, logistics, kitting, draftsmen): использует отмечает этапы;
- Владелец системы (superuser): не ломать ничего не нужно.

## 2. Цели и не-цели

### Цели

A) Цвет stage header=цвет cells: гарантировать, что: (1)secondaryHeader defaultHex для 1-to-1 совпадает с swatch color saved in settings; (2) resolveManualMarkColors возвращает тот же оттенок при legendKey-based cell background; (3) ручная окраска ячейки (manual mark apply/cancel работает на всех 19 столбцах в таблице одинаковым образом.

B) Вкладки Настройки/Общие параметры: три внутр. вкладки subTabs 4 (general):

1. **Обновления** — UpdatesOverview в full, кнопки сохранить настройки обновления, install check updates install.
2. **ТГ бот** — публичный адрес, токен бота, ID супергруппы, мост switch, чек бота, вебхук, меню кнопки, логи ТГ, экспорт/импорт данных (всё ТОЛЬКОТГ бот вкладки);
3. **Доступ** — PIN check, Admin Token Controls, журнал действий, экспорт/импорт? No: журнал действий + экспорт импорт остаются также на вкладке «Доступ»? Пользователь написал «Доступ» можно разместить access pin, token controls, backup? Пользователь verbatim: типa 3 вкладки "Обновления / ТГ бот / Доступ". Place Token Controls, PIN verification & backup export/import (admin operations tokens & backup place under access; журнал действий access-audit).
- Цель B): пользователь понимает по какую кнопка открывает что.

C) Strict stage ownership:

- По клику новая кнопка перед «Управление этапами → маленькая модалка switch:

  Заголовок «Управление этапами»
  Subtitle: «В выключенном состоянии: любой сотрудник с доступом может отменять этап. Включенном: только тот, кто принял, может отменить.»

  Global sw toggle ON/OFF.
  Кнопки «Сохранить» + «Отмена».

- Persisted employee record default `strictStageOwnershipEnabled=false`.
- Server enforce OrderStore.setManualStageMarks при cancel operation (`legendKey=''`): IF employee has strictStageOwnershipEnabled === true and existing mark has an updatedBy/ownerId actor, actor != current actorId → throw error/reject, do not modify cancel that cell

### Не-цели (non-goals):

- Не менять existing ролей в ROLE_COLUMN_ACCESS_OPTIONS кроме флага;
- Не менять ТГ бот flow, QR scanner, employee menu buttons;
- Не менять логику приёма apply mark, только отмены cancel check;
- Не менять upload attachment scopes render images, customer image rendering;
- Не вводить role-level granular per-stage override switches;
- Не добавлять workflow steps, production schedule logic unrelated.

## 3. Функциональные требования (FR)

### FR-A. Цвета.

FR-A1. **SecondaryHeaders defaultHex consistency.** В client/server `normalize config postpasses (orderStageLegend.js L1-269, server/orderStageLegendConfig.js L1-300):
* Каждая secondaryHeader `cell.hex OR defaultHex соответствует точно тому значению, что сохранён в JSON settings (с учетом форс-пост-прохода swap colors approved/drafting swap hex mismatch earlier fix;
* swatch cell в Настройки/Этапы производства показывает одинаковый цвет (useTableBackground true → hex is table background; false legend cell header color.
* Порядок секций force override postpass apply:
  1) approved `#A8D7B6;
  2) Расписан drafting `#9BC5A7;
  3) preAssembly `#9EB4F5 `#9EB4F5 insert index;
  4) delivery ready/Доставка textHex black textcolor white swap.

FR-A2. **Cell background secondary-stage columns (non-manual):**
`getSecondaryHeaderBackground(colHeader)` returns color `colHeader.cellStyle.hex or `defaultHex exactly matches cell background rendering secondaryHeader cell defaultHex for column `Комплектация заказа Укомплектован kitting `#DFC590 — ровно то же hex и вторичной шапке заголовки и ячейкам data cells ВСЕХ 19 col; no purple overlay (text colored cells от #9EB4F5 light-blue/purple mismatch! Набирается заготовка stock legendKey = **на экране пользователя #B4B1FF bright purple насыщенный сиреневый вместо #9EB4F5 фиолетово-синий. Need to ensure the cell backgrounds use resolve secondaryHeader defaultHex always.

FR-A3. **Manual stage marks cell colors resolveManualMarkColors:**
*   * resolveManualMarkColors(mark.legendKey, stageLegendEntry hex/defaultHex) return object background based ALWAYS stage.hex/stage.defaultHex (not other field name `#A8D7B6 etc) matching header color for 12 legendKeys.
*   Ensure that if manual mark for column itemStartDate (postpaint) legendKey postpaint → returns postpaint swatch color #C198C3 #C198C3 swatch color from settings.

FR-A4. **Column key → Legend key consistency mapping:**
- PRIMARY INDEX=10 (preAssy) legendKey=stock → #9EB4F5.
- 11 = logistics → #7CA287 delivery color...
- 15=postpaint #B88
— 15 itemStartDate legendKey=postpaint → #C198C3
—16 qc #B49BCA? Wait server configs need to return this correctly.

### FR-B. Tabs.

FR-B1. **Admin.js → activeRole === 'general' (Общие параметры) sub tabs = subTab state. 3 Sub Tabs:
```
Табы вкладок Nav:
[ 🔄 Обновления | 🤖 Телеграм бот | 🔑 Доступ ]
```
Active by default: `updates` if user previous tab. History query param via `subTab` or `tab` for sub.

FR-B2. **Tab 1 — 🔄 Обновления (`subTab=updates):**
- UpdatesOverview с `updateStatus`, `installJob`, `updateMessage`, `updateError`, `checkingUpdates`, `installingUpdates`, `appSettings`(чтение, `onSettingsChange` selfUpdateEnabled, updateBranch, updateRepositoryUrl, `onRefresh`, `onInstall`, `onSaveUpdateSettings`, `savingUpdateSettings`.

FR-B3. **Tab 2 — 🤖 Телеграм бот (subTab=bot):**
- Публичный адрес project, токен ТГ бот, ID супергруппы, мост заказчик↔супергруппа switch, кнопки: Сохранить настройки, Проверить бота, Установить webhook, 🔄 Обновить кнопки ТГ, Логи ТГ бота (модалка showTelegramLogs).
Also include `telegramCheckResult` panel-info block.

FR-B4. **Tab 3 — 🔑 Доступ (subTab=access):**
- PIN доступ `verifyingSettingsPinModal при loading если требуется pin? No PIN modal всегда сначала верифицирован через глобальная защита routes и Admin wrapper earlier code;
- Логи Журнал действий (button open activityLogs modal);
- Экспорт/Импорт данных backup export/import;
- AdminTokenControls block at bottom.

### FR-C. Управление этапами (stage ownership strict).

FR-C1. **Employee store schema new field `strictStageOwnershipEnabled`. Добавить поле в `server employeeStore` create/update/save field. Default false. Normalize read if missing → false if undefined.

FR-C2. **Client side: Настройки — Сотрудники SettingsActions:**
> `<SettingsActions>` внутри рендерит **ДВЕ кнопки последовательно:
> 1. НОВАЯ: `<button className="btn" onClick={openStageOwnershipModal}>⚙️ Управление этапами</button>
> 2. Старая: 👁️. «Уведомления в ТГ».

FR-C3. **Модалка Stage Ownership Modal (size=sm small):**
Modal title "Управление этапами".
Subtitle: "Кто может отменять этапы: OFF — любой сотрудник с доступом к этапу. ON — только сотрудник, принялший этап."
SWITCH single switch control label: label="Управление этапами"
State `draftStrictStageOwnership local useState from app.
Кнопки "Сохранить" "Отмена".
By default submit POST/PUT globals? Global? Пользователь verbatim делает global switch «Управление этапами" не per employee! Verbatim user says "сделай аналогичную кнопку с небольшой модалкой, внутри которой сделай свитч, подписанный Управление этапами". ГДЕ? в разделе Настройки → Сотрудники. Значит global single switch global single global switch для всей системы global ownership. User: verbatim phrase: "меняет доступ к отмеченным этапам - в выключенном свиче все, у кого есть доступ к этапу могут его принимать/отменять, во включенном - только тот, кто принял этап, может его отменить".

Перечитаем user prompt again:
В НАСТРОЙКИ — СОТРУДНИКИ ПЕРЕД КНОПКОЙ УВЕДОМЛЕНИЯ В ТГ СДЕЛАЙ АНАЛОГИЧНУЮ КНОПКУ > МАЛЕНЬКАЯ МОДАЛКА > switch УПРАВЛЕНИЕ ЭТАПАМИ > ГЛОБАЛЬНОЕ ПОВЕДЕНИЕ ВСЕХ СОТРУДНИКОВ. FR-CRITICAL USER INTERPRETATION: global app-wide switch (single boolean в SettingsStore a new field strictStageOwnershipEnabled boolean false.
> Acceptance user writes "Каждая ячейка собирает логи принятия/отмены этапов, это упрощает эту задачу».
Wait user: "во включенном - только тот, кто принял этап, может его отменить". Actor = `updatedBy` who saved manualStageMarks.updatedBy actor identity == currentEmployeeId actor → actor === employee_id.

Флаг глобальный system wide flag а не per-employee.

FR-C4. **Server enforce:**
OrderStore.setManualStageMarks (cancel operation when operation == cancel mark.
`stageMarksCancel op cancel legendKey empty string
when `SettingsStore.get().strictStageOwnershipEnabled` === true:
   For each cancelEntry being cancelled (legendKey empty AND hasExisting mark has existing manualStageMarks[columnKey] entry with legendKey non-empty):
   1.   Check If (Settings.strictStageOwnershipEnabled → true
2.     existingMark has updatedBy
3.   String(updatedBy) not equal String(current_actor || '') !== '' && actor !== existing updatedBy → skip cancel? Throw Error("Только сотрудник, принявший этап, может его отменить. Исполнитель: ${fullName of owner}.");
4.   Do nothing for apply marks;
5.   When stage cancel via manualStageClears set.

FR-C5. **Telegram route POST /orders/:id/telegram-stage-mark and client cancel stage button Ошибка пользователю текст 400 error message translated cancel permission error.

## 4. Нефункциональные требования.

NFT1. Backwards совместимость default behaviour when flag default false → старые пользователи / без конфиги strict = OFF.
NFT2. Build client + server require smoke.
NFT3. Pin protected operations, existing test stages, colors, marks still apply same colors user visual. No regressions 4 cancel permission.
NFT4. Modal EmployeeModal add new field NOT needed. Global switch modal separate modals existing ones. Keep it small. Minimal JSX CSS settings-switch component reusable existing `.

## 5. Acceptance Criteria (ACs)

### rule: Запустить `rule: FR-A1/2/3/4:
rule AC-A-color-header-hex-match:
Каждый secondaryHeader cell defaultHex/hex точно соответствует сохраненному в JSON Settings stageLegendConfig → настройки swatches. Проверка: client save secondaryHeaders[i].hex или defaultHex равно stage.legendKey=approved→exact same #RRGGBB для всех 18 ячеек.

rule AC-A2-secondaryHeaderCell-bg:
При рендере OrdersWorkspace cells (не ручная mark — `getSecondaryHeaderBackground` → цвет background для data cells совпадает ячейка данных cell header background совпадает defaultHex 1 в 1 swatch color шапки при одинаковой ячейке. В частности kitting `#DFC590` в cells package column bg exactly 1/1.

rule AC-A3-manual-cell-color:
resolveManualMarkColors({legendKey}) returns background/color object от stage hex defaultHex color. Пометка approved green approved swatch color matches.

rule AC-A4-log-color-qc-postpaint all columns 15/1 match colors swatches postpaint/Контроль качества.

rule AC-B1-general-tabs=3:
Admin.js Общие parameters subTab=3 вкладок Tabs exactly 3 titles. No scroll single page sections moved out.

rule AC-B2-tab=updates only UpdatesOverview & save update:
Only UpdatesOverview, check updates panel inside first tab only;
No Telegram settings present in 1st tab, no PIN present either.

rule AC-B3-tab=tg only telegram settings, bot & buttons;
rule AC-B4-tab=3 access only PIN modal/pin, logs, Token admin activity/export-import/access-token-controls;

rule AC-C1 global strictStageOwnershipEnabled default false saved Settings Store.
rule AC-C2 button position:
Настройки Сотрудники before Notification TG button first button=Управление этапами, second button=Уведомления в ТГ buttons appear. Layout correct.

rule AC-C3 Ownership Modal size=sm small modal: open/close. Switch toggle. save enabled save POST/PUT Settings correct.

rule AC-C4 enforce server cancel strict=strictStageOwnershipEnabled on existingMark updatedBy NOT actorId actor cancel actorId != existing actor!=updatedBy → cancel error message shown toaster message, mark cancel mark unchanged.

rubric AC-C5 Owner-cancel:
When strict ON, owner can cancel, non owners get error. strict OFF, users can cancel
scale: 2=correct error shown/owner can; 1 minor issue; 0 fail; 2 pass.
