# Пользователи, роли, логин-пароль - Product Requirements Document

## Overview
- **Summary**: внедрить полноценный модуль «Пользователи / Права доступа» (логин+пароль по имени пользователя, роли с ACL по страницам, редактирование и удаление, генератор и копирование паролей, brute-force lockout).
- **Purpose**: сейчас авторизация — один пароль admin + менеджер без логина. Требуется заменить на модель 1 пользователь = 1 логин + 1 роль (массив разрешённых страниц). Администратор сохранить как неудаляемого юзера `Administrator` с тем же хэшем пароля, который уже задан в настройках.
- **Target Users**: администраторы мебельной фабрики (по настройке системы) + рабочие сотрудники (используют свой логин).

## Goals
- G1: В бургер-меню (App.js навигация) между «Этапы производства» и «Настройки» добавить пункт **🔐 Пользователи**, ведущий на отдельную страницу `/users` с двумя вкладками — «Пользователи» и «Права доступа».
- G2: Вкладка «Пользователи» — таблица (Имя пользователя · Сотрудник · Права доступа · Действия (✎/🗑)). Кнопка «Добавить пользователя», модалка редактирования с 5 полями (логин, роль radio, пароль, подтвердить, привязка к сотруднику combobox searchable). В полях пароля — глаз и генератор/копия пароля.
- G3: Вкладка «Права доступа» — таблица ролей (Название · Кол-во страниц · Кол-во пользователей · Действия). Кнопка «Добавить», модалка: имя роли + выпадающий список с чекбоксами (8 страниц — Заказы / Заявки / Архив / Заказчики / Сотрудники / Этапы производства / Пользователи / Настройки).
- G4: Страница входа (`/` Home Login) теперь имеет 2 поля: «Имя пользователя» и «Пароль». Единственный bootstrap — логин `Administrator` + старый adminPasswordHash. После 3 неверных попыток — lock 60 секунд с живым таймером.
- G5: Сессия после login выдаётся по логину/роли (JWT-signed, как сейчас app-session). Роль определяет ACL на каждую страницу как UI, так и на сервере через новый ACL-middleware (вместо старого `manager`/`admin` константного уровня).
- G6: Не ломать существующие `/settings` (Общие/Сотрудники/Этапы), кроме вкладки «🔑 Доступ» → из неё убрать форму «Пароль администратора», оставить только PIN и резерв.копирование/логи, + поправить описание.

## Non-Goals
- Не вводить многоуровневую иерархию ролей (наследование). 1 пользователь = 1 роль, 1 роль = массив флагов-страниц, «Administrator» через отдельное поле `isSystem=true`.
- Не добавлять bcrypt/argon — существующий SHA-256+salt из `appAuth.hashPassword` переиспользуется, проект не имеет bcrypt в dependencies, новых lib добавлять нельзя.
- Не менять Telegram-аутентификацию мастеров через PIN / webapp и не менять логику roleStore (роли цеха — carpenter/assembler/designer/painter). Новые пользовательские роли — это *ACL UI-страниц*, не роли цеховых работ.
- Не делать SSO, 2FA, капчу, OAuth и социальные входы — вне скоупа.

## Background & Context
- Нынешняя схема: `Home.js` предлагает 1 карточку «Администратор» с полем пароля → POST `/api/auth/login { role: 'admin', password }`. Роли сессии — `admin`/`manager` (строковые).
- Middleware `requireAdminAccess`/`requireManagerAccess` проверяют: `canAccessRole(session.role, requiredRole)`.
- `settingsStore.getAuthConfig()` хранит `adminPasswordHash, settingsPinHash, authSessionSecret`. Пароль — хэш `salt:sha256(salt:password)`.
- UI-стили: `App.css` + классы `.btn`, `.card`, `.tabs`, `.modal-*`, `.form-group`, `.settings-*`, `.mobile-settings-card`, `.help-tooltip`.
- Кнопки «✎/🗑» в модалках таблиц уже используются в `Admin.js` employees + workshop-колонке «Действия».
- `SettingsHeader`, `SectionHeader`, `SettingsFeedback`, `SettingsActions`, `Modal`, `ModalHeader` — переиспользовать.
- Пояснения клиента из чата Q&A:
  - (S-B) Users отдельный userStore, bootstrap-автосид Administrator синхронно с settings.adminPasswordHash.
  - (A) 1 пользователь = 1 роль (radio-список ролей).
  - (A) Страница `/users` отдельно, пункт в бургере.
  - (B) Логин только новая схема: `POST /api/auth/login { username, password }` без role-поля; старый `{ role, password }` отключается.
  - (A) Новый ACL middleware, сессия содержит `{ userId, username, roleId, roleKey, pagePermissions[], exp }`.
  - Доп. требование пользователя: *«В Настройки — Общие параметры во вкладке Доступ можно убрать поле Пароль администратора, поправить описание, оставить настройку пин-кода»*.

