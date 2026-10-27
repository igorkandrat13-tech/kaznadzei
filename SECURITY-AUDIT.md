# Аудит безопасности и план защиты (Kaznadzei)

- **Дата аудита:** 2026-10-09
- **Статус:** черновик, правки НЕ применены — реализовать позднее
- **Метод:** статический анализ кода (чтение), карта маршрутов + ACL, проверка фронтовых гардов
- **Стек:** Node.js 20 / Express (server.js) + React CRA (client/), page-ACL из 8 ключей
  `orders, requests, archive, customers, employees, stages, users, settings`

Проверяемая гипотеза пользователя: «Снабженец не должен попасть в `/settings`».

---

## 1. Что уже защищено (не трогаем без причины)

- **Page-ACL 8 ключей** и middleware `requirePageAccess` / `requireAnyPageAccess` / `requireAdminAccess` / `requireManagerAccess` — `server/middleware/security.js:L73-L151`.
- Закрыты чувствительные разделы: `GET/PUT /api/settings` (`server/routes/settingsRoutes.js:L9,L13`), backup/import (`server/routes/adminToolsRoutes.js:L60,L87`), telegram-admin (`server/routes/telegramRoutes.js` множество `requireAdminAccess`), updates (`server/routes/updateRoutes.js:L17+`), users/roles/employees.
- **Конкретный сценарий «Снабженец → /settings» — уже закрыт:**
  - фронт: `requiredRole='admin'` и `canAccessRole('admin')` требует settings/users/employees/stages — `client/src/App.js:L401`, `client/src/appAuth.js:L135-L147`;
  - бэк: `GET /api/settings` требует `requireAdminAccess()` (`= requirePageAccess('settings')`).
