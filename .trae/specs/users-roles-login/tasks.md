# Пользователи, роли, логин-пароль - Implementation Plan

## Overview
Декомпозиция по информационным границам: сначала «Сервер (хранилища + миграции + Auth ACL + REST)», потом «Клиент UI (Home login + /users page + modals)», потом «Регрессии + верификация». Не редактируем одни и те же файлы параллельно.

## Task 1: Сервер — new stores и миграция Administrator/fullAccess role
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Создать `server/stores/userStore.js` с CRUD + findByUsername. Схема: `_id, username(lower+unique), passwordHash, employeeId?, roleId?, isSystem, createdAt, updatedAt`.
  - Создать `server/stores/permissionRoleStore.js` с CRUD + findByName. Схема: `_id, name, isSystem, pages:{orders,requests,archive,customers,employees,stages,users,settings}, createdAt, updatedAt`.
  - В `stores/store.js` если полей `db.users / db.permissionRoles` нет — инициализировать `[]`.
  - Создать helper `server/services/bootAuthSync.js`:
    - `ensureSystemFullAccessRole()` → если роли «Полные права» нет → создать, pages все true, isSystem=true.
    - `ensureAdministratorUserFromAdminPasswordHash()` → если username=Administrator нет → взять settings.adminPasswordHash (если не пуст) + isSystem=true, employeeId=null, roleId=system-full-access.
    - `syncAdministratorPasswordHashBiDirection()` → если у Administrator пароль был обновлён через users api → записать его и в settings.adminPasswordHash для back-compat; если в settings он сменился старым PUT /api/auth/passwords → скопировать в Administrator user.
  - Вызвать boot sync в `server.js` до app.listen (после seed демо-заказов, но перед routes).
- **Acceptance Criteria Addressed**: AC-2, AC-9, AC-10, AC-12 (FR-13)
- **Test Requirements**:
  - `rule` TR-1.1: node -e require(userStore+permissionRoleStore+bootAuthSync) в пустой DB → создаётся role Полные права и user Administrator с isSystem=true, exit0; delete user Administrator напрямую → find вернёт null → повторный запуск boot sync его заново создаст из settings.adminPasswordHash (если пароль есть).
  - `rule` TR-1.2: задать settings.adminPasswordHash = hashPassword("12345678"), boot sync → verifyPassword("12345678", userStore.findByUsername("Administrator").passwordHash) === true.
  - `rubric` TR-1.3: Storage isolation; scale 1-5; 1 = stores мутируют db.settings напрямую, 3 = read-only settings, 5 = через store-методы без прямого поля; threshold >=4; evidence code review store methods.
- **Notes**: имена ключей хранения в едином JSON файле `db.users` и `db.permissionRoles` (как db.employees).

## Task 2: Сервер — ACL middleware + новая сессия + логика login lockout
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - В `server/services/appAuth.js` добавить:
    - `createAppSessionTokenForUser(user, role)` → payload с `{userId, username, roleId, roleKey: role.isSystem?'full-access':'custom', fullAccess, permissions, exp, tokenType:'app-session'}`.
    - `getUserSession(userId)` → не нужно, stateless; только verify.
    - `authenticateUsernamePassword(username, password)` → проверка userStore + verifyPassword + return user.
  - В `server/middleware/security.js` добавить:
    - `requirePageAccess(page)` middleware (где page in {orders,requests,archive,customers,employees,stages,users,settings,admin-general,access}); если fullAccess или permissions[page] === true → next(), иначе 403.
    - Оставить старый `requireAdminAccess/requireManagerAccess` как alias для старых routes (delegate → requirePageAccess('settings') / requirePageAccess('orders')).
  - Новый singleton `server/services/loginLockout.js`:
    - Map `ip -> { failCount, lastFail, lockUntil }`.
    - `recordFailedAttempt(ip)` → +1, если >=3 → lockUntil = now + 60000ms.
    - `isLockedOut(ip)` → вернуть {locked, lockRemainingMs}.
    - `recordSuccessfulLogin(ip)` → сбросить failCount.
    - Авто-очистка entries старше 30 минут (lru на 10k entries).
  - Изменить `/api/auth/session` (GET) → вернуть profile users/me формат (`{ok, me: { userId, username, employeeId?, role: { name, pages, isSystem }, permissions } }`).
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-8, AC-10
- **Test Requirements**:
  - `rule` TR-2.1: 3 failed login подряд → 4й isLockedOut.locked=true, lockRemainingMs ≈ 60s. Через setTimeout 60001+ → isLockedOut=false.
  - `rule` TR-2.2: session payload = user 'Закупки' pages {orders:true,users:false} → requirePageAccess('orders') пропускает; requirePageAccess('users') возвращает 403; full access Administrator пропускает всё.
  - `rule` TR-2.3: старый requireAdminAccess не ломает route orders (delegate works).