## Functional Requirements
- **FR-1 (Меню навигации)**: между ссылками на «Этапы производства» и «Настройки 🔒» в `App.js` добавить `<Link to="/users">🔐 Пользователи</Link>`. Отображать только если пользователь имеет ACL-разрешение `users` или «системный» role. Для уже существующих менеджеров без доступа — пункт скрыт.
- **FR-2 (Страница /users)**: новая страница `UsersPage.js`, рендерится по роуту `/users` под `ProtectedRoute`, требует разрешения `users` в роли. 2 вкладки tabs: «👥 Пользователи» (default) и «🔑 Права доступа».
- **FR-3 (Таблица Пользователи)**:
  - Колонки: **Имя пользователя** · **Сотрудник** (ФИО, если привязка есть; иначе «—») · **Права доступа** (отображает label роли, для `Administrator` fixed badge «Полные права») · **Действия**: кнопка ✎ (редактировать), кнопка 🗑 (удалить с confirm).
  - Системный пользователь `username=Administrator`: кнопка 🗑 **дизаблена** (серый), tooltip «Невозможно удалить системного пользователя». ✎ доступна, но запрещено менять username (disabled) + невозможно снять роль с «Полные права».
  - В конце header-таблицы над таблицей справа кнопка **«Добавить пользователя»** (класс `.btn.btn-success`, как сотрудники).
  - Мобильный вид по аналогии с employees-tab (mobile-card list), карточки с фио/ролью + 2 кнопки внизу.
- **FR-4 (Модалка Добавить/Редактировать пользователя)**:
  - 1) Имя пользователя — `username`, input текстовый, min=3, max=40, уникальный (валидация сервером). Лат/цифры/подчёркивание/точка/дефис.
  - 2) Права — **радио-кнопки внутри scrollable списка ролей** (как dropdown по UX, но с single-select radio). Опции — все роли из role-permission таблицы + отдельная опция «Полные права» (системная), отмечается для Administrator. При создании пользователя без роли — ошибка.
  - 3) Пароль — input password, справа 2 иконки: 👁 (toggle показать/скрыть) + 🎲 (клик открывает модалку «Сгенерировать пароль» как в FR-6). Под input кнопка/иконка 📋 копия текущего пароля (если не пуст) → toast «Пароль скопирован в буфер».
  - 4) Подтвердите пароль — input password (глаз). Валидация «Пароли не совпадают».
  - 5) Привязка к сотруднику — **комбобокс** с input-searchable по ФИО, dropdown список сотрудников с поиском в реалтайме (фильтр по input), клик по сотруднику → выбор. Есть кнопка очистки. По-умолчанию «Не привязан».
  - Редактирование: поле «Пароль» и «Подтвердите» — опционально. Если пусто — пароль не обновляется, текст подсказка «Чтобы сменить пароль, заполните оба поля».
