# PLG3-P1 Plugin Manager API & Architectural Proposal

## Overview
This document outlines the proposed **PLG3-P1 Plugin Manager API** and lifecycle specification for the Koltseg-Web application. It builds directly upon the validated PLG1 (Plugin Registry/Runtime) and PLG2 (React Plugin Host & UI Integration) foundations merged in `main`.

---

## 1. Existing Host APIs vs. Proposed PLG3-P1 Manager APIs

### A. Existing Host APIs (PLG1 & PLG2 Foundation — Already Implemented)
| Interface / Class | Method / Property | Description |
|---|---|---|
| `PluginRegistry` | `register(manifest, setup)` | Registers a plugin with state `registered`, deep-freezes manifest contract |
| `PluginRegistry` | `initialize(pluginId)` | Executes setup, creates `PluginContext`, transitions to `active` (deduplicates concurrent calls) |
| `PluginRegistry` | `dispose(pluginId)` | Sets state to `disposed`, nullifies `context` and `initPromise` |
| `PluginRegistry` | `unregister(pluginId)` | Disposes plugin and removes record from internal registry `#plugins` Map |
| `PluginRegistry` | `get(pluginId)`, `list()` | Returns deeply frozen immutable DTO snapshots |
| `PluginRegistry` | `getContext(pluginId)` | Returns canonical active `PluginContext` or `null` |
| `PluginRegistry` | `subscribe(listener)` | Subscribes to lifecycle state mutations |
| `PluginUIRegistry` | `registerUI(contract)` | Registers trusted React UI contract (`pluginId`, `title`, `icon`, `component`) |
| `PluginUIRegistry` | `unregisterUI(pluginId)` | Unregisters React UI contract |
| `PluginUIRegistry` | `listUI()`, `usePluginUIList()` | Returns cached frozen UI list snapshot for React components |
| `PluginStorageService` | `createPluginStorage(pluginId)` | Creates scoped storage interface bound to `plugin_id` |
| `PluginRuntime` | `registerPlugin(manifest, setupFn)` | One-step registration & initialization wrapper |
| `PluginRuntime` | `disposePlugin(pluginId)`, `unregisterPlugin(pluginId)` | Facade methods coordinating cleanup across `PluginRegistry` & `PluginUIRegistry` |

### B. Proposed New PLG3-P1 Plugin Manager APIs
The proposed PLG3-P1 Plugin Manager layer provides a clean management facade over existing registry and storage services specifically designed for UI consumption (e.g., in `SettingsPanel`):

#### Proposed `PluginRegistry.prototype.enable(pluginId)` Addition (PLG3-P1 Lifecycle Addition)
In PLG1, `initialize()` explicitly rejects plugins in the `disposed` state, and `registry.get(pluginId)` returns deeply frozen immutable DTO snapshots (`Object.freeze(...)`). Mutating snapshot DTO properties directly (e.g., `dto.state = 'registered'`) throws a `TypeError`.

To enable re-activating a previously disposed plugin, PLG3-P1 proposes adding an explicit method to `PluginRegistry`:
```js
/**
 * Enables a previously disposed plugin by transitioning its internal private record state
 * from 'disposed' to 'registered' and clearing previous errors.
 * @param {string} pluginId
 * @returns {boolean} True if successfully transitioned to 'registered'
 */
enable(pluginId) {
    if (!pluginId || typeof pluginId !== 'string') return false;
    const record = this.#plugins.get(pluginId); // Private Map access
    if (!record) return false;
    if (record.state === 'disposed') {
        record.state = 'registered';
        record.error = null;
        this.#notifyListeners();
        return true;
    }
    return record.state === 'registered' || record.state === 'active';
}
```