- Отклоняется небезопасный `ADMIN_TOKEN=change-me`; заголовки `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (`server.js:L19`, `server/middleware/security.js:L161-L166`).
- Lockout на логине (`LoginLockout`), telegram WebApp session валидирует HMAC `initData` через `timingSafeEqual` (`server/routes/telegramRoutes.js:L1333,L1954`).
- `.env` в `.gitignore` и НЕ отслеживается git; `server/uploads/` в `.gitignore`; `ADMIN_TOKEN` на сервере задан.

---

## 2. Найденные уязвимости (по приоритету)

### 🔴 Критично

- [ ] **2.1. `GET /api/orders`, `GET /api/orders/:id` — без аутентификации.**
  Нет ACL, нет глобального `router.use` (нигде в `server/routes/*` не найден).
  `server/routes/orderRoutes.js:L954-L961`, `L963-L971`; монтирование без middleware —
  `server.js:L269-L283`.
  Любой из интернета: `curl https://factory.kaznadzei.by/api/orders` → весь массив заказов
  (заказчики, изделия, комментарии, ссылки на вложения).

- [ ] **2.2. `requireWriteAccess` — заглушка `next()` без проверок** — `server/middleware/security.js:L153-L155`.
  За ним открыты:
  - `POST /api/orders/:id/comments` (любой может писать) — `server/routes/orderRoutes.js:L973`;
  - `DELETE /api/orders/:id/comments/:role` (удалять) — `server/routes/orderRoutes.js:L2766`;
  - `GET /api/orders/:id/items/:itemId/attachments/:attachmentId/file` (скачивание файлов) — `server/routes/orderRoutes.js:L3048`;
  - `GET .../material-request-items/.../attachments/:attachmentId/file` — `server/routes/orderRoutes.js:L2495`;
  - `GET /api/workshop-requests/:id/attachments/:attachmentId/file` — `server/routes/workshopRequestRoutes.js:L49`.

- [ ] **2.3. `/files/*` — публичный static без авторизации** — `server.js:L39-L42`.
  Локально в `files/` только логотип и шаблоны, НО `.gitignore` содержит паттерны рантайм-диагностики
  (`files/kaznadzei-telegram-auth-diagnostics-*.json`) → если такие файлы появятся на бою, отдаются всем без входа.
  **Проверить состав `files/` на сервере 192.168.2.31.**

### 🟠 Высокий

- [ ] **2.4. Клиентские роуты `/order/:id`, `/order/:id/item/:itemId` не обёрнуты в `ProtectedRoute`** —
  `client/src/App.js:L409-L410` (сравни с защищёнными L401-L408). В связке с 2.1 → полная утечка карточек заказов.

- [ ] **2.5. Нет глобальной аутентификации на `/api`** — каждый эндпоинт защищается сам, легко «забыть».
  Примеры открытого чтения: `GET /api/roles` (`server/routes/roleRoutes.js:L9` — дубль с защищённым `permissionRoleRoutes`, порядок монтирования решает по случайности), `GET /api/colors` (`colorRoutes.js:L8`), `GET /api/processSteps` (`processStepRoutes.js:L10`), `GET /api/order-stage-legend-config` (`orderStageLegendRoutes.js:L9`).

- [ ] **2.6. Пароли хранятся как одиночный `sha256(salt:password)`** — `server/services/appAuth.js:L35-L42`.
  Быстрый хеш, уязвим к перебору/GPU. Нет bcrypt/scrypt/argon2, нет итераций.

- [ ] **2.7. Telegram-вебхуки не проверяют `X-Telegram-Bot-Api-Secret-Token`** —
  `server/routes/telegramRoutes.js:L2151` (`/telegram/webhook`), `L2171` (`/telegram/supply/webhook`).
  Кто угодно может послать фейковый `message`/`callback_query` и дёрнуть логику бота.

### 🟡 Средний

- [ ] **2.8. Фронтовый ACL «кластерный»**: `canAccessRole('manager')` = true при любой из
  orders/customers/requests/archive — `client/src/appAuth.js:L121-L134` → пользователь только с «Заказы»
  видит/открывает `/customers`, `/requests`, `/archive` (бэк частично закрывает).
- [ ] **2.9. QR-эндпоинты без ACL** — `server/routes/orderRoutes.js:L3381,L3396` — выдают URL карточек по внутренним id.
- [ ] **2.10. Нет общего rate-limit на `/api`** (только логин) — перебор `attachmentId`, нагрузка.
- [ ] **2.11. `/healthz` отдаёт `memoryRss`/версию** — `server.js:L22-L37` (минимально, лишняя поверхность).

---

## 3. План защиты (этапы)

### Этап A — Hotfix критичного
- [ ] A1. Навесить ACL на `GET /orders`, `GET /orders/:id` → `requireAnyPageAccess(['orders','archive','customers','requests'])` (`orderRoutes.js:L954,L963`).
- [ ] A2. Заменить no-op `requireWriteAccess` на реальную проверку ИЛИ проставить явные `requireAnyPageAccess` на 5 местах из 2.2 (`orderRoutes.js:L973,L2766,L3048,L2495`; `workshopRequestRoutes.js:L49`).
- [ ] A3. Обернуть `/order/:id`, `/order/:id/item/:itemId` в `ProtectedRoute` (`App.js:L409-L410`).
- [ ] A4. Закрыть ACL на чтение: qrcode (`orderRoutes.js:L3381,L3396`), roles (`roleRoutes.js:L9`), colors, processSteps, stage-legend.
- [ ] A5. Проверить состав `files/` на бою; вынести рантайм-диагностику из публичного static или закрыть `/files` авторизацией.

### Этап B — Системный слой (устраняет класс проблемы)
- [ ] B1. Единый `app.use('/api', authenticate)` — парсит session/ADMIN_TOKEN в `req.auth`; публичные эндпоинты (`/auth/login|setup|config`, `/healthz`, вебхуки, telegram-app) — через явный allow-list. Тогда «забыл ACL» не даёт полного доступа.
- [ ] B2. Ввести `requirePermission(page, action)` + таблицу «endpoint → permission».
- [ ] B3. Автотесты-матрица (supertest): для каждой роли ожидаемые 200/403 по каждому эндпоинту — регресс-защита.
- [ ] B4. Фронт: заменить `canAccessRole('manager'/'admin')` на `canAccessPage(page)` для каждой страницы (`App.js` + меню).

### Этап C — Пароли и вебхуки (по запросу пользователя — отдельно, позже)
- [ ] C1. Пароли → bcrypt/scrypt/argon2 + ленивая миграция при следующем успешном логине (`appAuth.js:L35-L42`).
- [ ] C2. Telegram-вебхуки: `secret_token` при `setWebhook` + проверка заголовка в обоих webhook-роутах (`telegramRoutes.js:L2151,L2171`).

### Этап D — Прочее
- [ ] D1. Общий rate-limit на `/api` (`express-rate-limit`).
- [ ] D2. Вложения: подписанные короткоживущие ссылки вместо прямого `attachmentId`.
- [ ] D3. Заголовки: CSP, `Permissions-Policy`, HSTS (за reverse-proxy).
- [ ] D4. Убрать `memoryRss`/лишнее из `/healthz` (опционально).

---

## 4. Как проверять (регресс)

- Матрица ролей → эндпоинт (код 200/403) через supertest (Этап B3).
- Ручные smoke-проверки после hotfix:
  - без токена `GET /api/orders` → 401/403 (сейчас 200 — дыра);
  - Снабженец → `/settings` и `GET /api/settings` → 403;
  - без токена `GET .../attachments/:id/file` → 401/403;
  - без токена `POST /api/orders/:id/comments` → 401/403.
- `node --check` по `server/**/*.js`, сборка клиента, `/healthz` = 200.

## 5. Что проверить на боевом сервере (192.168.2.31)

- [ ] Состав каталога `files/` (нет ли диагностик с токенами/идентификаторами).
- [ ] Что `ADMIN_TOKEN` длинный и случайный; `.env` не в git (подтверждено локально).
- [ ] Приложение не торчит напрямую — за reverse-proxy с HTTPS.
- [ ] Проверить, что `server/uploads/order-attachments` НЕ раздаётся статикой.