- **FR-5 (Модалка Генератор пароля)**:
  - Отдельный компонент `PasswordGeneratorModal.js`.
  - Поле **Длина пароля** (number input, default 12, min 4, max 64).
  - 3 чекбокса: **«Спецсимволы !@#$%^&*()_+-=[]{};:,.<>?»**, **«Цифры 0-9»**, **«Регистр A-Z a-z»»**. По умолчанию все 3 включены. Если все выключены — disable генерации и подсказка «Включите хотя бы один набор».
  - Кнопка **«🎲 Сгенерировать»** + поле результата (readonly) рядом со значком 📋 «Скопировать».
  - После нажатия ОК (принять) — результат заполняется и в «Пароль», и в «Подтвердите пароль» UserModal.
- **FR-6 (Роли/Вкладка Права доступа)**:
  - Таблица: **Название роли** · **Страниц в правах** (число отмеченных) · **Пользователей** (COUNT users where role) · **Действия** (✎/🗑).
  - Кнопка «Добавить» (`.btn.btn-success`) открывает RoleModal.
  - RoleModal:
    - 1) Имя права/роли (текстовый, 3-50, уникальный).
    - 2) **Dropdown с чекбоксами** — 8 страниц: `Заказы`, `Заявки`, `Архив`, `Заказчики`, `Сотрудники`, `Этапы производства`, `Пользователи`, `Настройки`. Над списком поисковая строка по названиям. Можно закрыть-раскрыть dropdown. Dropdown header показывает сколько опций отмечено (e.g. «5/8»).
    - Системная роль «Полные права» — предопределённая, все 8 страниц, не редактируется в UI (только view). Не удаляется.
- **FR-7 (Удаление Пользователя)**: ConfirmDialog как сейчас в workshop. Текст «Вы действительно хотите удалить пользователя Иван? Это действие не отменить.». Отмена/Удалить. Для `Administrator` кнопка дизаблена и confirm не открывается.
- **FR-8 (Удаление Роли)**: нельзя удалить роль, если есть хотя бы 1 пользователь с этой ролью. Отображать ошибку «У этой роли есть N пользователей — переназначьте их, чтобы удалить роль.».
- **FR-9 (Форма Логин Home.js)**:
  - Два поля: **«Имя пользователя»** (текст, autofocus, placeholder `Administrator`) и **«Пароль»** (password, глаз 👁 как в UserModal, default hidden).
  - Кнопка «Войти». Ранее 1-карточный интерфейс admin role удаляется, доступ только по username.
  - Первичная настройка bootstrap (если adminPasswordHash нет): оставить карточку первичной настройки пароля Administrator, после задания пароля пользователь `Administrator` autoseeded с этим паролем и ролью Полные права.
  - Бруфорс: сервер считает failed attempts по IP за последние 30 минут (в памяти, без хранения в db). После 3 подряд ошибок — `423 Locked` с JSON `{ lockUntilMs, lockSecondsRemaining }`. Клиент показывает блок «Слишком много попыток. Повторите через: 59, 58, 57…» с countdown до 0, после 0 форма снова активна.
  - Если `Administrator` заблокирован — всё равно заблокировано.
- **FR-10 (ACL сессия и проверки)**:
  - Новый session payload при login: `{ tokenType: 'app-session', userId, username, roleId, roleKey, fullAccess: true|false, permissions: {orders,requests,archive,customers,employees,stages,users,settings}, exp }`.
  - `requirePageAccess(page)` middleware проверяет permissions[page] || fullAccess, иначе 403.
  - `ProtectedRoute` в App.js теперь принимает `requiredPage='orders' | 'settings' | ...` вместо `requiredRole='manager'`; для совместимости routes старые ключи мапятся: manager → требуется `orders`, admin → требуется `settings` (или что соответствует конкретной странице).
  - Навигация ссылки в App.js (`Заказы`, `Заявки`, `Архив`, `Заказчики`, `Сотрудники`, `Этапы`, `Пользователи`, `Настройки`) — скрываются если пользователь не имеет права.
- **FR-11 (Settings → Доступ вкладка)**:
  - Удалить из `AdminTokenControls` form-group с «Пароль администратора» + кнопку «Сохранить пароль». Оставить только PIN-код секцию.
  - Изменить заголовок-подпись panel-soft, удалить все упоминания «пароль администратора».
  - Новый helper-текст: «Управление паролями пользователей и правами переехало в отдельный раздел 🔐 Пользователи (бургер-меню). Здесь задаётся только дополнительный PIN-код для подтверждения доступа к настройкам.»
