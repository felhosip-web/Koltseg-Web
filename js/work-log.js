// js/work-log.js - v5.2.0 - Munka nyilvántartó modul (UUID)
import { generateUUID } from './uuid-utils.js';

export class WorkLogManager {
    constructor(db, syncService) {
        this.db = db;
        this.syncService = syncService;
        this.works = [];
    }

    /**
     * Load all works from database
     */
    async load() {
        const loadedWorks = await this.db.getAll('works') || [];
        // Sort works by created_at timestamp (newer first for display, but keep stable order)
        loadedWorks.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        this.works = loadedWorks;
        return this.works;
    }

    /**
     * Save a work log entry
     */
    async save(work) {
        let workToSave = { ...work };
        if (!workToSave.id) {
            // New entry - generate UUID
            workToSave.id = generateUUID();
            workToSave.created_at = workToSave.created_at || new Date().toISOString();
            workToSave.updated_at = new Date().toISOString();

            await this.db.save('works', workToSave);
        } else {
            // Editing existing entry - execute read & write within the same atomic readwrite transaction
            if (this.db && typeof this.db.runTransaction === 'function') {
                let resolvedRecord = null;
                await this.db.runTransaction(['works'], 'readwrite', (_tx, stores) => {
                    const store = stores.works;
                    const applyMergeAndPut = (existingRecord) => {
                        let recordToPut = { ...workToSave };
                        if (existingRecord) {
                            const originalCreatedAt = existingRecord.created_at;
                            recordToPut = { ...existingRecord, ...recordToPut };
                            if (originalCreatedAt !== undefined) {
                                recordToPut.created_at = originalCreatedAt;
                            } else {
                                delete recordToPut.created_at;
                            }
                        }
                        recordToPut.updated_at = new Date().toISOString();
                        resolvedRecord = recordToPut;
                        store.put(recordToPut);
                    };

                    // Check if store.get accepts a callback (mock DB) or returns an IDBRequest
                    let isCallbackInvoked = false;
                    const getReq = store.get(workToSave.id, (mockExisting) => {
                        isCallbackInvoked = true;
                        applyMergeAndPut(mockExisting);
                    });

                    // Standard IDBObjectStore path (returns IDBRequest with onsuccess/onerror)
                    if (!isCallbackInvoked && getReq && typeof getReq === 'object' && 'onsuccess' in getReq) {
                        getReq.onsuccess = () => {
                            applyMergeAndPut(getReq.result);
                        };
                        getReq.onerror = (e) => {
                            const err = e?.target?.error || new Error('Database read failure during transaction');
                            if (_tx && typeof _tx.abort === 'function') {
                                try { _tx.abort(); } catch (_) {}
                            }
                            throw err;
                        };
                    }
                });
                if (resolvedRecord) {
                    workToSave = resolvedRecord;
                }
            } else {
                // Fallback if runTransaction is unavailable on custom mock
                let existing = null;
                if (this.db && typeof this.db.getAll === 'function') {
                    const allPersisted = await this.db.getAll('works');
                    existing = (allPersisted || []).find(w => String(w.id) === String(workToSave.id)) || null;
                }
                if (existing) {
                    const originalCreatedAt = existing.created_at;
                    workToSave = { ...existing, ...workToSave };
                    if (originalCreatedAt !== undefined) {
                        workToSave.created_at = originalCreatedAt;
                    } else {
                        delete workToSave.created_at;
                    }
                }
                workToSave.updated_at = new Date().toISOString();
                await this.db.save('works', workToSave);
            }
        }

        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', workToSave);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a felhőbe szinkronizálni:', err);
            }
        }
        return workToSave;
    }

    /**
     * Delete a work log entry
     */
    async delete(id) {
        await this.db.delete('works', id);
        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', id, true);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a törlést felhőbe szinkronizálni:', err);
            }
        }
    }
}