#### Proposed `PluginManagerService` Facade
```js
export class PluginManagerService {
    constructor(runtime, uiRegistry) {
        this.runtime = runtime;
        this.registry = runtime.registry;
        this.uiRegistry = uiRegistry;
    }

    /**
     * Retrieves a consolidated summary list of all installed plugins for UI rendering.
     * @returns {Array<PluginSummaryDTO>} List of plugin summaries
     */
    listInstalledPluginsSummary() {
        return this.registry.list().map(record => {
            const uiEntry = this.uiRegistry.getUI(record.manifest.id);
            return Object.freeze({
                id: record.manifest.id,
                name: record.manifest.name,
                version: record.manifest.version,
                apiVersion: record.manifest.apiVersion,
                description: record.manifest.description || '',
                permissions: record.manifest.permissions,
                state: record.state,
                error: record.error,
                hasUI: Boolean(uiEntry && uiEntry.hasUI),
                uiTitle: uiEntry?.title || record.manifest.name,
                uiIcon: uiEntry?.icon || 'fas fa-plug',
                registeredAt: record.registeredAt
            });
        });
    }

    /**
     * Toggles a plugin's runtime state (enabled = true -> enable & initialize; enabled = false -> dispose).
     * @param {string} pluginId
     * @param {boolean} enabled
     * @returns {Promise<boolean>} True if toggle operation succeeded
     */
    async togglePluginState(pluginId, enabled) {
        if (!enabled) {
            return this.runtime.disposePlugin(pluginId);
        }

        const record = this.registry.get(pluginId);
        if (!record) return false;

        if (record.state === 'disposed') {
            // Uses proposed PLG3-P1 PluginRegistry.enable() method to transition
            // internal private record state from 'disposed' to 'registered'
            this.registry.enable(pluginId);
        }

        await this.registry.initialize(pluginId);
        return true;
    }

    /**
     * Calculates storage metrics (total record count) for a specific plugin across collections.
     * Verifies storage readiness (storageService.verifyReadiness()) before querying.
     * @param {string} pluginId
     * @returns {Promise<{ totalRecords: number, collections: Record<string, number>, isLoaded: boolean }>}
     */
    async getPluginStorageMetrics(pluginId) {
        const storageService = this.runtime.storageService;
        const isReady = typeof storageService.verifyReadiness === 'function'
            ? storageService.verifyReadiness()
            : Boolean(storageService.isLoaded);

        if (!isReady) {
            return { totalRecords: 0, collections: {}, isLoaded: false };
        }

        const records = storageService.getAllRecords()
            .filter(r => r.plugin_id === pluginId && !r.deleted_at);

        const collections = {};
        for (const r of records) {
            collections[r.collection] = (collections[r.collection] || 0) + 1;
        }

        return {
            totalRecords: records.length,
            collections,
            isLoaded: true
        };
    }

    /**
     * Explicitly purges all stored JSON data records for a plugin from IndexedDB & Cloud Sync.
     * Verifies storage readiness and catches exceptions gracefully, returning a structured PurgeOutcomeDTO.
     * @param {string} pluginId
     * @returns {Promise<{ success: boolean, localPurgedCount: number, tombstonesCreated: boolean, syncQueued: boolean, errors: string[] }>}
     */
    async purgePluginStorageData(pluginId) {
        const errors = [];
        const storageService = this.runtime.storageService;

        // 1. Verify storage readiness
        const isReady = typeof storageService.verifyReadiness === 'function'
            ? storageService.verifyReadiness()
            : Boolean(storageService.isLoaded);

        if (!isReady) {
            return {
                success: false,
                localPurgedCount: 0,
                tombstonesCreated: false,
                syncQueued: false,
                errors: ['Cannot purge storage: PluginStorageService is not ready or failed to load.']
            };
        }

        const allRecords = storageService.getAllRecords();
        const pluginRecords = allRecords.filter(r => r.plugin_id === pluginId && !r.deleted_at);

        if (pluginRecords.length === 0) {
            return { success: true, localPurgedCount: 0, tombstonesCreated: true, syncQueued: true, errors: [] };
        }

        const scopedStorage = storageService.createPluginStorage(pluginId);
        const collectionNames = Array.from(new Set(pluginRecords.map(r => r.collection)));

        let localPurgedCount = 0;
        for (const colName of collectionNames) {
            try {
                // collection.clear() iterates active collection items and invokes delete(recordKey)
                const colPurged = await scopedStorage.collection(colName).clear();
                localPurgedCount += colPurged;
            } catch (err) {
                errors.push(`Collection "${colName}" clear error: ${err?.message || String(err)}`);
            }
        }

        const syncServiceActive = Boolean(storageService.syncService && !storageService.syncService.isMuted);

        return {
            success: errors.length === 0,
            localPurgedCount,
            tombstonesCreated: true, // Best-effort in Database.prototype.delete
            syncQueued: syncServiceActive,
            errors
        };
    }
}
```

---

## 2. Dispose, Unregister, and Persistent Data Deletion Semantics

| Action | Registry State (`PluginRegistry`) | UI Registry State (`PluginUIRegistry`) | Persisted Storage Data (`plugin_records`) | UI Render Effect (`PluginHost`) |
|---|---|---|---|---|
| **Disable / `dispose(id)`** | Transitions to `disposed`. `context` and `initPromise` are set to `null`. Manifest remains in memory. | Contract remains registered. | **Preserved**. User data in IndexedDB/Cloud is untouched. | Renders "Inaktív bővítmény" card. Tab remains visible in navigation if `hasUI: true`. |
| **Unregister / `unregister(id)`** | Disposed and **removed** from `#plugins` Map. | UI contract removed from `PluginUIRegistry`. | **Preserved**. User data in IndexedDB/Cloud is untouched. | Renders "Ismeretlen bővítmény" card. Tab is removed from tab bar (`CostAppTabs`). |
| **Purge Data / `purgePluginStorageData(id)`** | Unchanged (plugin can be active, registered, or disposed). | Unchanged. | **Deleted**. Local records removed, tombstones written to IndexedDB `deleted_records`, and high-priority cloud deletes enqueued. | Plugin storage collections are emptied (`0` records). |

