// src/services/plugin/PluginRuntime.js
// Host-side Plugin Runtime Foundation (PLG0)
import { PluginStorageService } from './PluginStorageService.js';

export class PluginRuntime {
    /**
     * @param {PluginStorageService} storageService
     * @param {Object} appService
     */
    constructor(storageService = null, appService = null) {
        this.storageService = storageService || new PluginStorageService();
        this.appService = appService;
        this.registeredPlugins = new Map();
    }

    setDependencies(storageService, appService) {
        if (storageService) this.storageService = storageService;
        if (appService) this.appService = appService;
    }

    /**
     * Validates a plugin manifest object.
     * @param {Object} manifest
     */
    validateManifest(manifest) {
        if (!manifest || typeof manifest !== 'object') {
            throw new Error('[PluginRuntime] Manifest must be a valid object.');
        }

        const requiredFields = ['id', 'name', 'version', 'apiVersion', 'permissions'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                throw new Error(`[PluginRuntime] Manifest missing required field: ${field}`);
            }
        }

        if (!Array.isArray(manifest.permissions)) {
            throw new Error('[PluginRuntime] Manifest permissions must be an array.');
        }

        return true;
    }

    /**
     * Registers a plugin and initializes its restricted execution context.
     * @param {Object} manifest - Declarative plugin manifest contract
     * @param {Function} setupFn - Optional setup function (receives restricted context)
     */
    registerPlugin(manifest, setupFn = null) {
        this.validateManifest(manifest);

        if (this.registeredPlugins.has(manifest.id)) {
            throw new Error(`[PluginRuntime] Plugin with ID "${manifest.id}" is already registered.`);
        }

        const grantedPermissions = new Set(manifest.permissions);

        // 1. Scoped Plugin Storage (Requires 'storage:private' permission)
        let scopedStorage = null;
        if (grantedPermissions.has('storage:private')) {
            scopedStorage = this.storageService.createPluginStorage(manifest.id);
        }

        // 2. Restricted Scoped UI Interface
        const scopedUI = {
            showToast: (message, type = 'info') => {
                if (!grantedPermissions.has('ui:toast')) {
                    throw new Error(`[PluginRuntime] Plugin "${manifest.id}" lacks "ui:toast" permission.`);
                }
                if (this.appService?.showToast) {
                    this.appService.showToast(message, type);
                }
            }
        };

        // 3. Restricted Scoped Host API Interface
        const scopedAPI = {
            getCategoryList: () => {
                if (!grantedPermissions.has('expenses:read')) {
                    throw new Error(`[PluginRuntime] Plugin "${manifest.id}" lacks "expenses:read" permission.`);
                }
                const appInstance = this.appService?.getAppInstance?.();
                return appInstance?.items?.items ? JSON.parse(JSON.stringify(appInstance.items.items)) : [];
            }
        };

        // Restricted Context Context Passed to Plugin
        const context = {
            storage: scopedStorage,
            ui: scopedUI,
            api: scopedAPI
        };

        let setupResult = null;
        if (typeof setupFn === 'function') {
            try {
                setupResult = setupFn(context);
            } catch (err) {
                console.error(`[PluginRuntime] Error during setup of plugin "${manifest.id}":`, err);
                throw err;
            }
        }

        const pluginRecord = {
            manifest: JSON.parse(JSON.stringify(manifest)),
            context,
            setupResult,
            registeredAt: new Date().toISOString()
        };

        this.registeredPlugins.set(manifest.id, pluginRecord);
        console.log(`[PluginRuntime] 🔌 Plugin successfully registered: ${manifest.name} (${manifest.id})`);

        return pluginRecord;
    }

    /**
     * Retrieves information about a registered plugin.
     * @param {string} pluginId
     */
    getPlugin(pluginId) {
        return this.registeredPlugins.get(pluginId) || null;
    }

    /**
     * Lists all registered plugins.
     */
    listPlugins() {
        return Array.from(this.registeredPlugins.values()).map(p => p.manifest);
    }

    /**
     * Legacy PluginStorage Data Migration Helper.
     * Maps old hardcoded tables to generic plugin_records.
     * @param {Object} app - Host App instance
     */
    async migrateLegacyPluginData(app) {
        if (!app || !app.db) return { migrated: 0 };

        const legacyMappings = [
            { oldTable: 'plugin_fuel_logs', pluginId: 'plugin_fuel_log', collection: 'logs' },
            { oldTable: 'plugin_shopping_list', pluginId: 'plugin_shopping_list', collection: 'items' },
            { oldTable: 'plugin_quick_notes', pluginId: 'plugin_quick_notes', collection: 'notes' },
            { oldTable: 'plugin_mileage_saved_trips', pluginId: 'plugin_mileage_calculator', collection: 'trips' },
            { oldTable: 'plugin_calc_history', pluginId: 'plugin_calculator', collection: 'history' }
        ];

        let totalMigrated = 0;

        for (const mapping of legacyMappings) {
            try {
                const items = await app.db.getAll(mapping.oldTable);
                if (Array.isArray(items) && items.length > 0) {
                    const scopedStorage = this.storageService.createPluginStorage(mapping.pluginId);
                    const coll = scopedStorage.collection(mapping.collection);

                    for (const item of items) {
                        const recordKey = item.id || String(Date.now());
                        const existing = await coll.get(recordKey);
                        if (!existing) {
                            await coll.set(recordKey, item);
                            totalMigrated++;
                        }
                    }
                }
            } catch (err) {
                console.warn(`[PluginRuntime] Legacy migration warning for ${mapping.oldTable}:`, err);
            }
        }

        console.log(`[PluginRuntime] ✅ Legacy plugin storage migration completed: ${totalMigrated} records migrated.`);
        return { migrated: totalMigrated };
    }
}
