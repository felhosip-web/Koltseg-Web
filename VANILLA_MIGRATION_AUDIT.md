# VANILLA → REACT / ZUSTAND MIGRATION — P0 ARCHITECTURE AUDIT

## Current Architecture

```
Vanilla Managers & Store (js/store.js, js/oop-core.js)
  │
  ├──► IndexedDB (Database in js/oop-core.js)
  │
  └──► Vanilla → React Bridge (App.prototype.updateReactStore in js/app.js)
         │
         ▼
       React Zustand Store (src/store/useAppStore.js)
         │
         ▼
       React UI (src/components/*, MainTable, Dashboard, Stats, etc.)
```

Target Architecture:
```
React UI (src/components/*)
  │
  ▼
Zustand — SINGLE UI STATE OWNER (src/store/useAppStore.js)
  │
  ▼
Services / Repository Layer (js/oop-core.js domain services)
  │
  ├──► IndexedDB (Database)
  │
  └──► SyncService (js/sync-service.js) ──► Supabase
```

---

## State Ownership Analysis

1. **Dual Store Architecture**:
   - `js/store.js`: Vanilla JS Zustand store (`createStore` from `./libs/zustand.js`). Stores `items`, `months`, `entries`, `templates`, `reminders`, `incomings`, `senders`, `works`.
   - `src/store/useAppStore.js`: React Zustand store (`create` from `zustand`). Stores snapshot data for React components (`entries`, `items`, `months`, `incomings`, `reminders`, `works`, `eurRate`, `isLoaded`, `activeTab`).
2. **Managers & Getters/Setters**:
   - `ItemManager`, `MonthManager`, `EntryManager`, `WorkLogManager` implement JS getters and setters bound directly to `js/store.js` (`useAppStore.getState()` / `useAppStore.setState()`).
   - `TemplateManager`, `ReminderManager`, `IncomingManager` store state directly in instance properties (`this.templates`, `this.reminders`, `this.incomings`).
3. **Vanilla → React Bridge**:
   - `App.prototype.updateReactStore()` in `js/app.js` reads snapshot via `getAppSnapshot()` and calls `useReactAppStore.getState().setSnapshot(snapshot)`.
   - `StoreSync.jsx` mounts once at app root and initializes React store state from `getAppSnapshot()` on boot.

---

## Dependency Mapping (A–H)

- **A) UI Rendering Only**:
  - `src/components/table/MainTable.jsx`
  - `src/components/dashboard/DashboardTab.jsx`
  - `src/components/stats/StatsTab.jsx`
  - `src/components/charts/ChartsTab.jsx`
  - `src/components/time-tracker/TimeTrackerTab.jsx`
  - `src/CostAppLayout.jsx`, `src/CostAppShell.jsx`, `src/CostAppTabs.jsx`, `src/CostAppFooter.jsx`

- **B) Domain & Data Logic**:
  - `ItemManager`, `MonthManager`, `EntryManager`, `TemplateManager`, `ReminderManager`, `IncomingManager` (`js/oop-core.js`)
  - `WorkLogManager` (`js/work-log.js`)
  - `TimeTrackerModule` (`js/modules/time-tracker/time-tracker.js`)
  - `ConfigManager`, `SecurityGuard`, `DatabaseAudit`

- **C) IndexedDB Repository Layer**:
  - `Database` class in `js/oop-core.js` (`getAll`, `save`, `delete`, `deleteItemWithEntries`, `getByCellKey`)
  - Migration logic (`_handleUpgrade` - v11 UUID migration, v12 plugin tables)
  - `deleted_records` tombstone storage

- **D) Sync Logic**:
  - `SyncService` (`js/sync-service.js`): PULL -> MERGE -> LOCAL SAVE -> QUEUE RECONCILE -> PUSH
  - `SyncManager` (`js/sync-manager.js`): Diff computation (`getSyncDiff`)
  - `CloudSync` (`js/oop-core.js`): Supabase API wrapper
  - `DataSyncController` (`js/data-sync-controller.js`): UI orchestration & modal triggers
  - `SyncReport` (`js/sync-report.js`): Diagnostic reporting

- **E) Legacy Vanilla UI Only**:
  - `js/ui-controller.js` (DOM event bindings, legacy table rendering, tabStateMachine)
  - `js/ui-modal-controller.js`, `js/ai-modal-controller.js`, `js/input-modal-controller.js`, `js/cell-modal-controller.js`
  - `js/sync-diff-view.js`
  - `WorkLogRenderer` (`js/work-log.js`), `RemindersRenderer` (`js/oop-reminders.js`)

- **F) Components Calling `window.app` Directly**:
  - `MainTable.jsx`, `CostAppHeader.jsx`, `WorkAppHeader.jsx`, `CostAppFooter.jsx`, `LandingApp.jsx`, `SettingsPanel.jsx`, `CellEditorModal.jsx`, `WorkEditorModal.jsx`, `HmiInputModal.jsx`, `IncomingTab.jsx`, `RemindersTab.jsx`, `StoreSync.jsx`

