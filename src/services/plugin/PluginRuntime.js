// src/services/plugin/PluginRuntime.js
// Host-side Plugin Runtime Foundation (PLG1 Integration)
import { PluginStorageService } from './PluginStorageService.js';
import { PluginRegistry } from './PluginRegistry.js';
import { validatePluginManifest } from './PluginManifestValidator.js';

export class PluginRuntime {
    /**
     * @param {PluginStorageService} storageService
     * @param {Object} appService
     */
    constructor(storageService = null, appService = null) {
        this.storageService = storageService || new PluginStorageService();
        this.appService = appService;
        this.registry = new PluginRegistry(this.storageService, this.appService);
    }

    setDependencies(storageService, appService) {
        if (storageService) this.storageService = storageService;
        if (appService) this.appService = appService;
        this.registry.setDependencies(this.storageService, this.appService);
    }

    /**
     * Validates a plugin manifest contract object.
     * @param {Object} manifest
     */
    validateManifest(manifest) {
        return validatePluginManifest(manifest);
    }

    /**
     * Registers and initializes a plugin in one step (PLG0 compatibility wrapper over PluginRegistry).
     * @param {Object} manifest - Declarative plugin manifest contract
     * @param {Function} setupFn - Optional setup function receiving restricted context
     * @returns {Promise<Object>}
     */
    async registerPlugin(manifest, setupFn = null) {
        this.registry.register(manifest, setupFn);
        const record = await this.registry.initialize(manifest.id);
        console.log(`[PluginRuntime] 🔌 Plugin successfully registered & activated: ${manifest.name} (${manifest.id})`);
        return record;
    }

    /**
     * Retrieves information about a registered plugin.
     * @param {string} pluginId
     */
    getPlugin(pluginId) {
        return this.registry.get(pluginId);
    }

    /**
     * Lists all registered plugin manifests.
     */
    listPlugins() {
        return this.registry.list().map(p => p.manifest);
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
