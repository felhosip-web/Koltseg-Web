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
        if (!work || typeof work !== 'object') {
            throw new Error('Érvénytelen munka bejegyzés adat.');
        }

        let workToSave = { ...work };

        // Strict ISO-8601 validation helper: regex format check + calendar & time limits
        const isValidStrictIso8601 = (ts) => {
            if (typeof ts !== 'string' || ts.trim() === '') return false;
            const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
            if (!match) return false;
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const day = parseInt(match[3], 10);
            const hour = parseInt(match[4], 10);
            const minute = parseInt(match[5], 10);
            const second = parseInt(match[6], 10);
            if (month < 1 || month > 12) return false;
            if (hour > 23 || minute > 59 || second > 59) return false;
            const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
            if (day < 1 || day > daysInMonth) return false;
            const d = new Date(ts);
            return !isNaN(d.getTime());
        };

        // Distinguish omitted created_at from explicitly supplied null, non-string, or malformed values
        if ('created_at' in workToSave && workToSave.created_at !== undefined) {
            if (!isValidStrictIso8601(workToSave.created_at)) {
                throw new Error('Érvénytelen created_at időbélyeg formátum.');
            }
        }

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
