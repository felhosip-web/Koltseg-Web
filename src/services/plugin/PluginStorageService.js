// src/services/plugin/PluginStorageService.js
// Host-side Scoped Plugin Storage Service (PLG0)
import { generateUUID } from '../../../js/uuid-utils.js';

export class PluginStorageService {
    /**
     * @param {Object} db - Database instance (app.db)
     * @param {Object} syncService - SyncService instance (app.syncService)
     */
    constructor(db = null, syncService = null) {
        this.db = db;
        this.syncService = syncService;
        this.records = []; // In-memory array of plugin_records
        this.isLoaded = false;
    }

    setDependencies(db, syncService) {
        this.db = db;
        this.syncService = syncService;
    }

    /**
     * Confirms successful loading and usable database connection availability.
     * @returns {boolean} True if loaded and database is available
     */
    verifyReadiness() {
        return Boolean(this.isLoaded && this.db);
    }

    /**
     * Loads all non-deleted plugin records from IndexedDB into memory.
     */
    async load() {
        if (!this.db) {
            this.records = [];
            this.isLoaded = false;
            return [];
        }
        try {
            const rawRecords = await this.db.getAll('plugin_records');
            this.records = (rawRecords || []).filter(r => !r.deleted_at);
            this.isLoaded = true;
            return this.records;
        } catch (e) {
            console.error('[PluginStorageService] Error loading plugin_records:', e);
            this.records = [];
            this.isLoaded = false;
            return [];
        }
    }

    /**
     * Returns all active in-memory plugin records for SyncService
     */
    getAllRecords() {
        return this.records.filter(r => !r.deleted_at);
    }

    /**
     * Creates a scoped storage API bound to a specific plugin ID.
     * @param {string} pluginId - Bound plugin identifier
     * @returns {Object} Scoped plugin storage interface
     */
    createPluginStorage(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') {
            throw new Error('[PluginStorageService] Valid pluginId is required to create plugin storage.');
        }

        const boundPluginId = String(pluginId).trim();
        const service = this;

        return {
            get pluginId() {
                return boundPluginId;
            },

            /**
             * Returns a collection accessor bound to pluginId and collectionName.
             * @param {string} collectionName
             */
            collection(collectionName) {
                if (!collectionName || typeof collectionName !== 'string') {
                    throw new Error('[PluginStorageService] Valid collectionName is required.');
                }
                const boundCollection = String(collectionName).trim();

                return {
                    /**
                     * Retrieves a record's data payload by record_key.
                     * @param {string} recordKey
                     * @returns {Promise<Object|null>}
                     */
                    async get(recordKey) {
                        const keyStr = String(recordKey);
                        const rec = service.records.find(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            r.record_key === keyStr &&
                            !r.deleted_at
                        );
                        return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
                    },

                    /**
                     * Creates or updates a record inside this collection.
                     * @param {string} recordKey
                     * @param {Object} value - JSON-compatible data payload
                     */
                    async set(recordKey, value) {
                        if (!recordKey) throw new Error('recordKey is required');
                        if (value === undefined) throw new Error('value cannot be undefined');

                        const keyStr = String(recordKey);
                        const now = new Date().toISOString();

                        let rec = service.records.find(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            r.record_key === keyStr
                        );

                        if (rec) {
                            rec.data = JSON.parse(JSON.stringify(value));
                            rec.updated_at = now;
                            rec.deleted_at = null;
                        } else {
                            rec = {
                                id: generateUUID(),
                                plugin_id: boundPluginId,
                                collection: boundCollection,
                                record_key: keyStr,
                                data: JSON.parse(JSON.stringify(value)),
                                created_at: now,
                                updated_at: now,
                                deleted_at: null
                            };
                            service.records.push(rec);
                        }

                        // Save to IndexedDB if DB connection exists
                        if (service.db) {
                            await service.db.save('plugin_records', rec);
                        }

                        // Enqueue change in SyncService if available
                        if (service.syncService && !service.syncService.isMuted) {
                            service.syncService.addToQueue('update', rec, 'plugin_records', 'normal', 'id');
                        }

                        return JSON.parse(JSON.stringify(rec.data));
                    },

                    /**
                     * Deletes a record from this collection following tombstone deletion semantics.
                     * @param {string} recordKey
                     */
                    async delete(recordKey) {
                        const keyStr = String(recordKey);
                        const rec = service.records.find(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            r.record_key === keyStr &&
                            !r.deleted_at
                        );

                        if (!rec) {
                            return false;
                        }

                        // Persistent deletion requires a usable database connection and deletion method
                        if (!service.db) {
                            return false;
                        }

                        if (typeof service.db.delete === 'function') {
                            await service.db.delete('plugin_records', rec.id);
                        } else if (typeof service.db._directDelete === 'function') {
                            await service.db._directDelete('plugin_records', rec.id);
                        } else {
                            return false;
                        }

                        // Remove from active in-memory cache ONLY after persistent deletion completes successfully
                        const currIndex = service.records.findIndex(r => r.id === rec.id);
                        if (currIndex !== -1) {
                            service.records.splice(currIndex, 1);
                        }

                        return true;
                    },

                    /**
                     * Lists all data payloads or records in this collection.
                     * @returns {Promise<Array>}
                     */
                    async list() {
                        const recs = service.records.filter(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            !r.deleted_at
                        );
                        return recs.map(r => ({
                            record_key: r.record_key,
                            data: JSON.parse(JSON.stringify(r.data)),
                            created_at: r.created_at,
                            updated_at: r.updated_at
                        }));
                    },

                    /**
                     * Clears all records in this collection.
                     */
                    async clear() {
                        const targets = service.records.filter(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            !r.deleted_at
                        );

                        for (const target of targets) {
                            await this.delete(target.record_key);
                        }
                        return targets.length;
                    },

                    /**
                     * Checks if a record key exists in this collection.
                     * @param {string} recordKey
                     * @returns {Promise<boolean>}
                     */
                    async has(recordKey) {
                        const val = await this.get(recordKey);
                        return val !== null;
                    },

                    /**
                     * Counts total active records in this collection.
                     * @returns {Promise<number>}
                     */
                    async count() {
                        const list = await this.list();
                        return list.length;
                    }
                };
            }
        };
    }
}