- **Notes**: page aliases: 'requests' = 'Заявки', 'settings' = 'Настройки/доступ'.

## Task 3: Сервер — REST routes /api/users и /api/roles
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**:
  - Создать `server/routes/userRoutes.js`:
    - `GET /users` → `[]` с объектами: `{_id, username, employeeId, employeeName, roleId, roleName, isSystem, permissions:{8 flags count}, createdAt}`.
    - `POST /users` → create; валидация username 3-40 regexp ^[A-Za-z0-9._-]+$; unique; require roleId или {role:'full-access'}. Пароль min 4 → hashPassword. Если employeeId → check employeeStore exists.
    - `PATCH /users/:id` → update. username Administrator нельзя менять. Пароли — только если оба password/passwordConfirm заполнены и совпадают. isSystem=true → forbid смену role на не-full-access.
    - `DELETE /users/:id` → Administrator 409 «Невозможно удалить системного пользователя». Остальных удаляем.
    - `GET /users/me` → текущий.
    - Все endpoints защищены requirePageAccess('users'), кроме me (manager+).
  - Создать `server/routes/permissionRoleRoutes.js`:
    - `GET /roles` → [] с `{_id, name, isSystem, pagesCount:{sum}, usersCount:{count users where roleId=this}}`.
    - `POST /roles` → create name 3-50 unique, pages:{obj}.
    - `PATCH /roles/:id` → update (system role edit запретить частично? разрешить только display name → нет, запретить полностью для isSystem=true, return 409).
    - `DELETE /roles/:id` → если has users (count>0) → 409 «У роли 5 пользователей…». Иначе удалить.
    - Все requirePageAccess('users').
  - Подключить в `server.js` routes: `userRoutes` под `/api`, `permissionRoleRoutes` под `/api`.
  - Изменить `POST /api/auth/login` в `authRoutes.js`: теперь принимает только `{username, password}`. Поддержка `{role,password}` → вернуть 400 «Схема входа обновлена — используйте Имя пользователя». Обернуть в try/catch с lockout. После успеха — возвращаем session token.
  - Пометить `PUT /api/auth/passwords` → deprecated, теперь возвращает 501 («Используйте раздел Пользователи для смены паролей»).
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-7, AC-8, AC-9, AC-12
- **Test Requirements**:
  - `rule` TR-3.1: старый `POST /auth/login {role:'admin', password}` → 400. Новый `{username:'Administrator', password}` → 200 + sessionToken.
  - `rule` TR-3.2: `DELETE /roles/:id` где role имеет 1 user → 409. После переназначения user в другую роль → delete 204.
  - `rule` TR-3.3: `DELETE /users/<admin>` → 409. Создать нового пользователя → delete 204.
- **Notes**: `usersCount` считаем join in-memory (строки 100–1000 допустимо), без SQL.

## Task 4: UI — Home.js Login форма (username + password) + lockout countdown
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **Description**:
  - В `client/src/Home.js` удалить старую 1 карточку admin access с одним полем пароля. Вместо неё — карточка входа 2 поля username/password.
  - Добавить компонент `password field` как sub-component — input + 👁 справа (inline button в form-group как extension).
  - Form state: `loginForm = { username: '', password: '' }`. After 3 failed → get 423 response → сохранить `lockUntilDate = Date.now() + lockSecondsRemaining*1000`, показать «Слишком много попыток. Повторите через:» + countdown компонент (setInterval 1s).
  - Первичная настройка (needsInitialSetup=true) — оставить карточку bootstrap но теперь это «Создать администратора» с полями username (readonly=Administrator), пароль, подтвердите. После submit → POST /api/auth/setup теперь создаёт user Administrator, потом login автоматом.
  - В `client/src/appAuth.js` расширить setAppAuthSession чтобы сохранял не только sessionToken/role но и me-объект? Нет, только sessionToken, role из payload можно не использовать. Добавить helper `getAppAuthMe()` — через GET /api/users/me (memoized).
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-10
- **Test Requirements**:
  - `rule` TR-4.1: DOM имеет 2 input с name=username, name=password. Есть toggle visibility button.
  - `rule` TR-4.2: 3 failed login → 423 lockSecondsRemaining=60 → компонент показывает "59" через 1s, "0" через 60s, после снова форма активна.
  - `rubric` TR-4.3: UI консистентность (AC-11 часть); scale 1-5; threshold>=4; evidence visual diff с EmployeeModal form-group.