- **G) Elements Listening to `app-data-updated`**:
  - React: `CostAppFooter.jsx`, `WorkAppList.jsx`, `DashboardTab.jsx`
  - Vanilla: `js/app.js`, `js/boot-manager.js`, `js/input-modal-controller.js`, `js/work-log.js`, `js/ui-controller.js`

- **H) Callers of Manager `.load() / .add() / .update() / .delete()`**:
  - Boot/App: `boot-manager.js`, `app.js` (`reload()`, `clearAllData()`, `generateTestData()`)
  - Sync: `sync-service.js` (reloads managers after merge save)
  - UI Controllers: `input-modal-controller.js`, `ui-controller.js`, `work-log.js`
  - React UI: `RemindersTab.jsx`, `MainTable.jsx`

---

## Phased Migration Plan

### PHASE 0 — Audit & Baseline
- **Scope**: Architecture map, state analysis, test suite baseline verification.
- **Affected Files**: None (documentation audit).
- **PR**: #151 (Merged).

### PHASE 1 — React/Zustand as Single UI State Owner
- **Scope**: Normalize React UI components to read reactively from `src/store/useAppStore.js` rather than direct `window.app.<manager>` properties or custom `subscribeAppData` event listeners.
- **Affected Files**: `src/store/useAppStore.js`, `src/components/incoming/IncomingTab.jsx`, `src/components/reminders/RemindersTab.jsx`.
- **Pre-requisites**: Ensure all entity collections exist in `useAppStore`.
- **Items to Keep**: `App.prototype.updateReactStore()` snapshot bridge, manager write methods.
- **Items to Remove**: Local duplicated component state and custom `window.app.subscribeAppData` listeners in tab components.
- **Regression Tests**: `npm test` & Playwright E2E UI verification for Incoming and Reminders tabs.
- **PR Boundary**: PR 1 (React State Normalization & Store Subscription Removal).

### PHASE 2 — Refactor Managers to Service/Repository Role
- **Scope**: Decouple domain managers from Vanilla Zustand store (`js/store.js`). Make managers pure data services interacting with IndexedDB and `SyncService`, pushing updates to `src/store/useAppStore.js`.
- **Affected Files**: `js/oop-core.js`, `js/work-log.js`, `js/oop-reminders.js`, `js/store.js`, `js/app.js`.
- **Pre-requisites**: Phase 1 completed.
- **Items to Keep**: All IndexedDB operations, `SyncService` queueing, UUID generation, schema validation, recurring reminder auto-generation.
- **Items to Remove**: Property getters/setters in managers referencing `js/store.js`; `syncTableToIndexedDB` store auto-save listeners.
- **Regression Tests**: Manager unit tests for `load()`, `add()`, `update()`, `delete()`, and IndexedDB persistence tests.
- **PR Boundary**: PR 2 (Domain Services & Repository Decoupling).

### PHASE 3 — Elimination of "app-data-updated" Event
- **Scope**: Replace `window.dispatchEvent('app-data-updated')` dispatches and listeners with Zustand store selector reactivity.
- **Affected Files**: `js/app.js`, `js/input-modal-controller.js`, `js/work-log.js`, `js/ui-controller.js`, `src/WorkAppList.jsx`, `src/components/dashboard/DashboardTab.jsx`, `src/CostAppFooter.jsx`.
- **Pre-requisites**: Phase 2 completed.
- **Items to Keep**: UI custom modal visibility events if applicable.
- **Items to Remove**: All `app-data-updated` event dispatches and listeners.
- **Regression Tests**: Footer sync status reactivity, dashboard total recalculation on data change.
- **PR Boundary**: PR 3 (Event-Driven Reactive State Clean-up).

### PHASE 4 — Elimination of "window.app" Calls in React Components
- **Scope**: Wrap CRUD, sync, backup, export, and modal actions in React action hooks/services, eliminating direct `window.app.*` calls in JSX.
- **Affected Files**: `src/components/*`, `src/CostAppHeader.jsx`, `src/WorkAppHeader.jsx`, `src/SettingsPanel.jsx`, `src/CostAppFooter.jsx`.
- **Pre-requisites**: Phase 3 completed.
- **Items to Keep**: `window.app` global instance for devtools debugging only.
- **Items to Remove**: All `window.app?.uiController?...` and `window.app?.hmiNotif?...` calls inside JSX files.
- **Regression Tests**: Full Playwright E2E UI suite covering header actions, table clicks, modal forms, and settings.
- **PR Boundary**: PR 4 (React Action Layer & Removal of `window.app` in React UI).

