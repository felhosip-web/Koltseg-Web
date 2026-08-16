import { generateUUID } from './uuid-utils.js';

/**
 * PluginStorage
 * Wrapper class to bridge synchronous UI rendering of dynamic modules
 * with the asynchronous local IndexedDB and cloud SyncService.
 */
export class PluginStorage {
    constructor(app) {
        this.app = app;
        this.cache = {};
        this.tables = [
            'plugin_fuel_logs',
            'plugin_shopping_list',
            'plugin_quick_notes',
            'plugin_mileage_saved_trips',
            'plugin_calc_history'
        ];
    }

    async init() {
        if (!this.app.db) {
            console.warn('[PluginStorage] app.db not initialized yet.');
            return;
        }

        for (const table of this.tables) {
            try {
                const data = await this.app.db.getAll(table);
                this.cache[table] = data || [];


                // Fallback / Hydration from localStorage if DB is empty and LS has data
                // This ensures we don't lose data during the migration to PluginStorage
                if (this.cache[table].length === 0) {
                    const lsKey = table === 'plugin_shopping_list' ? 'plugin_shopping_list_items' : table;
                    const lsData = localStorage.getItem(lsKey);
                    if (lsData) {
                        try {
                            const parsed = JSON.parse(lsData);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                console.log(`[PluginStorage] Migrating ${parsed.length} items from localStorage for ${table}`);
                                for (const item of parsed) {
                                    if (!item.id) item.id = generateUUID();
                                    this.cache[table].push(item);
                                    await this.app.db.save(table, item);
                                    if (this.app.syncService) this.app.syncService.addToQueue('upsert', item, table, 'normal', 'id');
                                }
                                localStorage.removeItem(lsKey);
                            }
                        } catch (e) {
                            console.warn(`[PluginStorage] Failed to parse localStorage data for ${table}:`, e);
                        }
                    }
                }

            } catch (error) {
                console.error(`[PluginStorage] Error initializing table ${table}:`, error);
                this.cache[table] = [];
            }
        }
        console.log('[PluginStorage] Initialized with tables:', this.tables);
    }

    getItems(table) {
        if (!this.tables.includes(table)) {
            console.warn(`[PluginStorage] Table ${table} is not registered.`);
            return [];
        }
        return this.cache[table] || [];
    }

    saveItem(table, item) {
        if (!this.tables.includes(table)) {
            console.warn(`[PluginStorage] Table ${table} is not registered.`);
            return;
        }
        if (!item.id) {
            item.id = generateUUID();
        }
        if (!item.updated_at) {
            item.updated_at = new Date().toISOString();
        }

        // 1. Update in-memory cache synchronously
        if (!this.cache[table]) this.cache[table] = [];
        const index = this.cache[table].findIndex(i => i.id === item.id);
        if (index !== -1) {
            this.cache[table][index] = item;
        } else {
            this.cache[table].unshift(item); // Prepend by default for lists
        }

        // 2. Async save to IndexedDB and sync to cloud
        this._asyncSave(table, item).catch(err => {
            console.error(`[PluginStorage] Failed to save item to ${table}:`, err);
        });
    }

    async _asyncSave(table, item) {
        if (this.app.db) {
            await this.app.db.save(table, item);
        }
        if (this.app.syncService) {
            this.app.syncService.addToQueue('upsert', item, table, 'normal', 'id');
        }
    }

    deleteItem(table, id) {
        if (!this.tables.includes(table)) {
            console.warn(`[PluginStorage] Table ${table} is not registered.`);
            return;
        }

        // 1. Update in-memory cache synchronously
        if (this.cache[table]) {
            this.cache[table] = this.cache[table].filter(i => i.id !== id);
        }

        // 2. Async delete from IndexedDB and sync to cloud
        this._asyncDelete(table, id).catch(err => {
             console.error(`[PluginStorage] Failed to delete item ${id} from ${table}:`, err);
        });
    }

    async _asyncDelete(table, id) {
        if (this.app.db) {
            await this.app.db.delete(table, id);
        }
        if (this.app.syncService) {
            this.app.syncService.addToQueue('delete', { id }, table, 'normal', 'id');
        }
    }

    clearAll(table) {
        if (!this.tables.includes(table)) {
            return;
        }
        const items = [...(this.cache[table] || [])];
        this.cache[table] = [];

        items.forEach(item => {
            this._asyncDelete(table, item.id).catch(err => {
                console.error(`[PluginStorage] Failed to delete item ${item.id} during clearAll on ${table}:`, err);
            });
        });
    }
}