- **FR-12 (Server REST API users/permissions)**:
  - `GET /api/users` — список пользователей (без passwordHash), с join name сотрудника, label роли, страницы роли.
  - `POST /api/users` — создать.
  - `PATCH /api/users/:id` — обновить.
  - `DELETE /api/users/:id` — удалить (409 для Administrator).
  - `GET /api/roles` — список ролей (включая системную Полные права).
  - `POST /api/roles` — создать.
  - `PATCH /api/roles/:id` — обновить.
  - `DELETE /api/roles/:id` — удалить (409 если имеет users).
  - `GET /api/auth/login` теперь принимает только `{ username, password }`; `{role, password}` → 400 «Схема входа обновлена — используйте Имя пользователя».
  - `POST /api/auth/setup` → deprecated, теперь создаёт пользователя `Administrator` (back-compat для свежих инсталляций).
  - Новый endpoint `POST /api/users/me` → возвращает профиль текущего (себя).
- **FR-13 (Миграция данных / хранение)**:
  - `stores/userStore.js` — новый store, файл `db.users` в основном JSON-хранилище. Поля: `_id, username, passwordHash, employeeId?, roleId?, isSystem: boolean, createdAt, updatedAt, createdBy?`.
  - `stores/permissionRoleStore.js` — `db.permissionRoles`, поля: `_id, name, isSystem, pages:{orders,requests,archive,customers,employees,stages,users,settings}, createdAt, updatedAt`.
  - При каждом старте сервера (boot) проверка sync:
    - Если adminPasswordHash есть и пользователя `Administrator` нет → авто-create user с `username=Administrator`, `passwordHash = settings.adminPasswordHash`, `isSystem=true`, `roleId = system-full-access`.
    - Если role «Полные права» нет → авто-create.
    - Синхронизация passwordHash: если settings.adminPasswordHash изменён (кто-то писал через PUT /api/auth/passwords/старый API) → обновить и user Administrator хэш (двусторонняя синхронизация). В новом UI PUT /api/auth/passwords → делается deprecated (501), пароль только через UsersPage/Users API.

## Non-Functional Requirements
- **NFR-1 (Security)**: пароли никогда не отдаются на клиент (даже хэши) ни в каком GET. Форма смены пароля AdminTokenControls удалена. Логин attempts lockout по IP с 60s cool-down. Timing-safe compare для username+password (crypto.timingSafeEqual как сейчас).
- **NFR-2 (Compatibility)**: существующие sessionToken формата old role admin невалидируются при первой проверке, clearAppAuthSession + редирект `/` login. Старые `ADMIN_TOKEN env` (loopback allowLocalWithoutToken) не трогать (оставить как backdoor только для локалхоста без сессии).
- **NFR-3 (No new deps)**: без npm install bcrypt/zxcvbn/xlsx etc. Переиспользовать `crypto.randomBytes`, `navigator.clipboard` для copy, существующий `XLSX` только если понадобится экспорт пользователей (нет требования).
- **NFR-4 (Style consistency)**: все modalки/формы должны точно повторять существующие стили `.form-group`, `.btn`, `.modal-*`, `.tabs`. Mobile-first, не ломать desktop table layout (80%).
- **NFR-5 (Performance)**: combobox сотрудников использует `useMemo`+фильтр по уже загруженному списку сотрудников (один GET `/api/employees` при маунте UsersPage), не делать отдельные запросы на каждый символ.

## Constraints
- **Technical**:
  - bcrypt/argon не может быть добавлен. Используем существующий SHA-256 + salt hashPassword.
  - Routes все Express. Stores все JSON fs-store через `./stores/store`.
  - Client — CRA, React 18, React Router 6 (BrowserRouter v6).
  - Без Zustand/Redux — только React.useState/useContext, как сейчас (RoleConfigContext, appAuth pub/sub).
