// js/work-log.js - v5.2.0 - Munka nyilvántartó modul (UUID)
import { generateUUID } from './uuid-utils.js';
import { validateWorkRecord } from './utils/work-validation.js';

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
        // Sort works newest first: created_at descending (when timestamps exist).
        // For equal created_at timestamps, tie-break by date descending, then ID.
        // If neither record has created_at (legacy records), preserve stable ID ordering.
        loadedWorks.sort((a, b) => {
            const aCreated = a.created_at || '';
            const bCreated = b.created_at || '';
            if (aCreated && bCreated) {
                const cmp = bCreated.localeCompare(aCreated);
                if (cmp !== 0) return cmp;
                const aDate = a.date || '';
                const bDate = b.date || '';
                if (aDate !== bDate) {
                    return bDate.localeCompare(aDate);
                }
            } else if (bCreated) {
                return 1;
            } else if (aCreated) {
                return -1;
            }
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
        this.works = loadedWorks;
        return this.works;
    }

    /**
     * Save a work log entry
     */
    async save(work) {
        // Validate domain rules via centralized validator
        const validation = validateWorkRecord(work);
        if (!validation.valid) {
            throw new Error(`[WorkLogManager] ${validation.error}`);
        }

        let workToSave = { ...validation.sanitizedRecord };

        if (!workToSave.id) {
            // New entry - generate UUID and assign valid current created_at if not provided
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
                            // Existing record with original created_at: preserve it.
                            // Existing legacy record without created_at: keep it missing (do NOT fabricate or overwrite).
                            const originalCreatedAt = existingRecord.created_at;
                            recordToPut = { ...existingRecord, ...recordToPut };
                            if (originalCreatedAt !== undefined) {
                                recordToPut.created_at = originalCreatedAt;
                            } else {
                                delete recordToPut.created_at;
                            }
                        } else {
                            // If an ID was supplied but no existing record was found in database,
                            // treat it as a new insert: assign created_at if missing
                            recordToPut.created_at = recordToPut.created_at || new Date().toISOString();
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
                            // Let the error event bubble to tx.onerror to abort and reject cleanly
                            if (_tx && typeof _tx.abort === 'function' && _tx.error === null && _tx._state === 'active') {
                                try { _tx.abort(); } catch (_) {}
                            }
                        };
                    }
                });
                if (resolvedRecord) {
                    workToSave = resolvedRecord;
                }
            } else {
                throw new Error('[WorkLogManager] Atomic transaction execution (runTransaction) is required for editing work records.');
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
