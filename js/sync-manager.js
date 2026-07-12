// js/sync-manager.js - Wrapper a SyncService-hez (kompatibilitás miatt)
// Teljes, javított verzió

export class SyncManager {
    constructor(app) {
        this.app = app;
        this.tables = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders'];
        // Használjuk a meglévő SyncService-t
        this.service = app.syncService;
        
        // Biztosítjuk, hogy a service tudja az app referenciát
        if (this.service && typeof this.service.setApp === 'function') {
            this.service.setApp(app);
        }
    }

    /**
     * Teljes szinkronizáció (delegálás)
     */
    async sync() {
        if (!this.service) {
            console.error('[SyncManager] SyncService nem elérhető!');
            return { status: 'error', message: 'SyncService nem elérhető' };
        }
        return this.service.sync();
    }

    /**
     * Csak pull (delegálás + helyi mentés és UI frissítés)
     */
    async executePull() {
        if (!this.service) return [];
        console.log('[SyncManager] executePull() indítása...');
        
        if (this.service.cloud) {
            this.service.cloud.tablesMissing = false;
        }
        
        // 1. Felhő adatok lekérése
        const cloudData = await this.service.pull('all');
        console.log('[SyncManager] Felhőből letöltött adatok:', cloudData);
        
        // 2. Helyi törölt rekordok betöltése
        const localDeletedRecords = this.app.db ? await this.app.db.getAll('deleted_records') : [];
        
        // 3. Helyi adatok összeszerelése az összefésüléshez
        const localData = {
            items: this.service._getLocalData('items'),
            months: this.service._getLocalData('months'),
            entries: this.service._getLocalData('entries'),
            templates: this.service._getLocalData('templates'),
            reminders: this.service._getLocalData('reminders'),
            incomings: this.service._getLocalData('incomings'),
            incoming_senders: this.service._getLocalData('incoming_senders'),
            deleted_records: localDeletedRecords
        };
        
        // 4. Összefésülés táblánként (felhő/LWW szabályok szerint)
        const mergedData = {};
        for (const table of this.tables) {
            const local = localData[table] || [];
            const cloud = cloudData[table] || [];
            
            const merged = this.service._mergeTable(local, cloud, table);
            mergedData[table] = merged;
        }
        
        // 5. Tombstone törlések alkalmazása (felhőből érkező törlések törlése helyben)
        const mergedTombstones = mergedData.deleted_records || [];
        for (const tombstone of mergedTombstones) {
            const targetTable = tombstone.table_name;
            const targetId = tombstone.record_id;
            
            if (targetTable && targetId && targetTable !== 'deleted_records') {
                const keyField = targetTable === 'months' ? 'month' : 'id';
                if (mergedData[targetTable]) {
                    mergedData[targetTable] = mergedData[targetTable].filter(item => String(item[keyField]) !== String(targetId));
                }
                try {
                    const key = (targetTable === 'months') ? targetId : (isNaN(Number(targetId)) ? targetId : Number(targetId));
                    if (this.app.db) {
                        await this.app.db._directDelete(targetTable, key);
                    }
                } catch (e) {
                    console.warn(`[SyncManager] Tombstone fizikai törlési hiba letöltés közben:`, e);
                }
            }
        }
        
        // 6. Összefésült adatok mentése a helyi IndexedDB-be
        await this.service._saveMergedToLocal(mergedData);
        
        // 7. Helyi managerek újratöltése és UI újra-renderelése
        await this.service._reloadAndRender();
        
        console.log('[SyncManager] executePull() sikeresen befejeződött, helyi DB és UI frissítve.');
        return cloudData;
    }

    /**
     * Csak push (delegálás + UI frissítés)
     */
    async executePush() {
        if (!this.service) return;
        console.log('[SyncManager] executePush() indítása...');
        
        if (this.service.cloud) {
            this.service.cloud.tablesMissing = false;
        }
        // Push csak akkor működik, ha van adat
        const app = this.app;
        for (const table of this.tables) {
            const data = this._getTableData(table, app);
            if (data && data.length > 0) {
                for (const item of data) {
                    await this.service.push(table, item);
                }
            }
        }
        // Push után is töltsük újra és rendereljük az UI-t, biztos ami biztos
        await this.service._reloadAndRender();
        console.log('[SyncManager] executePush() sikeresen befejeződött.');
    }

    // ========================================================
    // === HIÁNYZÓ METÓDUSOK ===
    // ========================================================