- **Notes**: при перезагрузке страницы countdown state не теряется → хранить lockUntilDate в localStorage key `kaznadzei.login-lock`, если он > Date.now() → продолжать счётчик.

## Task 5: UI — UsersPage.js 2 вкладки (Пользователи + Права доступа) + роут + меню App.js
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - Создать `client/src/UsersPage.js`.
    - `activeTab = 'users' | 'roles'`, использует `<div className="tabs"><button className="tab tab-active"` как в SettingsHeader.
    - Sub-tab «Пользователи»:
      - SectionHeader title "👥 Пользователи" description, actions [<Button btn-success «Добавить пользователя»>].
      - Table desktop с 5 колонками (username · сотрудник · права · действия). Administrator — строка имеет badge «Полные права» и disabled🗑.
      - Mobile mobile-settings-card карточки как employees tab.
      - Combobox сотрудников: при маунте GET /api/employees, memo filter by ФИО query, dropdown open, click select.
    - Sub-tab «Права доступа»:
      - SectionHeader title "🔑 Права доступа", actions [<Button btn-success «Добавить»>].
      - Table: Название · Кол-во страниц · Кол-во пользователей · Действия (✎/🗑). Для «Полные права» disable кнопка удаления и редактирования (view only badge "Системная").
      - Modal добавления role: поле name + dropdown с multi-checkbox (страницы 8). Dropdown header показывает "5/8", внутри поисковая строка.
  - В `client/src/App.js`:
    - Route: `<Route path='/users' element={<ProtectedRoute requiredPage='users'><UsersPage /></ProtectedRoute>} />`.
    - Защищённый route требует permission page='users' (изменить ProtectedRoute — добавить проп requiredPage в дополнение к requiredRole).
    - В бургерное меню nav между «Этапы производства» и «Настройки» добавить `<Link to="/users">🔐 Пользователи</Link>`. Только если canAccessPage('users').
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-5, AC-7, AC-11
- **Test Requirements**:
  - `rule` TR-5.1: /users рендерит 2 вкладки, таб Пользователи по умолчанию.
  - `rule` TR-5.2: навиг. ссылка UsersPage присутствует только при role.users===true или fullAccess; при role.users===false скрыта.
  - `rubric` TR-5.3: Единый стиль таблицы как employees в Admin.js (desktop + mobile). Threshold >=4; evidence screenshot.
- **Notes**: ConfirmDialog переиспользовать (уже import ConfirmDialog из './ConfirmDialog') для delete user/role.

## Task 6: UI — UserModal, RoleModal, PasswordGeneratorModal, PasswordField.
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - Создать `client/src/PasswordField.js` reusable input:
    - Props: value, onChange, placeholder, disabled, allowGenerate, allowCopy, toggleTypeButton (eye) → toggles input type=text/password.
    - Если allowGenerate → 🎲 кнопка, открывает PasswordGeneratorModal → после ОК set both password+confirm (через onAcceptGenerate(pw)).
    - Если allowCopy → 📋 кнопка, копирует value, toast (settings-alert-success на 3с).
  - Создать `client/src/admin/UserModal.js`:
    - 5 полей: username, role (radio-list в scrollable box), password PasswordField, confirm password (plain confirm или password w/o generate), employee combobox searchable.
    - Edit mode: username readonly=isSystem, password пустой, label «Чтобы сменить пароль заполните оба поля». Role — если system → radio buttons disabled и full access preselected.
  - Создать `client/src/admin/RoleModal.js`:
    - Поле name (текст), Dropdown multi-checkbox 8 страниц.
    - Dropdown:
      - Trigger button "Отмечено: 5/8 ▾"
      - Popover panel: input search над списком, scrollable list, каждый checkbox строка с label страницы.
      - При клике вне → закрыть.
  - Создать `client/src/PasswordGeneratorModal.js`:
    - Length (number min4 max64 default 12). Чекбоксы: Spec/Digits/Register (все default on).
    - Кнопка «🎲 Сгенерировать», полоса результата readonly + 📋.
    - Кнопки «ОК (использовать)» / «Отмена».
  - Внедрить: UsersPage вызывает эти модалки через state (openUserMode: create|edit, openRoleMode, openGen).
