# Tasks — Цвета этапов, вкладки Настроек и Управление этапами (strict ownership)

## Task 1: Fix color mismatch settings swatches → secondaryHeaders → cell backgrounds (AC-A1, AC-A2, AC-A3, AC-A4)

**Status: pending**

**Depends on:** (none)

**Scope files:**
*   `client/src/orderStageLegend.js` (L1-269)
*   `server/config/orderStageLegendConfig.js`
*   `client/src/OrdersWorkspace.js` (resolveManualMarkColors + getSecondaryHeaderBackground + column cell bg application packages / preAssembly / paint / delivery duration cells)
*   `client/src/Archive.js` — mirror fixes if any

**Implementation notes:**

1.  **Server `orderStageLegendConfig.js` post-pass:** Audit FORCE override labels (Расписан + approved hex swap, preAssembly insert textHex, delivery & ready black text).
2.  **Client `orderStageLegend.js`:** Match server postpass exactly, so client legend `defaultHex` for `approved`=A8D7B6, `Расписан` drafting=9BC5A7.
3.  **`getSecondaryHeaderBackground` (OrdersWorkspace L around 2020):** use `secondaryHeader.defaultHex || secondaryHeader.hex` as cell background always for non-manual stage cells. Ensure never falls back to other color sources.
4.  **`resolveManualMarkColors`:** ensure uses `stage?.hex ?? stage?.defaultHex` → same hex from settings legend entry NOT stale `stage.hex` only.
5.  **Verify columns:** name (approved), orderCard, package, notes, preAssembly, deliveryDate, carpenter, material, paint, itemStart, itemEnd, itemDuration, duration → all 15 manual-mappable columns apply manual mark override bg first when mark exists, with correct hex color.
6.  Addressed earlier: cell colors purple `#B4B1FF bright` (client override) replaced by settings-based default.