    /**
     * Pull statisztikák lekérése (felhőben lévő adatok száma) - párhuzamosítva és timeout-tal védve
     */
    async getPullStats() {
        const stats = {};
        
        if (!this.service) {
            console.warn('[SyncManager] SyncService nem elérhető');
            this.tables.forEach(table => stats[table] = 0);
            return stats;
        }

        if (this.service.cloud) {
            this.service.cloud.tablesMissing = false;
        }

        const withTimeout = (promise, ms = 4000) => {
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Időtúllépés (${ms}ms)`));
                }, ms);
            });
            return Promise.race([promise, timeoutPromise]).finally(() => {
                clearTimeout(timeoutId);
            });
        };

        // Párhuzamos lekérdezés minden táblára, 4 mp-es timeouttal
        await Promise.all(
            this.tables.map(async (table) => {
                try {
                    if (typeof this.service.pull === 'function') {
                        const data = await withTimeout(this.service.pull(table), 4000);
                        stats[table] = data?.length || 0;
                    } else if (this.service.cloud && typeof this.service.cloud.pull === 'function') {
                        const data = await withTimeout(this.service.cloud.pull(table), 4000);
                        stats[table] = data?.length || 0;
                    } else {
                        stats[table] = 0;
                    }
                } catch (e) {
                    console.warn(`[SyncManager] Pull stats hiba/időtúllépés a(z) ${table} táblánál:`, e);
                    stats[table] = 0;
                }
            })
        );
        
        return stats;
    }

    /**
     * Push statisztikák lekérése (helyi adatok száma)
     */
    async getPushStats() {
        const stats = {};
        const app = this.app;

        for (const table of this.tables) {
            try {
                const data = this._getTableData(table, app);
                stats[table] = data?.length || 0;
            } catch (e) {
                console.warn(`[SyncManager] Push stats hiba a ${table} táblánál:`, e);
                stats[table] = 0;
            }
        }
        
        return stats;
    }

    /**
     * Függő változtatások száma
     */
    getPendingCount() {
        return this.service?.offline?.getPendingCount?.() || 0;
    }

    /**
     * Van-e függő változtatás
     */
    hasPendingChanges() {
        return this.getPendingCount() > 0;
    }

    /**
     * Függő változtatások betöltése
     */
    loadPendingChanges() {
        this.service?.offline?.loadPendingChanges?.();
    }

    /**
     * Függő változtatások feldolgozása
     */
    async processPendingChanges() {
        if (!this.service?.offline) return 0;
        return this.service.offline.processPendingChanges();
    }

    /**
     * Szinkronizációs státusz
     */
    getStatus() {
        if (!this.service) return { error: 'SyncService nem elérhető' };
        return this.service.getStatus();
    }

    /**
     * Segédfüggvény táblák adatainak lekérésére
     */
    _getTableData(table, app) {
        if (!app) return [];
        try {
            switch (table) {
                case 'items': return app.items?.items || [];
                case 'months': return app.months?.months || [];
                case 'entries': return app.entries?.entries || [];
                case 'templates': return app.templates?.templates || [];
                case 'reminders': return app.reminderManager?.reminders || [];
                case 'incomings': return app.incomingManager?.incomings || [];
                case 'incoming_senders': return app.incomingManager?.senders || [];
                default: return [];
            }
        } catch (e) {
            console.warn(`[SyncManager] _getTableData hiba a ${table} táblánál:`, e);
            return [];
        }
    }

    /**
     * Függő változtatások részletes listája
     */
    getPendingDetails() {
        return this.service?.offline?.getPendingDetails?.() || {};
    }

    /**
     * Queue státusz lekérése (ha van queue)
     */
    getQueueStatus() {
        if (this.service && typeof this.service.getQueueStatus === 'function') {
            return this.service.getQueueStatus();
        }
        return {
            total: 0,
            pending: 0,
            processing: 0,
            failed: 0,
            done: 0,
            items: [],
            hasPending: false
        };
    }

    /**
     * Queue feldolgozása
     */
    async processQueue() {
        if (this.service && typeof this.service.processQueue === 'function') {
            return this.service.processQueue();
        }
        return { processed: 0, failed: 0 };
    }

    /**
     * Művelet hozzáadása a queue-hoz
     */
    addToQueue(operation, data, table, priority = 'normal') {
        if (this.service && typeof this.service.addToQueue === 'function') {
            return this.service.addToQueue(operation, data, table, priority);
        }
        console.warn('[SyncManager] Queue nem elérhető');
        return null;
    }
}