- **Acceptance Criteria Addressed**: AC-5, AC-6, AC-7, AC-11
- **Test Requirements**:
  - `rule` TR-6.1: Generate 5 паролей по очереди → все соответствуют длине 12 + хотя бы один uppercase + digit + lowercase + spec при всех включенных, при выключенных digits → 0 цифр в pw.
  - `rule` TR-6.2: RoleModal pages dropdown — отмечено 3 → trigger показывает "3/8".
  - `rule` TR-6.3: UserModal password & confirm не совпадают → submit disabled или validation error red text под формой.
  - `rubric` TR-6.4: Консистентность с EmployeeModal (отступы, шрифты, кнопки). Threshold >=4; evidence.
- **Notes**: генерация pw на клиенте через `crypto.getRandomValues` если доступен, иначе `Math.random` fallback.

## Task 7: Settings → Доступ — удалить пароль admin, обновить описание
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 3
- **Description**:
  - Удалить в `client/src/AdminTokenControls.js` form-group с «Пароль администратора», кнопку «Сохранить пароль» и весь related state (`form.adminPassword`, handleSave).
  - Оставить: PIN, статус PIN, кнопки Журнал, Экспорт/Импорт.
  - Обновить panel-soft title и текст. Добавить info line «Пароли администратора и других пользователей теперь управляются в разделе **🔐 Пользователи**» → вставить ссылку Link на `/users` (или кнопку если внутри компонента нет router → useNavigate + кнопка).
  - Server-side: `PUT /api/auth/passwords` → возвращает 501 с указанием `/api/users`.
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-7.1: grep rendered DOM → отсутствует input с placeholder «Введите новый пароль администратора».
  - `rule` TR-7.2: запрос PUT /api/auth/passwords → status 501.
- **Notes**: не удалять settingsPinHash и check status PIN в компоненте.

## Task 8: Регрессии — сборка, lint, node-smoke всех routes
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1-7 (все)
- **Description**:
  - Запустить `cd client && npm run build → Compiled successfully`.
  - Запустить `GetDiagnostics`.
  - Smoke: `node -e require('./server/routes/authRoutes')`, `require('./server/routes/userRoutes')`, `require('./server/routes/permissionRoleRoutes')`, `require('./server/routes/orderRoutes')`, `require('./server/routes/employeeRoutes')`, `require('./server/routes/telegramRoutes')` — exit 0 без circular require ошибок.
  - Smoke 3 login calls → verify lockout 60s; manual assert.
  - Проверить, что маршрут `/settings` работает и старые вклейки Settings → Сотрудники, Этапы производства открываются.
  - Проверить, что Telegram-webhook routes telegram/telegram-supply не затронуты lockout.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10
- **Test Requirements**:
  - `rule` TR-8.1: build success, diagnostics === []
  - `rule` TR-8.2: все require routes success (exit 0)
  - `rubric` TR-8.3: регрессий нет (старая админка + orders + telegram work); scale 1-5, threshold >=4. Evidence: manual screen actions list.
- **Notes**: если TR-8.3 3 или ниже → создать issue и исправить до review.

## Task 9: Предложения по улучшению пользователя (запрос в конце сообщения)
- **Status**: `pending`
- **Priority**: low
- **Depends On**: None
- **Description**:
  - Собрать в spec секцию «Предложения по улучшению» после approval.
  - Пункты (вне скоупа, опционально):
    - U1: Аудит действий пользователей (login, failed login, delete user, create user, change role) — в activity log.
    - U2: Поле «Активен / Заблокирован» у пользователя с датой разблокировки.
    - U3: Ограничение «только один session per user» (invalidate old tokens при смене пароля / нового login).
    - U4: Индикатор прочности пароля (оценка weak/medium/strong) рядом с PasswordField.
    - U5: Срок действия пароля 90 дней (принудительная смена при входе).
    - U6: Импорт/экспорт CSV пользователей и ролей.
- **Acceptance Criteria Addressed**: AC-10 (совет к качеству AC-11)
- **Test Requirements**: `n/a` (advisory).
- **Notes**: показать пользователю список после App+ approval.
