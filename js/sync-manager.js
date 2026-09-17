// js/sync-manager.js - Wrapper a SyncService-hez (kompatibilitás miatt)
// Teljes, javított verzió

export class SyncManager {
    constructor(app) {
        this.app = app;
        this.tables = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works'];
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
     * Kiszámítja az eltéréseket a helyi és a felhő adatok között.
     * Visszaad egy objektumot táblánként a diff-ekkel.
     */
    async getDiffData(mode = 'pull') {
        if (!this.service || !this.service.cloud || !navigator.onLine) {
            throw new Error('Felhő kapcsolat nem elérhető.');
        }

        const diffResult = {};

        for (const table of this.tables) {
            // 1. Felhő adatok lekérése (vagy push esetén is kell az összehasonlításhoz, de mi letöltjük)
            let cloudData = [];
            try {
                if (typeof this.service.cloud.select === 'function') {
                    cloudData = await this.service.cloud.select(table);
                } else if (typeof this.service.pullOnly === 'function') {
                    cloudData = await this.service.pullOnly(table);
                }
            } catch (err) {
                console.warn(`[SyncManager] Nem sikerült lekérni a(z) ${table} adatait a felhőből:`, err);
                continue;
            }

            // 2. Helyi adatok lekérése
            let localData = [];
            try {
                if (typeof this.service._getLocalData === 'function') {
                    localData = await this.service._getLocalData(table);
                } else {
                    localData = await this.app.db.getAll(table) || [];
                }
            } catch (err) {
                console.warn(`[SyncManager] Nem sikerült lekérni a(z) ${table} helyi adatait:`, err);
                continue;
            }

            // 3. Összehasonlítás
            const cloudMap = new Map(cloudData.map(item => [item.id, item]));
            const localMap = new Map(localData.map(item => [item.id, item]));
            const diffs = [];

            // Keresés a felhő adatok között
            for (const [id, cloudItem] of cloudMap) {
                const localItem = localMap.get(id);
                if (!localItem) {
                    diffs.push({ type: 'cloud_only', cloud: cloudItem, local: null });
                } else {
                    const cUpdate = new Date(cloudItem.updated_at || 0).getTime();
                    const lUpdate = new Date(localItem.updated_at || 0).getTime();

                    if (Math.abs(cUpdate - lUpdate) > 1000) { // 1 mp tolerancia
                        diffs.push({ type: 'modified', cloud: cloudItem, local: localItem, cUpdate, lUpdate });
                    }
                }
            }

            // Keresés a csak helyi adatok között
            for (const [id, localItem] of localMap) {
                if (!cloudMap.has(id)) {
                    diffs.push({ type: 'local_only', cloud: null, local: localItem });
                }
            }

            diffResult[table] = {
                cloud: cloudData,
                local: localData,
                diffs: diffs
            };
        }

        return diffResult;
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
     * Szinkronizációs diff generálása (helyi és felhő eltérések lekérése)
     */
    async getSyncDiff() {
        if (!this.service) return { local: [], cloud: [], unavailableTables: [] };

        const localDiff = [];
        const cloudDiff = [];
        const unavailableTables = [];

        try {
            // 1. Felhő adatok lekérése (vagy timeout 4mp után)
            let cloudData = {};
            if (this.service.cloud && typeof this.service.cloud.pull === 'function') {
                for (const table of this.tables) {
                    try {
                        const data = await Promise.race([
                            this.service.cloud.pull(table),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
                        ]);
                        cloudData[table] = data || [];
                    } catch (e) {
                        console.warn(`[SyncManager] getSyncDiff: Hiba a(z) ${table} lekérésekor:`, e);
                        unavailableTables.push(table);
                    }
                }
            }

            // 2. Helyi adatok összeszerelése
            const app = this.app;
            const localData = {};
            for (const table of this.tables) {
                // _getTableData is synchronous and returns an array from memory
                localData[table] = this._getTableData(table, app) || [];
            }

            // Handle deleted records separately if it's not in this.tables
            const localDeletedRecords = app.db ? await app.db.getAll('deleted_records') : [];
            const deletedMap = {};
            localDeletedRecords.forEach(r => {
                if(r.table_name && r.record_id) {
                    if(!deletedMap[r.table_name]) deletedMap[r.table_name] = [];
                    deletedMap[r.table_name].push(String(r.record_id));
                }
            });

            // 3. Összehasonlítás táblánként
            for (const table of this.tables) {
                if (unavailableTables.includes(table)) continue;

                const local = localData[table] || [];
                const cloud = cloudData[table] || [];
                const deletedIds = deletedMap[table] || [];
                const keyField = table === 'months' ? 'month' : 'id';

                // Kulcs alapú map-ek készítése
                const localMap = {};
                local.forEach(item => {
                    if (item[keyField] !== undefined && item[keyField] !== null) {
                        localMap[item[keyField]] = item;
                    }
                });

                const cloudMap = {};
                cloud.forEach(item => {
                    if (item[keyField] !== undefined && item[keyField] !== null) {
                        cloudMap[item[keyField]] = item;
                    }
                });

                // Helyi változások (új vagy módosított) keresése
                for (const key in localMap) {
                    const localItem = localMap[key];
                    const cloudItem = cloudMap[key];
                    const label = localItem.name || localItem.item || localItem.comment || key;

                    if (!cloudItem) {
                        // Új rekord helyben
                        localDiff.push({ table, key, label, type: 'new' });
                    } else if (this.service._isRecordDifferent && this.service._isRecordDifferent(localItem, cloudItem)) {
                        const localTime = new Date(localItem.updated_at || localItem.timestamp || 0);
                        const cloudTime = new Date(cloudItem.updated_at || cloudItem.timestamp || 0);
                        // Ha a helyi frissebb (vagy azonos idő), akkor az egy helyi változás ami megy fel
                        if (localTime >= cloudTime) {
                            localDiff.push({ table, key, label, type: 'modified' });
                        }
                    }
                }

                // Felhő változások (új vagy frissebb módosított) keresése
                for (const key in cloudMap) {
                    const cloudItem = cloudMap[key];
                    const localItem = localMap[key];
                    const label = cloudItem.name || cloudItem.item || cloudItem.comment || key;

                    if (deletedIds.includes(String(key))) {
                         // Szerepel a helyi deleted_records-ban, így ez egy törlés ami fel fog menni
                         localDiff.push({ table, key, label, type: 'deleted' });
                    } else if (!localItem) {
                        // Új rekord a felhőben
                        cloudDiff.push({ table, key, label, type: 'new' });
                    } else if (this.service._isRecordDifferent && this.service._isRecordDifferent(localItem, cloudItem)) {
                        const localTime = new Date(localItem.updated_at || localItem.timestamp || 0);
                        const cloudTime = new Date(cloudItem.updated_at || cloudItem.timestamp || 0);
                        // Ha a felhő frissebb
                        if (cloudTime > localTime) {
                            cloudDiff.push({ table, key, label, type: 'modified' });
                        }
                    }
                }
            }

            return { local: localDiff, cloud: cloudDiff, unavailableTables };
        } catch (e) {
            console.error('[SyncManager] getSyncDiff hiba:', e);
            throw e;
        }
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
            // Delegate to the main sync service which handles table mappings and format normalization (e.g. mapping string arrays to objects)
            if (this.service && typeof this.service._getLocalData === 'function') {
                return this.service._getLocalData(table);
            }
            return [];
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

    /**
     * Szinkronizáció némítása
     */
    setMuted(muted) {
        this.isMuted = !!muted;
        if (this.service && typeof this.service.setMuted === 'function') {
            this.service.setMuted(muted);
        }
    }
}