**Test requirements (TRs):**
*   **rule TR1-color-hex-match:** After normalize, client/server `buildOrderStageLegendConfig()` secondaryHeaders[n].defaultHex == exact hex settings legend swatch for matching label for all 18 cells.
*   **rule TR2-secondaryBgMatchesHeader:** OrdersWorkspace cells in columns: Комплектация заказа (Укомплектован = kitting), Набирается заготовка, Сборка после покраски, Контроль качества, Доставка/Монтаж, Заказ готов → bg of data cells matches header defaultHex exactly (same #RGB) when there's NO manual mark overriding.
*   **rule TR3-manual-cell-color-legendKey:** Manually marked cell (legendKey='postpaint' via itemStartDate column) → color resolves postpaint defaultHex, same as secondaryHeader 'Сборка после покраски' color.
*   **rubric TR4-color fidelity:** Visual match between settings swatch preview (background) and data cell bg = pixel-identical on a screenshot side-by-side. 0–2 scale (score >= 2 pass).

---

## Task 2: Split "Общие параметры" into 3 tabs — Обновления / Телеграм бот / Доступ (AC-B1, AC-B2, AC-B3, AC-B4)

**Status: pending**

**Depends on:** Task 1 (optional, independent parallel).

**Scope files:**
*   `client/src/adminUI.js` — keep buildSettingsTabs outer, add helper buildGeneralSubTabs if needed OR keep local state subTabs in Admin.
*   `client/src/Admin.js` activeRole=general section L1897-2137.

**Implementation:**

1.  **State for subTab `generalSubTab`:** useState `updates` default; handleGeneralSubTabChange; keep URL consistent query param `sub=updates|bot|access`.
2.  **Nav tabs UI:** Use pattern similar to outer tabs (a row of pill buttons under SettingsHeader inside the Общие card).
    ```
    [ 🔄 Обновления | 🤖 Телеграм бот | 🔑 Доступ ]
    ```
3.  **sub=updates:** ONLY UpdatesOverview block + its saveUpdateSettings button.
4.  **sub=bot:** ONLY card with publicBaseUrl, telegramBotToken, supergroup, bridge switch, buttons (Save settings, Check bot, set webhook, Обновить кнопки ТГ, Logs ТГ), telegramCheckResult panel. DO NOT include export/import backup data here.
5.  **sub=access:** Place:
    a. PIN verification / settings (if needed after entry point, keep earlier existing flow otherwise show AdminTokenControls, button Журнал действий modal open. Export / Import data backup actions here as admin operations access control).
6.  Keep outer SettingsHeader same: `Настройки — Общие параметры`. SubTabs render INSIDE the main card below SettingsFeedback.

**Test requirements (TRs):**
*   **rule TR1-subtab-routing:** Admin.js `/settings?tab=general&sub=bot` opens tab "Телеграм бот" directly.
*   **rule TR2-updates-clean:** sub=updates renders UpdatesOverview, NO baseUrl/token inputs visible here.
*   **rule TR3-bot-incl-telegramCheckResult:** sub=bot shows check bot result panel after verification.
*   **rule TR4-access-has-tokenctrl:** sub=access includes AdminTokenControls + Log activity buttons.
*   **rubric TR5-layout:** Subtab switching instant no page reload, no visible page flicker. Score >=2 (no visual glitches).

---

## Task 3: Global Stage Ownership Strict Switch UI + Store + Server Enforce Cancel Rule

**Status: pending**

**Depends on:** Task 3.1 (server store) → Task 3.2 (UI button/modal) → Task 3.3 (enforce cancel reject server side).

**SubTasks split:**
*   3.1 **SettingsStore add global bool `strictStageOwnershipEnabled`** (default false). Routes /settings/ read/write.
*   3.2 **Admin.js → Сотрудники section:** render new button before Уведомления в ТГ → modal small with switch.
*   3.3 **OrderStore.setManualStageMarks CANCEL enforcement + routes return 400 error text.**
*   3.4 **Client OrderDetail cancel button toasts server error to user.**

**Scope:**
*   `server/stores/settingsStore.js` + server settings routes (settingsRoutes.js getSettings)
*   `server/stores/orderStore.js` setManualStageMarks (cancel branch)
*   `server/routes/orderRoutes.js` telegram-stage-mark POST return 400 error.
*   `client/src/Admin.js` Сотрудники activeRole=employees section L2142-2160 → SettingsActions new button + modal.

**Implementation notes:**

### 3.1 SettingsStore.
Introduce `strictStageOwnershipEnabled: boolean`. Normalize to default false if missing. Ensure settingsRoutes exposes save that includes new flag via SettingsStore.replace.

### 3.2 Modal StageOwnershipModal (local inline in Admin.js, size=sm).
- Before button `<button className="btn" onClick={openTelegramNotificationModal}>Уведомления в ТГ</button>` → add new `<button className="btn" onClick={openStageOwnershipModal}>⚙️ Управление этапами</button>`.
- Modal content:
  - ModalHeader: title="Управление этапами", subtitle="Кто может отменять этапы: OFF — любой сотрудник с доступом. ON — только принявший."
  - label settings-switch title=Управление этапами, subtitle strict ON/OFF description.
  - modalActions Button success Сохранить, Cancel Button.
- On save: `apiFetch PATCH /api/settings with appSettings.strictStageOwnershipEnabled= draftStrictState`.

### 3.3 OrderStore enforce cancel.
OrderStore.setManualStageMarks cancel flow (when action = deleting an existing mark):
Before write:
```
if Settings.strictStageOwnershipEnabled === true:
   For item markEntry with existingMark present AND we cancel (legendKey empty):
   actorId = current markUpdates[i].actorId/updatedBy passed through function arg.
   String(existingMark.updatedBy).trim() length > 0 && String(existingMark.updatedBy) !== String(actorId) → SKIP + collect error message. Skip cancel persist! Do not write.
```
Return errors array with clear messages about which cancel(s) failed and who owner is (fullName resolve via EmployeeStore.findById(existingMark.updatedBy)?.fullName ?? existingMark.updatedBy).

### 3.4 Routes OrderDetail toast show error user toaster `Не удалось отменить этап: «Сборка после покраски» — только исполнитель может отменить (ФИО).`.

**Test requirements (TRs):**
*   **rule TR1-default-false:** No config strictStageOwnershipEnabled=false; enforce off, cancel works regardless of actor. (Default behaviour preserved.)
*   **rule TR2-strict-ON-non-owner-cancel-fails:** strict=true; employee_2 CANNOT cancel mark actor=employee_1. Returns error string including message "только тот".
*   **rule TR3-strict-ON-owner-can-cancel:** actorId === owner updatedBy → cancel works OK.
*   **rule TR4-button-order-in-settings-employees:** DOM order (left to right, SettingsActions row): 1. button Добавить сотрудника, then 2. Управление этапами, 3. Уведомления в ТГ (as user requested "ПЕРЕД кнопкой Уведомления в ТГ → Управление этапами button before).
*   **rule TR5-modal-small-size:** Stage ownership modal size=sm, switch inside; submit saves settings.
*   **rubric TR6-error-message-quality:** Error toast message readable, includes stage label, owner full name. Score 0-2. Pass >= 2.