### PHASE 5 — Deprecation of "refreshAllTabs()" and Legacy Renderers
- **Scope**: Remove legacy DOM rendering methods, `refreshAllTabs()`, `tabStateMachine`, and vanilla HTML string generators.
- **Affected Files**: `js/app.js`, `js/ui-controller.js`, `js/work-log.js`, `js/oop-reminders.js`, `js/sync-diff-view.js`.
- **Pre-requisites**: Phase 4 completed.
- **Items to Keep**: Backend sync service methods.
- **Items to Remove**: `refreshAllTabs()`, `tabStateMachine`, `WorkLogRenderer` DOM methods, `RemindersRenderer` DOM methods.
- **Regression Tests**: Cross-tab navigation and multi-tab state sync tests.
- **PR Boundary**: PR 5 (Legacy Renderers Deprecation).

### PHASE 6 — Purge of Unused Vanilla Infrastructure
- **Scope**: Delete legacy Vanilla Zustand store, unused legacy modal controllers, and clean up residual DOM elements.
- **Affected Files**: `js/store.js`, `js/input-modal-controller.js`, `js/cell-modal-controller.js`, `js/ai-modal-controller.js`, `js/sync-diff-view.js`.
- **Pre-requisites**: Phase 5 completed.
- **Items to Keep**: `js/oop-core.js`, `js/sync-service.js`, `js/sync-manager.js`, `js/sync-report.js`, `js/uuid-utils.js`, `js/log-manager.js`, `js/security-guard.js`, `js/pwa-manager.js`.
- **Items to Delete**: `js/store.js`, legacy modal controllers, legacy vanilla renderers.
- **Regression Tests**: Full project build (`npm run build`), `npm test`, and Playwright E2E verification.
- **PR Boundary**: PR 6 (Unused Legacy Code Purge).

---

## Files Likely Removable Eventually

1. `js/store.js`
2. `js/libs/zustand.js` (if unused outside `js/store.js`)
3. `js/input-modal-controller.js`
4. `js/cell-modal-controller.js`
5. `js/ai-modal-controller.js`
6. `js/sync-diff-view.js`

---

## Regression Risks

1. **Sync Pipeline Disruption**: Breaking checkpoint advancement (`localStorage.setItem('hmi_lastSyncTime')`), execution ordering, or tombstone processing.
2. **Double State Updates**: Causing double re-renders or state desynchronization between Zustand and IndexedDB.
3. **Modal Re-render Loops**: Modal flickering due to double event listener bindings during hybrid transition.
4. **Data Loss on Clear/Purge**: Misidentifying empty local state as missing cloud records during merge save.

---

## FIRST MIGRATION PR

### Goal:
Migrate `IncomingTab.jsx` and `RemindersTab.jsx` state reading from direct `window.app` property reads and custom event subscriptions to reactive Zustand store subscriptions (`src/store/useAppStore.js`).

### Files:
- `src/store/useAppStore.js`
- `src/components/incoming/IncomingTab.jsx`
- `src/components/reminders/RemindersTab.jsx`

### Remove:
- Direct reads of `window.app.incomingManager.incomings` and `window.app.reminderManager.reminders` in `useState` initializers.
- Custom `subscribeAppData` and `unsubscribeAppData` listener hookups in `IncomingTab.jsx` and `RemindersTab.jsx`.
- Local `useState` data duplication for incomings and reminders inside those components.

### Keep:
- Action handlers calling `window.app.incomingRenderer` and `window.app.remindersApp` for write operations (create, update, delete, complete).
- `App.prototype.updateReactStore()` snapshot bridge in `js/app.js`.
- All vanilla domain managers (`IncomingManager`, `ReminderManager`), IndexedDB `Database`, and `SyncService`.

### Regression tests:
- `npm test` running full test suite (41/41 passing).
- Playwright E2E UI test verifying Incoming and Reminders tab rendering, adding new entries, and reactivity on data change.

### Must NOT change:
- `js/sync-service.js`, `js/sync-manager.js`, `js/data-sync-controller.js`, `js/sync-report.js` or P1.1–P1.4.2 sync execution, checkpointing, or queue logic.
- `src/components/table/MainTable.jsx` or `#150` MainTable React store bridge.
- `window.app`, `updateReactStore()`, or `getAppSnapshot()`.
- Vanilla domain manager write methods or IndexedDB database operations.
- `js/store.js` or Vanilla Zustand auto-save subscriptions.

### Expected result:
`IncomingTab` and `RemindersTab` become pure reactive React components reading directly from React's Zustand store without local state duplication or manual event listener cleanup, while all write operations and sync workflows remain 100% functionally identical.

---

## Final Recommendation

Execute the Vanilla to React migration incrementally starting with PR 1 (`IncomingTab` & `RemindersTab` reactive store subscription). Each phase isolates a single layer of responsibility, ensuring that cloud synchronization (P1.1–P1.4.2) and data persistence remain completely intact throughout the refactoring.
