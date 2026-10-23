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
     * Returns all active user-facing plugin records (excluding internal __host_ records) for SyncService and UI metrics.
     */
    getAllRecords() {
        return this.records.filter(r => !r.deleted_at && !(r.collection && r.collection.startsWith('__host_')));
    }

    /**
     * Returns all active internal host outbox records.
     */
    getHostOutboxRecords() {
        return this.records.filter(r => r.collection === '__host_outbox__' && !r.deleted_at);
    }

    /**
     * Removes an acknowledged host outbox record from IndexedDB and in-memory cache.
     * @param {string} outboxId - Outbox record ID or op_id
     */
    async removeHostOutboxRecord(outboxId) {
        if (!outboxId || !this.db) return false;
        const targetIndex = this.records.findIndex(r =>
            r.collection === '__host_outbox__' && (r.id === outboxId || r.op_id === outboxId || r.data?.op_id === outboxId)
        );
        if (targetIndex !== -1) {
            const rec = this.records[targetIndex];
            if (typeof this.db.delete === 'function') {
                await this.db.delete('plugin_records', rec.id);
            } else if (typeof this.db._directDelete === 'function') {
                await this.db._directDelete('plugin_records', rec.id);
            }
            this.records.splice(targetIndex, 1);
            return true;
        }
        return false;
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
                if (boundCollection.startsWith('__host_')) {
                    throw new Error(`[PluginStorageService] Access to reserved system collection "${boundCollection}" is denied.`);
                }

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
                        if (!service.db || typeof service.db.save !== 'function') {
                            throw new Error('[PluginStorageService] Cannot set record: database connection is unavailable.');
                        }

                        const keyStr = String(recordKey);
                        const now = new Date().toISOString();
                        const opId = generateUUID();

                        let rec = service.records.find(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            r.record_key === keyStr
                        );

                        const isNew = !rec;
                        let previousData = null;
                        let previousUpdatedAt = null;
                        let previousDeletedAt = null;
                        let previousOpId = null;

                        if (rec) {
                            previousData = rec.data ? JSON.parse(JSON.stringify(rec.data)) : null;
                            previousUpdatedAt = rec.updated_at;
                            previousDeletedAt = rec.deleted_at;
                            previousOpId = rec.op_id;

                            rec.data = JSON.parse(JSON.stringify(value));
                            rec.updated_at = now;
                            rec.deleted_at = null;
                            rec.op_id = opId;
                            rec.schema_version = rec.schema_version || 1;
                        } else {
                            rec = {
                                id: generateUUID(),
                                plugin_id: boundPluginId,
                                collection: boundCollection,
                                record_key: keyStr,
                                data: JSON.parse(JSON.stringify(value)),
                                schema_version: 1,
                                op_id: opId,
                                created_at: now,
                                updated_at: now,
                                deleted_at: null
                            };
                            service.records.push(rec);
                        }

                        // Outbox record for durable IDB persistence
                        const outboxRecord = {
                            id: generateUUID(),
                            plugin_id: boundPluginId,
                            collection: '__host_outbox__',
                            record_key: rec.id,
                            data: {
                                op: 'update',
                                op_id: opId,
                                target_id: rec.id,
                                plugin_id: boundPluginId,
                                target_collection: boundCollection,
                                record_key: keyStr,
                                payload: JSON.parse(JSON.stringify(rec))
                            },
                            schema_version: 1,
                            op_id: opId,
                            created_at: now,
                            updated_at: now,
                            deleted_at: null
                        };

                        try {
                            if (typeof service.db.runTransaction === 'function' && service.db.save === service.db.constructor?.prototype?.save) {
                                await service.db.runTransaction(['plugin_records'], 'readwrite', (tx, stores) => {
                                    const store = stores.plugin_records;
                                    store.put(rec);
                                    store.put(outboxRecord);
                                });
                            } else {
                                await service.db.save('plugin_records', rec);
                                await service.db.save('plugin_records', outboxRecord);
                            }
                        } catch (dbErr) {
                            // Roll back in-memory cache on persistent write failure
                            if (isNew) {
                                const newIdx = service.records.findIndex(r => r.id === rec.id);
                                if (newIdx !== -1) {
                                    service.records.splice(newIdx, 1);
                                }
                            } else {
                                rec.data = previousData;
                                rec.updated_at = previousUpdatedAt;
                                rec.deleted_at = previousDeletedAt;
                                rec.op_id = previousOpId;
                            }
                            throw dbErr;
                        }

                        // Also track in in-memory records list for outbox
                        service.records.push(outboxRecord);

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

                        const now = new Date().toISOString();
                        const opId = generateUUID();

                        // Tombstone record for deleted_records
                        const tombstoneRecord = {
                            id: generateUUID(),
                            record_id: String(rec.id),
                            table_name: 'plugin_records',
                            deleted_at: now,
                            updated_at: now
                        };

                        // Outbox record for durable IDB persistence of deletion
                        const outboxRecord = {
                            id: generateUUID(),
                            plugin_id: boundPluginId,
                            collection: '__host_outbox__',
                            record_key: rec.id,
                            data: {
                                op: 'delete',
                                op_id: opId,
                                target_id: rec.id,
                                plugin_id: boundPluginId,
                                target_collection: boundCollection,
                                record_key: keyStr
                            },
                            schema_version: rec.schema_version || 1,
                            op_id: opId,
                            created_at: now,
                            updated_at: now,
                            deleted_at: null
                        };

                        try {
                            if (typeof service.db.runTransaction === 'function' && service.db.delete === service.db.constructor?.prototype?.delete) {
                                await service.db.runTransaction(['plugin_records', 'deleted_records'], 'readwrite', (tx, stores) => {
                                    stores.plugin_records.delete(rec.id);
                                    stores.plugin_records.put(outboxRecord);
                                    if (service.syncService && !service.syncService.isMuted) {
                                        stores.deleted_records.put(tombstoneRecord);
                                    }
                                });
                            } else {
                                if (typeof service.db.delete === 'function') {
                                    await service.db.delete('plugin_records', rec.id);
                                } else if (typeof service.db._directDelete === 'function') {
                                    await service.db._directDelete('plugin_records', rec.id);
                                } else {
                                    return false;
                                }
                                if (typeof service.db.save === 'function') {
                                    await service.db.save('plugin_records', outboxRecord);
                                }
                            }
                        } catch (err) {
                            throw err;
                        }

                        // Remove from active in-memory cache ONLY after persistent deletion completes successfully
                        const currIndex = service.records.findIndex(r => r.id === rec.id);
                        if (currIndex !== -1) {
                            service.records.splice(currIndex, 1);
                        }

                        // Also track outbox record in memory
                        service.records.push(outboxRecord);

                        // Enqueue delete in SyncService if available
                        if (service.syncService && !service.syncService.isMuted) {
                            service.syncService.addToQueue('delete', { id: rec.id }, 'plugin_records', 'high', 'id');
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
                     * Returns count of confirmed successful deletions.
                     */
                    async clear() {
                        const targets = service.records.filter(r =>
                            r.plugin_id === boundPluginId &&
                            r.collection === boundCollection &&
                            !r.deleted_at
                        );

                        let clearedCount = 0;
                        for (const target of targets) {
                            try {
                                const deleted = await this.delete(target.record_key);
                                if (deleted) {
                                    clearedCount++;
                                }
                            } catch (e) {
                                // Ignore individual record delete errors, do not increment count
                            }
                        }
                        return clearedCount;
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