- **Business**:
  - Пользователь `Administrator` никогда не удаляется и всегда имеет Полные права (even если кто-то попробует сохранить с меньшими через PUT).
  - Пароль, который пользователь сейчас использует для admin → должен работать для username `Administrator`, без ручного сброса (FR-13 sync на boot).
- **Dependencies**: существующие `client/src/api.js` apiFetch использует Authorization Bearer — остаётся как есть.

## Assumptions
- Нет необходимости в статусе пользователя («Активен / Заблокирован»), только lockout per-login attempt.
- Pin-код настроек (settingsPinHash) остаётся как сейчас — только для /settings чувствительных действий.
- Уже созданные через EmployeeModal сотрудники никак не мигрируют — привязка user→employee опциональна, и только новом UI пользователи могут руками выбрать связь.
- 8 страниц — это весь scope ACL, отдельных разрешений «чтение/запись/удаление по столбцам» нет (это остаётся у роли цеха carpenter/assembler... / roleColumns).

## Acceptance Criteria

### AC-1: Пункт «Пользователи» в бургер меню и маршрут /users
- **Type**: `rule`
- **Given**: залогинен пользователь с разрешением Пользователи
- **When**: пользователь открывает бургер меню (кнопка-гамбургер или широкий экран)
- **Then**: между «Этапы производства» и «Настройки» видна ссылка «🔐 Пользователи»; при клике переходит на `/users` без ошибок
- **Pass Condition**: ссылка видна в DOM + route render UsersPage (используем React DevTools или snapshot)
- **Evidence**: Build success + manual open page `/users`.

### AC-2: Autoseed пользователя Administrator со старым хэшем пароля
- **Type**: `rule`
- **Given**: в settings есть ненулевой adminPasswordHash, в userStore нет записи с username=Administrator
- **When**: перезапустить node server (или вызвать app boot migration)
- **Then**: появился пользователь `Administrator` с isSystem=true, role = Полные права, и passwordHash === settings.adminPasswordHash (verifyPassword("текущий_пароль", hash) === true)
- **Pass Condition**: smoke node: `UserStore.findByUsername('Administrator') != null, hash == stored admin`
- **Evidence**: node -e require smoke + check.

### AC-3: Login по Administrator + текущий пароль работает
- **Type**: `rule`
- **Given**: seed пользователя Administrator существует с паролем P
- **When**: форма login username=Administrator + password=P, submit
- **Then**: 200 OK, session = app-session с fullAccess=true, redirect на /orders
- **Pass Condition**: через api call login, verify session payload
- **Evidence**: manual smoke test.

### AC-4: 3 неудачных попытки → lock 60s
- **Type**: `rule`
- **Given**: чистый state failed attempts
- **When**: 3 раза подряд неверный логин/пароль
- **Then**: 4-й возвращает 423 с `lockSecondsRemaining` ≈ 60, форма на клиенте дизейблена и показывает countdown `59...1`, после 0 формы разблокируется
- **Pass Condition**: server-side attempts counter (node test) + client state countdown test via useState
- **Evidence**: unit smoke lockout + screenshot countdown in UI.

### AC-5: UsersPage — модалка добавления пользователя (поля и валидация)
- **Type**: `rule`
- **Given**: открыта вкладка Пользователи, нажата «Добавить пользователя»
- **When**: поля заполнены с совпадающими паролями и выбранной ролью
- **Then**: можно сохранить, пользователь появляется в таблице; если пароли не совпадают или роль не выбран — красная ошибка и не сохраняется; combobox сотрудника фильтрует ФИО по подстроке; 👁 переключает type=password↔type=text
- **Pass Condition**: UserModal рендер 5 полей, валидация совпадения паролей, combobox search фильтр
- **Evidence**: screenshot + build success + unit smoke via JSDOM manual step.