---

## 3. Storage Purge & Readiness Contract Analysis

Inspection of `PluginStorageService.js` and `js/oop-core.js` clarifies the exact behavior, guarantees, and readiness state requirements for storage purging:

1. **Stale Readiness State Defect & Proposed Fix**:
   - *Current Implementation Inspection*: In `PluginStorageService.js`, `load()` sets `this.isLoaded = true` on success. However, if a subsequent `load()` call fails, the `catch` block resets `this.records = []` without setting `this.isLoaded = false`.
   - *Stale Readiness Risk*: A stale `isLoaded === true` flag from a previous successful load could allow callers to treat an empty `this.records` array as proof of zero stored items when in fact the latest database query failed!
   - *PLG3-P1 Proposed Contract Fix*:
     - `PluginStorageService.prototype.load()` must reset `this.isLoaded = false` in its `catch` block.
     - `PluginStorageService` must expose a `verifyReadiness()` method that confirms both `this.isLoaded === true` and underlying `db` availability before querying `getAllRecords()`.
     - `purgePluginStorageData()` must require `verifyReadiness()` to return `true` before executing or reporting a purge outcome.

2. **Collection `clear()` Return Semantics**:
   `collection.clear()` iterates active in-memory target records and passes each `record_key` to `delete(recordKey)`. It returns the integer count of target items processed (`localPurgedCount`), representing local in-memory/IndexedDB target records rather than transactional proof that every individual tombstone write and cloud-sync queue insertion succeeded without warnings.

3. **`Database.prototype.delete()` Best-Effort Guarantees**:
   In `js/oop-core.js`, `Database.prototype.delete()` attempts to write a tombstone entry to `deleted_records` and enqueue a delete operation in `syncService`. These tracking operations are wrapped inside a `try...catch` block. If saving a tombstone or queueing a delete fails, `Database.prototype.delete()` logs a warning (`[DB] Hiba a törlés naplózásakor:`) and proceeds with `_directDelete()` local IndexedDB removal.
   *Limitation & Guarantee*: Local record removal from IndexedDB is authoritative, whereas tombstone generation and cloud-sync queueing are best-effort operations that catch and log warnings rather than aborting local deletion.

4. **Failure Reporting Requirements**:
   The future PLG3-P1 `PluginManagerService` must implement explicit failure reporting (returning `{ success: boolean, localPurgedCount: number, tombstonesCreated: boolean, syncQueued: boolean, errors: string[] }`) and catch exceptions during collection clearing to prevent unhandled promise rejections.

---

## 4. Registration, Initialization, Failure, Retry, and Removal Behavior

1. **Registration**:
   - `validatePluginManifest(manifest)` ensures all required fields are valid and permissions belong to `KNOWN_PERMISSIONS`.
   - Manifest contract is deeply frozen (`deepFreeze`) to guarantee permission immutability.
   - Record created with `state = 'registered'`, `context = null`, `error = null`.

2. **Initialization**:
   - Checks if plugin exists and is not `disposed`. If already `active`, returns active DTO snapshot immediately.
   - Handles concurrent initialization: simultaneous `initialize(pluginId)` calls return the exact same in-flight Promise instance (`p1 === p2`), executing setup function strictly once.
   - Constructs restricted `PluginContext` via `PluginCapabilityFactory` based on granted permissions.
   - Sets `state = 'initialized'` and executes setup callback (sync or async). On success, sets `state = 'active'`, `context = context`, `error = null`.

3. **Failure & Retry Semantics**:
   - On setup throw or rejection (or synchronous error during context creation), `PluginRegistry` captures the error on `record.error`, sets `state = 'registered'`, and nullifies `context`.
   - `PluginHost` immediately detects `record.state === 'registered' && record.error` and renders the error card without entering automatic re-initialization retry loops.
   - Re-attempting setup requires explicit `initialize(pluginId)` invocation or user action.

4. **Removal Behavior**:
   - Unregistering or disposing a plugin during pending async setup causes `initialize()` to detect `state === 'disposed'` when setup resolves, throwing a disposal error and preventing the removed plugin from ever becoming active or rendering stale UI.

---

## 5. Consumer Integration: How Future Manager UI Will Consume the API

The future **Plugin Manager UI** (to be embedded in `SettingsPanel.jsx`) will consume the API as follows:

```jsx
// Example PluginManagerPanel component sketch (PLG3-P1 UI)
import React, { useState, useEffect } from 'react';

export function PluginManagerPanel({ pluginManager }) {
    const [plugins, setPlugins] = useState([]);

    const refreshList = () => {
        setPlugins(pluginManager.listInstalledPluginsSummary());
    };

    useEffect(() => {
        refreshList();
        const unsub1 = pluginManager.registry.subscribe(refreshList);
        const unsub2 = pluginManager.uiRegistry.subscribe(refreshList);
        return () => { unsub1(); unsub2(); };
    }, [pluginManager]);

    const handleToggle = async (pluginId, currentActive) => {
        await pluginManager.togglePluginState(pluginId, !currentActive);
    };

    const handlePurgeData = async (pluginId) => {
        if (window.confirm(`Biztosan törölni szeretnéd a bővítmény összes elmentett adatát?`)) {
            const res = await pluginManager.purgePluginStorageData(pluginId);
            if (res.success) {
                alert(`${res.localPurgedCount} helyi tétel törölve.`);
            } else {
                alert(`Hiba történt az adatok törlésekor: ${res.errors.join(', ')}`);
            }
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-700">Telepített Bővítmények</h3>
            {plugins.map(p => (
                <div key={p.id} className="p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
                    <div>
                        <div className="font-bold text-xs flex items-center gap-2">
                            <i className={p.uiIcon}></i>
                            <span>{p.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono">v{p.version}</span>
                        </div>
                        <div className="flex gap-1 mt-1">
                            {p.permissions.map(perm => (
                                <span key={perm} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                                    {perm}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePurgeData(p.id)}
                            className="text-xs text-red-500 hover:text-red-700 p-1"
                            title="Adatok törlése">
                            <i className="fas fa-trash-alt"></i>
                        </button>
                        <input
                            type="checkbox"
                            checked={p.state === 'active'}
                            onChange={() => handleToggle(p.id, p.state === 'active')}
                            className="toggle-checkbox"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
```

---

## 6. Transient vs. Persisted Object Boundaries

To guarantee security, sandbox isolation, and serialization safety, a strict boundary separates **transient runtime handles** from **persisted declarative data**:

### A. Strictly Transient (In-Memory Only, Never Persisted)
- **Setup Callback Functions** (`setup(ctx)` function handles)
- **Active `PluginContext` Instances** (`ctx.storage`, `ctx.ui`, `ctx.api`)
- **React Components** (`uiContract.component` references)
- **Pending Initialization Promises** (`record.initPromise`)
- **Internal Maps & Sets** (`#plugins` Map, `#listeners` Set)

### B. Persisted Data (IndexedDB / Cloud Sync / Settings)
- **Manifest Contracts** (Plain JSON DTOs: `id`, `name`, `version`, `apiVersion`, `permissions`, `description`)
- **Scoped User Data Payload Records** (`plugin_records`: `id`, `plugin_id`, `collection`, `record_key`, `data`, timestamps)
- **User Preference Flags** (e.g. `plugin_enabled_<id>` boolean flags stored in `localStorage` or `cloudSettings`)

---

## 7. Lifecycle Resource Cleanup Guarantees & Deferred Teardown Limitations

### A. Current Implementation Cleanup Guarantees
1. **Context Nullification**: When `dispose(pluginId)` or `unregister(pluginId)` is invoked, `record.context` and `record.initPromise` are immediately set to `null` in `PluginRegistry`.
2. **UI Unmounting**: React unmounts plugin components immediately when `PluginHost` detects `state === 'disposed'` or when `PluginUIRegistry` unregisters the UI contract.
3. **Storage Connection Safety**: Scoped plugin storage interfaces (`PluginStorageService`) do not hold open persistent database handles or unmanaged background event listeners.
4. **Subscription Cleanup**: React components (`PluginHost`, `CostAppTabs`) unsubscribe cleanly from `PluginRegistry` and `PluginUIRegistry` upon component unmount.

### B. Re-Checked Resource Allocation & Deferred Limitations
- **Teardown Inspection**: Inspection of current first-party plugin implementations (`samplePlugin.jsx`) confirms that setup functions only perform synchronous context initialization, toast notifications, and scoped storage CRUD operations. React UI components perform standard cleanup via `useEffect` return functions.
- **Background Timers / Global Event Listeners**: Currently, plugin setup callbacks do not allocate long-running background resources (such as `setInterval` timers or `window.addEventListener` bindings).
- **Deferred Limitation**: If future third-party plugins allocate background timers or non-React window event listeners during `setup()`, a formal `teardown(context)` callback interface in plugin manifests can be introduced. For PLG3-P0/PLG3-P1, current first-party plugins do not require a separate teardown contract beyond React unmount cleanup and context nullification.
