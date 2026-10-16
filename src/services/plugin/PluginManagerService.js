// src/services/plugin/PluginManagerService.js
// Host-side Plugin Manager Service Facade (PLG3-P1)

/**
 * Recursively freezes an object and all nested objects/arrays to guarantee deep immutability.
 * @param {Object} obj
 * @returns {Object} Deeply frozen object
 */
function deepFreeze(obj) {
    if (obj && typeof obj === 'object') {
        Object.freeze(obj);
        for (const prop of Object.getOwnPropertyNames(obj)) {
            if (obj[prop] !== null && (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') && !Object.isFrozen(obj[prop])) {
                deepFreeze(obj[prop]);
            }
        }
    }
    return obj;
}

export class PluginManagerService {
    /**
     * @param {Object} runtime - PluginRuntime instance
     * @param {Object|null} uiRegistry - PluginUIRegistry instance
     */
    constructor(runtime, uiRegistry = null) {
        if (!runtime) {
            throw new Error('[PluginManagerService] PluginRuntime instance is required.');
        }
        this.runtime = runtime;
        this.registry = runtime.registry;
        this.uiRegistry = uiRegistry || runtime.appService?.getPluginUIRegistry?.() || null;
    }

    /**
     * Retrieves a consolidated summary list of all installed plugins for UI rendering.
     * @returns {Array<Object>} List of deeply frozen immutable plugin summary DTOs
     */
    listInstalledPluginsSummary() {
        const records = this.registry.list();
        return records.map(record => {
            const pluginId = record.manifest.id;
            const uiEntry = this.uiRegistry ? this.uiRegistry.getUI(pluginId) : null;

            // Detached permissions array snapshot
            const permissions = Array.isArray(record.manifest.permissions)
                ? [...record.manifest.permissions]
                : [];

            // Detached error object snapshot
            let safeError = null;
            if (record.error) {
                safeError = {
                    name: record.error.name || 'Error',
                    message: record.error.message || String(record.error)
                };
            }

            return deepFreeze({
                id: record.manifest.id,
                name: record.manifest.name,
                version: record.manifest.version,
                apiVersion: record.manifest.apiVersion,
                description: record.manifest.description || '',
                permissions,
                state: record.state,
                error: safeError,
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
     * @returns {Promise<boolean>} True if toggle operation succeeded and plugin is active/disposed as requested
     */
    async togglePluginState(pluginId, enabled) {
        if (!pluginId || typeof pluginId !== 'string' || typeof enabled !== 'boolean') {
            return false;
        }

        if (!enabled) {
            return this.runtime.disposePlugin(pluginId);
        }

        const record = this.registry.get(pluginId);
        if (!record) return false;

        if (record.state === 'disposed') {
            this.registry.enable(pluginId);
        }

        await this.registry.initialize(pluginId);

        const updated = this.registry.get(pluginId);
        return updated?.state === 'active';
    }

    /**
     * Calculates storage metrics (total record count) for a specific plugin across collections.
     * Verifies storage readiness (storageService.verifyReadiness()) before querying.
     * @param {string} pluginId
     * @returns {Promise<{ totalRecords: number, collections: Record<string, number>, isLoaded: boolean }>}
     */
    async getPluginStorageMetrics(pluginId) {
        const storageService = this.runtime.storageService;
        const isReady = Boolean(storageService && typeof storageService.verifyReadiness === 'function' && storageService.verifyReadiness());

        if (!isReady) {
            return { totalRecords: 0, collections: {}, isLoaded: false };
        }

        if (!pluginId || typeof pluginId !== 'string') {
            return { totalRecords: 0, collections: {}, isLoaded: true };
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
     * Strictly requires storageService.verifyReadiness() === true before executing.
     * Tracks attempted vs confirmed deletions and returns a truthful PurgeOutcomeDTO.
     * @param {string} pluginId
     * @returns {Promise<Object>} Truthful purge outcome DTO
     */
    async purgePluginStorageData(pluginId) {
        const storageService = this.runtime.storageService;

        // 1. Verify storage readiness (mandatory prerequisite contract)
        const isReady = Boolean(storageService && typeof storageService.verifyReadiness === 'function' && storageService.verifyReadiness());

        if (!isReady) {
            return {
                success: false,
                attemptedCount: 0,
                localPurgedCount: 0,
                failedCount: 0,
                tombstoneStatus: 'not_applicable',
                syncStatus: 'not_applicable',
                errors: ['Cannot purge storage: storageService.verifyReadiness() is missing or returned false.']
            };
        }

        if (!pluginId || typeof pluginId !== 'string') {
            return {
                success: false,
                attemptedCount: 0,
                localPurgedCount: 0,
                failedCount: 0,
                tombstoneStatus: 'not_applicable',
                syncStatus: 'not_applicable',
                errors: ['Invalid pluginId provided for storage purge.']
            };
        }

        const allRecords = storageService.getAllRecords();
        const pluginRecords = allRecords.filter(r => r.plugin_id === pluginId && !r.deleted_at);

        if (pluginRecords.length === 0) {
            return {
                success: true,
                attemptedCount: 0,
                localPurgedCount: 0,
                failedCount: 0,
                tombstoneStatus: 'not_applicable',
                syncStatus: 'not_applicable',
                errors: []
            };
        }

        const scopedStorage = storageService.createPluginStorage(pluginId);
        const collectionNames = Array.from(new Set(pluginRecords.map(r => r.collection)));

        const attemptedCount = pluginRecords.length;
        let localPurgedCount = 0;
        let failedCount = 0;
        const errors = [];

        for (const colName of collectionNames) {
            const col = scopedStorage.collection(colName);
            const recordsInCol = pluginRecords.filter(r => r.collection === colName);

            for (const rec of recordsInCol) {
                try {
                    const deleted = await col.delete(rec.record_key);
                    if (deleted) {
                        localPurgedCount++;
                    } else {
                        failedCount++;
                        errors.push(`Record "${rec.record_key}" in collection "${colName}" was not found or failed to delete.`);
                    }
                } catch (err) {
                    failedCount++;
                    errors.push(`Record "${rec.record_key}" in collection "${colName}" delete error: ${err?.message || String(err)}`);
                }
            }
        }

        const syncServiceActive = Boolean(storageService.syncService && !storageService.syncService.isMuted);

        return {
            success: errors.length === 0 && (attemptedCount === 0 || localPurgedCount === attemptedCount),
            attemptedCount,
            localPurgedCount,
            failedCount,
            tombstoneStatus: localPurgedCount > 0 ? 'best_effort_unverified' : 'not_applicable',
            syncStatus: localPurgedCount > 0
                ? (syncServiceActive ? 'attempted_unverified' : 'skipped_disabled')
                : 'not_applicable',
            errors
        };
    }
}