### AC-6: Генератор пароля (длина + чекбоксы)
- **Type**: `rule`
- **Given**: открыт PasswordGeneratorModal, длина 16, все 3 чекбокса on
- **When**: нажать «🎲 Сгенерировать»
- **Then**: генерируется 16-символьный пароль, нажать «ОК» → пароли в UserModal «Пароль» и «Подтвердите» заполнены одинаково; 📋 копирует в буфер
- **Pass Condition**: assert regexp includes digit+caps+lower+specials, length 16, copied text === input.value
- **Evidence**: console log generated pw + clipboardData mock success

### AC-7: RoleModal — 8 страниц, сохранение в таблицу, forbid delete used role
- **Type**: `rule`
- **Given**: вкладка Права доступа → Добавить
- **When**: назвать роль «Закупки», отметить «Заказы», «Заявки», «Настройки», сохранить
- **Then**: в таблице отображается 3/8 страниц. Создать пользователя с ролью «Закупки» → удалить роль «Закупки» — 409 ошибка.
- **Pass Condition**: role pages set correct, delete blocks when used
- **Evidence**: DB dump + request+response logs

### AC-8: Server-side ACL на эндпоинты
- **Type**: `rule`
- **Given**: пользователь с ролью «Закупки» = {orders:true, requests:true, settings:false, users:false}
- **When**: `GET /api/users` от этого пользователя (Bearer session token)
- **Then**: 403 Forbidden. `GET /api/orders` → 200 (orders:true)
- **Pass Condition**: test matrix of 4 pages for user Закупки
- **Evidence**: node smoke script require authRoutes/userRoutes.

### AC-9: Settings → Доступ больше не имеет формы Пароль администратора
- **Type**: `rule`
- **Given**: открыта вкладка Настройки → Общие → Доступ (через admin)
- **When**: рендеринг sub-tab access компонента AdminTokenControls
- **Then**: нет input «Пароль администратора» и кнопки «Сохранить пароль». Есть только PIN форма + экспорт/импорт/логи + описание.
- **Pass Condition**: AdminTokenControls рендер без .admin-password input
- **Evidence**: grep of react snapshot or rendered DOM querySelectorAll

### AC-10: Не ломать существующие роуты Telegram, webhook, orders, requests, employees
- **Type**: `rubric`
- **Dimension**: `Нет регрессий` (0 побочных падений)
- **Scale**: 1-5
- **Anchors**: 1 = 3+ smoke breaks (e.g. Telegram routes fail); 3 = 1-2 breaks; 5 = 100% существующие `/api/auth/session`, `/api/orders`, `/api/employees`, `/api/workshop-requests`, login with Administrator, client npm run build exit 0, GetDiagnostics 0
- **Pass Threshold**: >= 4
- **Evidence**: node require smoke 11 routes + client build + types diagnostics clean

### AC-11: Качество UI/UX (единый стиль)
- **Type**: `rubric`
- **Dimension**: `Визуальная консистентность`
- **Scale**: 1-5
- **Anchors**: 1 = модалки/поля используют свои CSS-классы, отступы не совпадают; 3 = в основном OK, 1-2 компонента не соответствуют (например dropdown с поиском для «Привязка к сотруднику» написан как самодельный без стиля settings-dropdown); 5 = 100% повторяют стиль «Добавить сотрудника» из Admin.js — форма, кнопки, отступы, tooltip, mobile-card layout, нет дублирующей CSS библиотек (bootstrap не добавлен), классы `.form-group/.btn/.modal` как в проекте
- **Pass Threshold**: >= 4
- **Evidence**: визуальное сравнение скриншотов EmployeeModal vs UserModal vs RoleModal в DOM.

## Open Questions
- [ ] Нужен ли отдельный «Сотрудник» уровень доступа как встроенная предопределённая роль «Рабочий» (Заказы+Заявки)? → реализовать как default seed роль «Рабочий» с {orders, requests}.
- [ ] При смене пароля в UsersPage у Administrator синхронизировать passwordHash назад в settings.adminPasswordHash для старых скриптов импорта/экспорта бэкапов? → Да (FR-13 синхронизация туда-обратно на boot и PUT /api/users/:id).
- [ ] Пользователи без привязки к сотруднику — могут ли отправлять уведомления о своих действиях? → Пока нет, уведомления только через Employee и цеха.
