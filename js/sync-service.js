// js/sync-service.js - Szinkronizációs szolgáltatás (középréteg)
// Teljes implementáció push(), pull(), sync() metódusokkal

import { CloudSync } from './oop-core.js';
import { generateUUID, isValidUUID } from './uuid-utils.js';
import { SyncReport } from './sync-report.js';

export class SyncService {
    /**
     * Konstruktor - Sync Service inicializálása
     * @param {Object} configManager - Konfiguráció kezelő példány
     * @param {Object} offlineHandler - Offline kezelő példány
     */
    constructor(configManager, offlineHandler) {
        this.config = configManager;
        this.offline = offlineHandler;
        this.cloud = new CloudSync(configManager);
        this.isSyncing = false;
        this.isMuted = false;
        
        // ===== ÚJ: LAST SYNC TIME PERSISTENCE =====
        try {
            const savedTime = localStorage.getItem('hmi_lastSyncTime');
            this.lastSyncTime = savedTime ? new Date(savedTime) : null;
        } catch (e) {
            this.lastSyncTime = null;
        }
        
        this.syncResults = null;
        this.lastReport = null;
        this.currentSyncConflicts = [];
        this.lastSyncConflicts = [];
        this.unresolvedConflicts = []; // ÚJ: Interaktív ütközések listája
        // ===== ÚJ: SYNC QUEUE =====
        this._syncQueue = [];
        this._queueListeners = [];
        this._loadSyncQueue();
    }

    /**
     * Némítás beállítása a fejlesztői generáláshoz
     */
    setMuted(muted) {
        this.isMuted = !!muted;
        console.log(`[SYNC] Szinkronizáció némítva: ${this.isMuted}`);
    }

 // ========================================================
    // === ÚJ: SYNC QUEUE METÓDUSOK ===
    // ========================================================

    /**
     * Sync queue betöltése localStorage-ból
     */
    _loadSyncQueue() {
        try {
            const saved = localStorage.getItem('hmi_syncQueue');
            if (saved) {
                this._syncQueue = JSON.parse(saved);

                // Ha egy korábbi megszakított szinkronizáció miatt beragadt volna 'processing' állapotban,
                // vagy a months tábla hibás customKey-jel került a queue-ba – javítjuk.
                let stateChanged = false;
                this._syncQueue = this._syncQueue.map(item => {
                    let next = item;
                    if (item.status === 'processing') {
                        stateChanged = true;
                        next = { ...next, status: 'pending' };
                    }
                    // Legacy months elemek: customKey 'id' → 'month', payload normalizálás
                    if (item.table === 'months') {
                        const data = item.data;
                        let monthVal = null;
                        if (data && typeof data === 'object') {
                            monthVal = data.month ?? data.id ?? null;
                        } else if (typeof data === 'string') {
                            monthVal = data;
                        }
                        if (monthVal != null && (item.customKey !== 'month' || (data && typeof data === 'object' && data.month == null))) {
                            stateChanged = true;
                            const base = (typeof data === 'object' && data) ? { ...data } : {};
                            delete base.id;
                            base.month = monthVal;
                            next = { ...next, customKey: 'month', data: base };
                        } else if (item.customKey !== 'month') {
                            stateChanged = true;
                            next = { ...next, customKey: 'month' };
                        }
                    }
                    return next;
                });

                if (stateChanged) {
                    try {
                        localStorage.setItem('hmi_syncQueue', JSON.stringify(this._syncQueue));
                    } catch(e) {}
                }

                console.log(`[SYNC] 📋 ${this._syncQueue.length} queue elem betöltve`);
            }
        } catch (e) {
            this._syncQueue = [];
        }
    }

    /**
     * Sync queue mentése localStorage-ba
     */
    _saveSyncQueue() {
        try {
            localStorage.setItem('hmi_syncQueue', JSON.stringify(this._syncQueue));
        } catch (e) {
            console.warn('[SYNC] Queue mentés sikertelen:', e);
        }
        this._notifyQueueListeners();
    }

    /**
     * Művelet hozzáadása a queue-hoz
     */
    addToQueue(operation, data, table, priority = 'normal', customKey = null) {
        if (this.isMuted) {
            return null;
        }

        const resolvedKeyField = customKey || (table === 'months' ? 'month' : 'id');

        // Prevent adding completely invalid data to queue
        if (operation !== 'delete' && (!data || typeof data !== 'object')) {
            if (table === 'months' && typeof data === 'string') {
                data = { month: data, updated_at: new Date().toISOString() };
            } else {
                console.error(`[SYNC] Megszakítva: Érvénytelen adat a queue-hoz (${table}):`, data);
                return null;
            }
        }

        const keyValue = typeof data === 'object' && data !== null ? (data[resolvedKeyField] || data.month || data.id) : data;
        const existingIndex = keyValue ? this._syncQueue.findIndex(i => i.table === table && (i.data[resolvedKeyField] === keyValue || i.data.month === keyValue || i.data.id === keyValue)) : -1;
        if (existingIndex !== -1) {
            this._syncQueue[existingIndex] = {
                ...this._syncQueue[existingIndex],
                operation,
                data,
                customKey: resolvedKeyField,
                priority,
                timestamp: new Date().toISOString(),
                status: 'pending',
                retryCount: 0
            };
            this._saveSyncQueue();
            return this._syncQueue[existingIndex];
        }

        const item = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            operation, // 'create', 'update', 'delete'
            table,
            data,
            customKey: resolvedKeyField,
            priority, // 'high', 'normal', 'low'
            timestamp: new Date().toISOString(),
            retryCount: 0,
            status: 'pending' // 'pending', 'processing', 'done', 'failed'
        };
        
        // Priority szerint rendezés (high elöl)
        if (priority === 'high') {
            this._syncQueue.unshift(item);
        } else {
            this._syncQueue.push(item);
        }
        
        this._saveSyncQueue();
        console.log(`[SYNC] 📥 Queue: ${operation} ${table} (${this._syncQueue.length} total)`);
        return item;
    }

    /**
     * Queue elemének frissítése
     */
    updateQueueItem(id, updates) {
        const index = this._syncQueue.findIndex(item => item.id === id);
        if (index === -1) return;
        
        this._syncQueue[index] = { ...this._syncQueue[index], ...updates };
        this._saveSyncQueue();
    }

    /**
     * Queue elem eltávolítása
     */
    removeFromQueue(id) {
        this._syncQueue = this._syncQueue.filter(item => item.id !== id);
        this._saveSyncQueue();
    }

    /**
     * Teljes queue kiürítése
     */
    clearQueue() {
        this._syncQueue = [];
        this._saveSyncQueue();
    }

    /**
     * Queue státusz lekérése
     */
    getQueueStatus() {
        const pending = this._syncQueue.filter(item => item.status === 'pending').length;
        const processing = this._syncQueue.filter(item => item.status === 'processing').length;
        const failed = this._syncQueue.filter(item => item.status === 'failed').length;
        const done = this._syncQueue.filter(item => item.status === 'done').length;
        
        return {
            total: this._syncQueue.length,
            pending,
            processing,
            failed,
            done,
            items: this._syncQueue,
            hasPending: pending > 0 || processing > 0 || failed > 0
        };
    }

    /**
     * Queue változás figyelők
     */
    onQueueChange(callback) {
        this._queueListeners.push(callback);
        // Azonnal meghívjuk az aktuális állapottal
        callback(this.getQueueStatus());
        return () => {
            this._queueListeners = this._queueListeners.filter(cb => cb !== callback);
        };
    }

    _notifyQueueListeners() {
        const status = this.getQueueStatus();
        this._queueListeners.forEach(cb => {
            try {
                cb(status);
            } catch (e) {
                console.warn('[SYNC] Queue listener hiba:', e);
            }
        });
    }

    /**
     * Queue feldolgozása (online állapotban)
     * @param {boolean} fromSync - A szinkronizációs folyamatból hívták-e
     * @param {Set<string>|null} failedTables - A pull során meghiúsult táblák halmaza
     */
    async processQueue(fromSync = false, failedTables = null) {
        if (this.isSyncing && !fromSync) {
            console.log('[SYNC] Már fut szinkronizáció, queue feldolgozás később');
            return { processed: 0, succeeded: 0, failed: 0, pending: this._syncQueue.length };
        }

        const pending = this._syncQueue.filter(item => item.status === 'pending' || item.status === 'failed');
        if (pending.length === 0) {
            return { processed: 0, succeeded: 0, failed: 0, pending: 0 };
        }

        console.log(`[SYNC] 🔄 Queue feldolgozása: ${pending.length} elem`);

        let processed = 0;
        let succeeded = 0;
        let failed = 0;

        for (const item of pending) {
            if (failedTables && failedTables.has(item.table)) {
                console.log(`[SYNC] Queue elem (${item.table}) kihagyva a feldolgozásból, mert a tábla pull-ja meghiúsult.`);
                continue;
            }

            // Állapot frissítés
            this.updateQueueItem(item.id, { status: 'processing' });
            processed++;

            try {
                // Művelet végrehajtása
                const result = await this._executeQueueItem(item);
                
                if (result.success) {
                    this.updateQueueItem(item.id, { status: 'done' });
                    succeeded++;
                } else if (result.unrecoverable) {
                    console.warn(`[SYNC] Javíthatatlan hiba (${result.error}), elem eldobása a queue-ból.`);
                    this.updateQueueItem(item.id, { status: 'done' }); // done-ra állítjuk, hogy kikerüljön
                    failed++;
                } else {
                    item.retryCount++;
                    if (item.retryCount >= 3) {
                        this.updateQueueItem(item.id, { status: 'failed' });
                        failed++;
                    } else {
                        this.updateQueueItem(item.id, { status: 'pending', retryCount: item.retryCount });
                    }
                    failed++;
                }
            } catch (e) {
                console.warn(`[SYNC] Queue item hiba:`, e);
                item.retryCount++;
                if (item.retryCount >= 3) {
                    this.updateQueueItem(item.id, { status: 'failed' });
                    failed++;
                } else {
                    this.updateQueueItem(item.id, { status: 'pending', retryCount: item.retryCount });
                }
                failed++;
            }
        }

        // Sikeres elemek eltávolítása
        this._syncQueue = this._syncQueue.filter(item => item.status !== 'done');
        this._saveSyncQueue();

        const remainingPending = this._syncQueue.filter(item => item.status === 'pending' || item.status === 'failed').length;

        console.log(`[SYNC] ✅ Queue feldolgozva: ${succeeded} sikeres, ${failed} sikertelen`);
        return { processed, succeeded, failed, pending: remainingPending };
    }

    /**
     * Queue elem végrehajtása
     */
    async _executeQueueItem(item) {
        const { operation, table } = item;
        let { data } = item;
        
        // CloudSync használata a tényleges művelethez
        if (!this.cloud?.client) {
            return { success: false, error: 'Nincs felhő kapcsolat' };
        }

        const customKey = item.customKey || (table === 'months' ? 'month' : 'id');
        
        // Auto-fix invalid data
        if (operation !== 'delete' && (!data || typeof data !== 'object')) {
            if (table === 'months' && typeof data === 'string') {
                data = { month: data, updated_at: new Date().toISOString() };
            } else {
                return { success: false, error: 'Érvénytelen adat az upsert művelethez', unrecoverable: true };
            }
        }

        try {
            if (operation === 'delete') {
                await this.cloud?.delete(table, data, customKey);
            } else {
                await this.cloud?.upsert(table, data, customKey);
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Függő változtatások átalakítása queue elemekké (kompatibilitás)
     */
    convertPendingToQueue() {
        if (!this.offline) return 0;
        
        let converted = 0;
        const pending = this.offline.pendingChanges;
        
        for (const table in pending) {
            const changes = pending[table];
            if (changes.length === 0) continue;
            
            for (const change of changes) {
                const operation = change.operation === 'delete' ? 'delete' : 'update';
                this.addToQueue(operation, change.data, table, 'high');
                converted++;
            }
            // Ürítjük a pending-et
            pending[table] = [];
        }
        
        if (typeof this.offline?._saveToStorage === 'function') {
            this.offline._saveToStorage();
        }
        console.log(`[SYNC] 🔄 ${converted} pending változtatás átalakítva queue-vá`);
        return converted;
    }
    
    // ==================== PUSH ====================
    /**
     * Push művelet (offline naplózással)
     */
    /**
     * Push művelet (offline naplózással + queue)
     */
    async push(storeName, data, isDelete = false, customKey = 'id', skipQueueOnError = false) {
        if (this.isMuted) {
            console.log(`[SYNC] Muted, skipping push/queue for table: ${storeName}`);
            return;
        }

        // Auto-fix invalid data BEFORE any operation
        if (!isDelete && (!data || typeof data !== 'object')) {
            if (storeName === 'months' && typeof data === 'string') {
                data = { month: data, updated_at: new Date().toISOString() };
            } else {
                console.error(`[SYNC] Megszakítva: Érvénytelen adat az upsert/push művelethez (${storeName}):`, data);
                return;
            }
        }

        // Offline ellenőrzés
        if (!navigator.onLine) {
            console.log(`[SYNC] Offline, változtatás queue-ba: ${storeName}`);
            const operation = isDelete ? 'delete' : 'update';
            if (!skipQueueOnError) this.addToQueue(operation, data, storeName, 'high', customKey);
            return;
        }

        if (!this.cloud?.client || !this.config.useSupabase) {
            // Ha nincs felhő, queue-ba tesszük
            const operation = isDelete ? 'delete' : 'update';
            if (!skipQueueOnError) this.addToQueue(operation, data, storeName, 'normal', customKey);
            return;
        }

        try {
            if (isDelete) {
                await this.cloud?.delete(storeName, data, customKey);
            } else {
                await this.cloud?.upsert(storeName, data, customKey);
            }
            console.log(`[SYNC] ${storeName} push successful`);
        } catch (err) {
            console.warn('[SYNC] Sync error, data preserved locally:', err);
            const operation = isDelete ? 'delete' : 'update';
            if (!skipQueueOnError) {
                this.addToQueue(operation, data, storeName, 'high', customKey);
            }
            throw err;
        }
    }

    /**
     * Pull művelet (letöltés felhőből) - párhuzamosítva és timeout-tal védve
     */
    async pull(storeName) {
        if (!this.cloud?.client || !this.config.useSupabase) return [];
        
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

        try {
            if (storeName === 'all') {
                const results = {};
                const tables = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works', 'deleted_records'];
                
                // Párhuzamos lekérdezés minden táblára, 4 mp-es timeouttal
                await Promise.all(
                    tables.map(async (table) => {
                        const data = await withTimeout(this.cloud?.pull(table), 4000);
                        results[table] = data || [];
                    })
                );
                return results;
            }
            return await withTimeout(this.cloud?.pull(storeName), 4000);
        } catch (err) {
            console.warn(`[SYNC] Pull hiba a(z) ${storeName} táblánál:`, err);
            throw err;
        }
    }

    /**
     * Hibás (prefixelt) tombstone rekordok azonosítóinak migrálása érvényes UUID-ra
     */
    async _migrateInvalidTombstones() {
        try {
            const app = this._getApp();
            if (!app || !app.db) return;

            const localDeletedRecords = await app.db.getAll('deleted_records');
            if (!localDeletedRecords || localDeletedRecords.length === 0) return;

            let migratedCount = 0;
            for (const record of localDeletedRecords) {
                // Ha az ID nem érvényes UUID (hanem pl. "items_xxxxx")
                if (!isValidUUID(record.id)) {
                    // Töröljük a régit
                    if (typeof app.db._directDelete === 'function') {
                        await app.db._directDelete('deleted_records', record.id);
                    } else if (typeof app.db.delete === 'function') {
                        await app.db.delete('deleted_records', record.id);
                    }

                    // Létrehozunk egy újat érvényes UUID-val
                    const newRecord = {
                        ...record,
                        id: generateUUID()
                    };

                    if (typeof app.db.save === 'function') {
                        await app.db.save('deleted_records', newRecord);
                    } else if (typeof app.db.put === 'function') {
                         await app.db.put('deleted_records', newRecord);
                    }

                    migratedCount++;
                }
            }
            if (migratedCount > 0) {
                console.log(`[SYNC] 🧹 Migráltunk ${migratedCount} db érvénytelen (prefixelt) tombstone azonosítót UUID-ra.`);
            }
        } catch (err) {
            console.warn('[SYNC] Hiba a tombstone migráció során:', err);
        }
    }

    /**
     * A várakozási sor (queue) egyeztetése a felhőből összefésült (merged) adatokkal.
     * Ha a felhőbeli állapot frissebb volt (cloud wins), a régebbi helyi queue elem elavulttá válik és törlésre kerül.
     */
    _reconcileQueueWithMergeResult(mergedData, failedTables) {
        if (!mergedData || typeof mergedData !== 'object') return;

        let prunedCount = 0;
        this._syncQueue = this._syncQueue.filter(queueItem => {
            const { table, operation, data, customKey } = queueItem;

            // Ha a tábla letöltése (pull) meghiúsult, megőrizzük a queue elemet (nem töröljük)
            if (failedTables && failedTables.has(table)) {
                return true;
            }

            const keyField = customKey || (table === 'months' ? 'month' : 'id');
            const keyValue = typeof data === 'object' && data !== null ? (data[keyField] ?? data.month ?? data.id) : data;

            if (!keyValue) return true;

            const tableMerged = mergedData[table] || [];
            const mergedRecord = tableMerged.find(r => String(r[keyField]) === String(keyValue));

            if (operation === 'create' || operation === 'update') {
                if (mergedRecord) {
                    // Ha a felhő nyert (cloud wins) vagy megegyeznek (identical), a helyi sorban álló módosítás elavult
                    if (mergedRecord._source === 'merged (cloud wins)' || mergedRecord._source === 'merged (identical)') {
                        console.log(`[SYNC] 🧹 Queue elem eltávolítva (${operation} ${table} ${keyValue}): felhő frissebb vagy megegyezik.`);
                        prunedCount++;
                        return false;
                    }
                } else {
                    // Ha a rekord nincs a mergedData-ban, ellenőrizzük, hogy törölve lett-e felhős tombstone által
                    const tombstoneMerged = mergedData.deleted_records || [];
                    const deletedByCloud = tombstoneMerged.some(t => t.table_name === table && String(t.record_id) === String(keyValue));
                    if (deletedByCloud) {
                        console.log(`[SYNC] 🧹 Queue elem eltávolítva (${operation} ${table} ${keyValue}): felhőben törölve lett.`);
                        prunedCount++;
                        return false;
                    }
                }
            }

            return true;
        });

        if (prunedCount > 0) {
            this._saveSyncQueue();
        }
    }

    /**
     * Teljes kétirányú szinkronizáció pull + merge + local save + queue process + push
     * Biztonságos sorrend: PULL -> MERGE -> LOCAL SAVE -> PROCESS QUEUE -> PUSH
     */
    async sync() {
        // === 1. ELLENŐRZÉSEK ===
        if (this.isSyncing) {
            console.log('[SYNC] Már folyamatban van egy szinkronizáció.');
            return { status: 'already_running', message: 'Szinkronizáció már folyamatban van' };
        }

        if (!this.config.useSupabase || !this.cloud?.client) {
            console.warn('[SYNC] Felhő nincs konfigurálva.');
            return { status: 'error', message: 'Felhő nincs konfigurálva' };
        }

        if (!navigator.onLine) {
            console.warn('[SYNC] Nincs internetkapcsolat.');
            // Queue feldolgozás offline nem lehetséges
            return { status: 'offline', message: 'Nincs internetkapcsolat' };
        }

        this.isSyncing = true;
        console.log('[SYNC] 🔄 Teljes szinkronizáció indul...');

        const syncStartTime = new Date().toISOString();
        const results = {
            status: 'success',
            startTime: syncStartTime,
            tables: {},
            pendingProcessed: 0,
            queueProcessed: 0,
            queueSucceeded: 0,
            queueFailed: 0,
            queuePending: 0,
            errors: [],
            checkpointUpdated: false
        };

        try {
            // === 1.5. HIBÁS TOMBSTONE-OK MIGRÁLÁSA & LEGACY PENDING ATALAKÍTÁSA ===
            await this._migrateInvalidTombstones();
            this.convertPendingToQueue();

            if (this.offline) {
                const pendingCount = this.offline.getPendingCount();
                if (pendingCount > 0) {
                    console.log(`[SYNC] 📦 ${pendingCount} függő változtatás feldolgozása...`);
                    const processed = await this.offline.processPendingChanges();
                    results.pendingProcessed = processed;
                }
            }

            // === 2. PULL: ADATOK LETÖLTÉSE A FELHŐBŐL ===
            console.log('[SYNC] ⬇️ Pull: Adatok letöltése a felhőből...');
            const tables = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works', 'deleted_records'];
            const cloudData = {};
            const failedTables = new Set();

            for (const table of tables) {
                try {
                    const data = await this.pull(table);
                    cloudData[table] = data;
                    results.tables[table] = { pulled: data.length };
                    console.log(`[SYNC] ✅ ${table}: ${data.length} elem letöltve`);
                } catch (err) {
                    console.warn(`[SYNC] ⚠️ Pull hiba a ${table} táblánál:`, err);
                    results.tables[table] = { pulled: 0, error: err.message };
                    results.errors.push({ table, operation: 'pull', error: err.message });
                    failedTables.add(table);
                }
            }

            // === 5. MERGE: ADATOK ÖSSZEFÉSÜLÉSE ===
            console.log('[SYNC] 🔀 Merge: Adatok összefésülése...');
            
            const app = this._getApp();
            const localDeletedRecords = app && app.db ? await app.db.getAll('deleted_records') : [];

            const localData = {
                items: this._getLocalData('items'),
                months: this._getLocalData('months'),
                entries: this._getLocalData('entries'),
                templates: this._getLocalData('templates'),
                reminders: this._getLocalData('reminders'),
                incomings: this._getLocalData('incomings'),
                incoming_senders: this._getLocalData('incoming_senders'),
                works: this._getLocalData('works'),
                deleted_records: localDeletedRecords
            };

            const mergedData = {};
            let mergedCount = 0;
            this.currentSyncConflicts = [];
            this.unresolvedConflicts = []; // Kezdjük tiszta lappal

            for (const table of tables) {
                if (failedTables.has(table)) {
                    console.warn(`[SYNC] ⚠️ ${table} tábla kihagyva a merge-ből, mert a pull meghiúsult.`);
                    continue;
                }
                const local = localData[table] || [];
                const cloud = cloudData[table] || [];
                
                const merged = this._mergeTable(local, cloud, table);
                mergedData[table] = merged;
                mergedCount += merged.length;
                
                results.tables[table].merged = merged.length;
                console.log(`[SYNC] 🔀 ${table}: ${local.length} helyi + ${cloud.length} felhő → ${merged.length} merged`);
            }

            // === 5.1. INTERAKTÍV ÜTKÖZÉSEK KEZELÉSE ===
            if (this.unresolvedConflicts.length > 0) {
                console.log(`[SYNC] ⚠️ ${this.unresolvedConflicts.length} interaktív feloldásra váró ütközés detektálva!`);
                try {
                    const resolutions = await this._showConflictResolutionModal(this.unresolvedConflicts);
                    this._applyConflictResolutions(mergedData, resolutions);
                } catch (err) {
                    console.warn('[SYNC] Szinkronizáció megszakítva ütközésfeloldás közben:', err);
                    throw err; // Visszaadjuk a hibaüzenetet az UI-nak
                }
            }

            // === 5.2. TOMBSTONE TÖRLÉSEK ALKALMAZÁSA ===
            const mergedTombstones = mergedData.deleted_records || [];
            console.log(`[SYNC] 🧹 ${mergedTombstones.length} tombstone rekord feldolgozása...`);
            for (const tombstone of mergedTombstones) {
                const targetTable = tombstone.table_name;
                const targetId = tombstone.record_id;
                
                if (targetTable && targetId && targetTable !== 'deleted_records') {
                    if (failedTables.has(targetTable)) {
                        console.warn(`[SYNC] ⚠️ Tombstone kihagyva a(z) ${targetTable}/${targetId} rekordnál, mert a(z) ${targetTable} tábla letöltése meghiúsult.`);
                        continue;
                    }

                    const keyField = targetTable === 'months' ? 'month' : 'id';
                    
                    // Kiszűrjük a mergedData-ból
                    if (mergedData[targetTable]) {
                        mergedData[targetTable] = mergedData[targetTable].filter(item => String(item[keyField]) !== String(targetId));
                    }
                    
                    // Fizikailag töröljük a helyi IndexedDB-ből is
                    try {
                        const key = (targetTable === 'months') ? targetId : (isNaN(Number(targetId)) ? targetId : Number(targetId));
                        if (app && app.db) {
                            await app.db._directDelete(targetTable, key);
                        }
                    } catch (e) {
                        console.warn(`[SYNC] Hiba a tombstone fizikai törlése közben: ${targetTable} / ${targetId}`, e);
                    }

                    // Felhőbeli törlés: NE azonnali cloud.delete (korrupt tombstone → adatvesztés).
                    // Helyette high-priority queue elem – a processQueue kezeli, újrapróbálható, deduplikált.
                    // Csak akkor, ha van felhő kliens; a dedupe az addToQueue-ban történik.
                    if (this.cloud?.client) {
                        try {
                            const deletePayload = targetTable === 'months'
                                ? { month: targetId }
                                : { id: targetId };
                            this.addToQueue('delete', deletePayload, targetTable, 'high', keyField);
                        } catch (e) {
                            console.warn(`[SYNC] Hiba a tombstone felhő-törlés queue-ba írása közben (${targetTable}/${targetId}):`, e);
                        }
                    }
                }
            }

            this.lastSyncConflicts = [...this.currentSyncConflicts];


            // === 5.5. APP_SETTINGS SZINKRONIZÁCIÓ ===
            console.log('[SYNC] ⚙️ Beállítások szinkronizálása...');
            try {
                // Helyi beállítások JSON
                const localSettings = {
                    appearance_dark_mode: localStorage.getItem('appearance_dark_mode') || 'false',
                    appearance_bg_theme: localStorage.getItem('appearance_bg_theme') || 'white',
                    ai_api_key: localStorage.getItem('ai_api_key') || '',
                    ai_model: localStorage.getItem('ai_model') || 'gemini-3.5-flash',
                    default_eur_rate: localStorage.getItem('default_eur_rate') || '400',
                    use_live_eur: localStorage.getItem('use_live_eur') || 'true',
                    work_view_mode: localStorage.getItem('work_view_mode') || 'table',
                    settings_updated_at: localStorage.getItem('settings_updated_at') || '1970-01-01T00:00:00.000Z'
                };
                
                const cloudSettingsData = await this.cloud?.pull('app_settings');
                const cloudSettingsRow = cloudSettingsData && cloudSettingsData.find(s => s.id === 'user_settings');
                
                let shouldPush = false;
                if (!cloudSettingsRow) {
                    shouldPush = true;
                } else {
                    const cloudSettings = cloudSettingsRow.settings_json || {};
                    const localTime = new Date(localSettings.settings_updated_at).getTime();
                    const cloudTime = new Date(cloudSettingsRow.updated_at).getTime();
                    
                    if (cloudTime > localTime) {
                        console.log('[SYNC] ☁️ Felhő beállítások frissebbek, helyi felülírása...');
                        if (cloudSettings.appearance_dark_mode !== undefined) localStorage.setItem('appearance_dark_mode', cloudSettings.appearance_dark_mode);
                        if (cloudSettings.appearance_bg_theme !== undefined) localStorage.setItem('appearance_bg_theme', cloudSettings.appearance_bg_theme);
                        if (cloudSettings.ai_api_key !== undefined) localStorage.setItem('ai_api_key', cloudSettings.ai_api_key);
                        if (cloudSettings.ai_model !== undefined) localStorage.setItem('ai_model', cloudSettings.ai_model);
                        if (cloudSettings.default_eur_rate !== undefined) localStorage.setItem('default_eur_rate', String(cloudSettings.default_eur_rate));
                        if (cloudSettings.use_live_eur !== undefined) localStorage.setItem('use_live_eur', String(cloudSettings.use_live_eur));
                        if (cloudSettings.work_view_mode !== undefined) localStorage.setItem('work_view_mode', cloudSettings.work_view_mode);
                        localStorage.setItem('settings_updated_at', cloudSettingsRow.updated_at);
                        
                        // Frissítjük az aktív konfigurációkat
                        const app = this._getApp();
                        if (app && app.config) {
                            app.config.aiConfig = {
                                apiKey: cloudSettings.ai_api_key || '',
                                model: cloudSettings.ai_model || 'gemini-3.5-flash'
                            };
                            app.config.defaultEurRate = parseFloat(cloudSettings.default_eur_rate) || 400;
                            app.config.useLiveEur = cloudSettings.use_live_eur !== 'false';
                        }
                        
                        // Kényszerítsük az UI frissítését, ha a dark mode / bg theme változott
                        if (app && app.ui) {
                            if (app.ui.initAppearanceSettings) app.ui.initAppearanceSettings();
                            if (app.ui.populateSettingsForm) app.ui.populateSettingsForm();
                        }
                    } else if (localTime > cloudTime) {
                        console.log('[SYNC] 📱 Helyi beállítások frissebbek, felhő felülírása...');
                        shouldPush = true;
                    }
                }
                
                if (shouldPush) {
                    await this.cloud?.upsert('app_settings', {
                        id: 'user_settings',
                        settings_json: localSettings,
                        updated_at: localSettings.settings_updated_at === '1970-01-01T00:00:00.000Z' ? new Date().toISOString() : localSettings.settings_updated_at
                    }, 'id');
                }
                
            } catch (err) {
                console.warn('[SYNC] ⚠️ Beállítások szinkronizálása sikertelen (lehet, hogy az app_settings tábla nem létezik még?):', err);
                results.errors.push({ table: 'app_settings', operation: 'settings', error: err.message });
            }

            // === 6. SZELEKTÍV HELYI FRISSÍTÉS (Save Local): CSAK az új/frissebb felhőbeli adatokat mentjük! ===
            console.log('[SYNC] 💾 Szelektív Helyi adatbázis frissítése...');
            await this._saveMergedToLocal(mergedData);

            // === 7. MEMÓRIA ÉS UI FRISSÍTÉS ===
            console.log('[SYNC] 🔄 Memória és UI frissítése...');
            await this._reloadAndRender();

            // === 8. QUEUE EGYEZTETÉS ÉS FELDOLGOZÁS (PUSH) ===
            console.log('[SYNC] 📋 Queue egyeztetése és feldolgozása (Push)...');
            this._reconcileQueueWithMergeResult(mergedData, failedTables);

            const queueResult = await this.processQueue(true, failedTables);
            results.queueProcessed = queueResult.processed;
            results.queueSucceeded = queueResult.succeeded;
            results.queueFailed = queueResult.failed;
            results.queuePending = queueResult.pending;
            if (queueResult.failed > 0) {
                results.errors.push({ operation: 'queue', error: `${queueResult.failed} elem sikertelen` });
            }

            // === 8.5. SZELEKTÍV FELTÖLTÉS (Push): CSAK a helyben módosult/új adatokat töltjük fel! ===
            console.log('[SYNC] ⬆️ Szelektív Push: CSAK a helyben módosult vagy új adatok feltöltése...');
            
            for (const table of tables) {
                if (failedTables.has(table)) continue;
                const items = mergedData[table] || [];
                if (items.length === 0) continue;

                // Csak azokat töltjük fel, amelyek forrása 'local' vagy 'merged (local wins)'
                const toPush = items.filter(item => item._source === 'local' || item._source === 'merged (local wins)');

                let pushedCount = 0;
                for (const item of toPush) {
                    try {
                        // Letisztítjuk a belső metaadatokat a felhőbe küldés előtt
                        const { _source, _updated_at, ...cleanItem } = item;
                        const customKey = table === 'months' ? 'month' : 'id';
                        await this.push(table, cleanItem, false, customKey, true);
                        pushedCount++;
                    } catch (err) {
                        console.warn(`[SYNC] ⚠️ Push hiba a(z) ${table} táblánál:`, err);
                        results.errors.push({ table, operation: 'push', error: err.message });
                    }
                }
                results.tables[table].pushed = pushedCount;
                console.log(`[SYNC] ✅ ${table}: ${pushedCount} új/módosult elem feltöltve a felhőbe (összesen vizsgált: ${items.length})`);
            }

            // === 9. BEFEJEZÉS ===
            const isFullSuccess = results.errors.length === 0;
            const completionTime = new Date();

            results.checkpointUpdated = false;

            if (isFullSuccess) {
                try {
                    localStorage.setItem('hmi_lastSyncTime', completionTime.toISOString());
                    this.lastSyncTime = completionTime;
                    results.checkpointUpdated = true;
                } catch (e) {
                    console.warn('[SYNC] Nem sikerült elmenteni a hmi_lastSyncTime-ot:', e);
                    results.checkpointUpdated = false;
                    results.errors.push({ table: 'sync', operation: 'checkpoint', error: e.message || 'Nem sikerült elmenteni a hmi_lastSyncTime értéket.' });
                }
            } else {
                console.warn(`[SYNC] ⚠️ Szinkronizáció befejeződött, de ${results.errors.length} hiba történt. "lastSyncTime" nem került frissítésre.`);
            }

            results.endTime = completionTime.toISOString();
            results.duration = (new Date(results.endTime) - new Date(results.startTime)) / 1000 + 's';
            
            console.log(`[SYNC] ${isFullSuccess ? '✅ Szinkronizáció befejezve' : '⚠️ Részleges szinkronizáció befejezve'} (${results.duration})`);
            console.log('[SYNC] 📊 Eredmények:', results);

            this.syncResults = results;

            // === 10. REPORT ES EVENT LOG GENERÁLÁS ===
            const report = SyncReport.fromResults(results, this);
            this.lastReport = report;
            results.report = report;

            const appInstance = this._getApp();
            if (appInstance?.logger) {
                const logLevel = report.status === 'success' ? 'info' : 'warn';
                appInstance.logger.log('sync', logLevel, report.toEventLogSummary());
            }
            
            // Queue értesítés
            this._notifyQueueListeners();
            
            return results;

        } catch (error) {
            console.error('[SYNC] ❌ Kritikus hiba:', error);
            results.status = 'error';
            results.error = error.message;
            this.syncResults = results;

            const report = SyncReport.fromCriticalError(error, syncStartTime, this);
            this.lastReport = report;
            results.report = report;

            const appInstance = this._getApp();
            if (appInstance?.logger) {
                appInstance.logger.log('sync', 'error', report.toEventLogSummary());
            }

            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    // ==================== SEGÉDFÜGGVÉNYEK ====================

    /**
     * Helyi adatok lekérése a manager-ekből
     */
    _getLocalData(table) {
        const app = this._getApp();
        if (!app) return [];

        switch (table) {
            case 'items': return app.items?.items || [];
            case 'months': return app.months?.months?.map(m => ({ month: m })) || [];
            case 'entries': return app.entries?.entries || [];
            case 'templates': return app.templates?.templates || [];
            case 'reminders': return app.reminderManager?.reminders || [];
            case 'incomings': return app.incomingManager?.incomings || [];
            case 'incoming_senders': return app.incomingManager?.senders || [];
            case 'works': return app.workLogManager?.works || [];
            default: return [];
        }
    }

    /**
     * App referenciát szerzünk (több útvonalon)
     */
    _getApp() {
        return window.app || this._app || null;
    }

    /**
     * App referencia beállítása (kívülről)
     */
    setApp(app) {
        this._app = app;
    }

    /**
     * Két tábla összefésülése (időbélyeg alapján)
     */
    _isRecordDifferent(local, cloud) {
        if (!local || !cloud) return local !== cloud;

        const ignoreKeys = ['updated_at', 'timestamp', '_source', '_updated_at', 'id', 'month', 'created_at', 'creator_id'];
        const localKeys = Object.keys(local).filter(k => !ignoreKeys.includes(k) && !k.startsWith('_'));
        const cloudKeys = Object.keys(cloud).filter(k => !ignoreKeys.includes(k) && !k.startsWith('_'));

        const areValuesDifferent = (v1, v2) => {
            if (v1 === v2) return false;
            if ((v1 === null || v1 === undefined) && (v2 === null || v2 === undefined)) return false;
            if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) return true;
            if (typeof v1 === 'object' && typeof v2 === 'object') {
                return JSON.stringify(v1) !== JSON.stringify(v2);
            }
            // Boolean: soha ne keverjük Number/String kényszerítéssel (true vs 1, false vs 0)
            if (typeof v1 === 'boolean' || typeof v2 === 'boolean') {
                return v1 !== v2;
            }
            // Numerikus mezők: 1000 vs "1000" ne legyen hamis diff
            const n1 = Number(v1);
            const n2 = Number(v2);
            const bothNumeric =
                v1 !== '' && v2 !== '' &&
                typeof v1 !== 'boolean' && typeof v2 !== 'boolean' &&
                !isNaN(n1) && !isNaN(n2) &&
                (typeof v1 === 'number' || typeof v2 === 'number' ||
                    (/^-?\d+(\.\d+)?$/.test(String(v1).trim()) && /^-?\d+(\.\d+)?$/.test(String(v2).trim())));
            if (bothNumeric) {
                return n1 !== n2;
            }
            return String(v1) !== String(v2);
        };

        for (const key of localKeys) {
            if (areValuesDifferent(local[key], cloud[key])) {
                return true;
            }
        }

        for (const key of cloudKeys) {
            if (areValuesDifferent(local[key], cloud[key])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Két tábla összefésülése (időbélyeg alapján)
     */
    _mergeTable(localItems, cloudItems, table) {
        const merged = [];
        const keyMap = {};
        const keyField = table === 'months' ? 'month' : 'id';

        // Helyi adatok betöltése
        localItems.forEach(item => {
            const key = item[keyField];
            if (key !== undefined && key !== null) {
                keyMap[key] = { 
                    ...item, 
                    _source: 'local',
                    _updated_at: item.updated_at || item.timestamp || new Date().toISOString()
                };
            }
        });

        // Felhő adatok összefésülése (frissebb nyer)
        cloudItems.forEach(item => {
            const key = item[keyField];
            if (key === undefined || key === null) return;

            if (keyMap[key]) {
                const isDiff = this._isRecordDifferent(keyMap[key], item);
                const localTime = new Date(keyMap[key]._updated_at || 0);
                const cloudTime = new Date(item.updated_at || item.timestamp || 0);

                if (isDiff) {
                    const label = keyMap[key].name || keyMap[key].item || keyMap[key].comment || key;
                    const resLabel = cloudTime > localTime ? 'Felhő nyert (frissebb)' : 'Helyi nyert (frissebb)';
                    
                    // Valódi ütközés: Mindkét fél módosított az utolsó sikeres szinkron óta, és a tábla nem a deleted_records
                    const isRealConflict = this.lastSyncTime && 
                                           (localTime > this.lastSyncTime) && 
                                           (cloudTime > this.lastSyncTime) &&
                                           table !== 'deleted_records';

                    if (isRealConflict) {
                        if (!this.unresolvedConflicts) {
                            this.unresolvedConflicts = [];
                        }
                        this.unresolvedConflicts.push({
                            table,
                            key,
                            label,
                            localItem: { ...keyMap[key] },
                            cloudItem: { ...item },
                            localTime: localTime.toISOString(),
                            cloudTime: cloudTime.toISOString(),
                            resolvedValue: null
                        });
                    } else {
                        const app = this._getApp();
                        if (app?.logger) {
                            app.logger.log('sync', 'info', `Adat frissítve a(z) '${table}' táblában (${label}). Helyi: ${localTime.toLocaleTimeString('hu-HU')} vs Felhő: ${cloudTime.toLocaleTimeString('hu-HU')} -> ${resLabel}`);
                        }
                    }
                }

                if (cloudTime > localTime) {
                    // Felhő frissebb → felülírjuk a helyit
                    keyMap[key] = { 
                        ...item, 
                        _source: 'merged (cloud wins)', 
                        _updated_at: item.updated_at || new Date().toISOString()
                    };
                } else if (cloudTime < localTime) {
                    // Helyi frissebb → megtartjuk a helyit
                    keyMap[key]._source = 'merged (local wins)';
                } else {
                    // Megegyező timestamp → nincs teendő
                    keyMap[key]._source = 'merged (identical)';
                }
            } else {
                // Nincs helyi → felhőből jön
                keyMap[key] = { 
                    ...item, 
                    _source: 'merged (from cloud)',
                    _updated_at: item.updated_at || new Date().toISOString()
                };
            }
        });

        // Map-ből tömb (belső mezőket megtartjuk a szelektív szinkronizációhoz)
        for (const key in keyMap) {
            merged.push(keyMap[key]);
        }

        return merged;
    }

    /**
     * Merged adatok mentése a helyi IndexedDB-be
     */
    async _saveMergedToLocal(mergedData) {
        const app = this._getApp();
        if (!app || !app.db) return;
        if (!mergedData || typeof mergedData !== 'object') return;

        const tableDefs = [
            { name: 'items', key: 'id' },
            { name: 'months', key: 'month' },
            { name: 'entries', key: 'id' },
            { name: 'templates', key: 'id' },
            { name: 'reminders', key: 'id' },
            { name: 'incomings', key: 'id' },
            { name: 'incoming_senders', key: 'id' },
            { name: 'works', key: 'id' }
        ];

        for (const { name, key: keyField } of tableDefs) {
            // KRITIKUS: csak a mergedData-ban explicit szereplő táblákat érintjük.
            // Részleges mergedData (pl. csak items) NEM ürítheti a többi táblát.
            if (!Object.prototype.hasOwnProperty.call(mergedData, name)) {
                continue;
            }

            const data = Array.isArray(mergedData[name]) ? mergedData[name] : [];

            // 1. Purge: CSAK ha van legalább egy merge-elt rekord.
            // Üres tömb → NE töröljünk mindent (pull hiba / üres memória esetén adatvesztés lenne).
            // A tombstone path már elvégzi a célzott _directDelete-et.
            if (data.length > 0) {
                const mergedKeySet = new Set(
                    data
                        .map(item => (item != null && item[keyField] != null ? String(item[keyField]) : null))
                        .filter(Boolean)
                );

                try {
                    const existingLocal = await app.db.getAll(name) || [];
                    for (const localItem of existingLocal) {
                        const localKey = localItem && localItem[keyField] != null
                            ? String(localItem[keyField])
                            : null;
                        if (localKey && !mergedKeySet.has(localKey)) {
                            console.log(`[SYNC] 🧹 Árva/törölt helyi rekord eltávolítása: ${name} / ${localKey}`);
                            await app.db._directDelete(name, localItem[keyField]);
                        }
                    }
                } catch (e) {
                    console.warn(`[SYNC] Hiba a helyi árva rekordok törlésekor a(z) ${name} táblánál:`, e);
                }
            } else {
                console.log(`[SYNC] ℹ️ ${name}: üres merge eredmény – helyi purge kihagyva (adatvesztés-védelem)`);
            }

            // 2. Mentjük a frissített / új rekordokat
            for (const item of data) {
                try {
                    const { _source, _updated_at, ...cleanItem } = item;

                    if (!cleanItem.updated_at) {
                        cleanItem.updated_at = new Date().toISOString();
                    }
                    await app.db.save(name, cleanItem);
                } catch (e) {
                    console.warn(`[SYNC] Helyi mentési hiba a(z) ${name} táblánál:`, e);
                }
            }
        }
    }

    /**
     * Memória és UI frissítése
     */
    async _reloadAndRender() {
        const app = this._getApp();
        if (!app) return;

        try {
            await Promise.all([
                app.items?.load?.() || Promise.resolve(),
                app.months?.load?.() || Promise.resolve(),
                app.entries?.load?.() || Promise.resolve(),
                app.templates?.load?.() || Promise.resolve(),
                app.reminderManager?.load?.() || Promise.resolve(),
                app.incomingManager?.load?.() || Promise.resolve(),
                app.workLogManager?.load?.() || Promise.resolve()
            ]);

            app.renderer?.renderTable?.();
            app.workLogRenderer?.render?.();
            app.renderer?.renderSummary?.();
            app.remindersRenderer?.renderList?.();
            app.incomingRenderer?.render?.();
            app.refreshAllTabs?.();

            // Ha a charts tab aktív, frissítsük
            if (app.activeTab === 'charts' && app.chartsRenderer) {
                app.chartsRenderer.renderAll(app.currentFilter);
            }

            // Ha a statisztika tab aktív, frissítsük
            if (app.activeTab === 'stats') {
            }

            // Reminder státusz frissítése
            app.updateReminderStatus?.();

        } catch (e) {
            console.warn('[SYNC] UI frissítési hiba:', e);
        }
    }

    // ==================== INFORMÁCIÓS METÓDUSOK ====================

    /**
     * Szinkronizációs státusz lekérése
     */
    getStatus() {
        const app = this._getApp();
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            hasCloud: !!this.cloud?.client,
            useCloud: this.config.useSupabase,
            pendingChanges: this.offline?.getPendingCount?.() || 0,
            hasApp: !!app,
            syncResults: this.syncResults
        };
    }

    /**
     * Utolsó szinkronizációs eredmények
     */
    getLastResults() {
        return this.syncResults;
    }

    /**
     * Utolsó szinkronizációs riport (SyncReport)
     */
    getLastReport() {
        return this.lastReport;
    }

    /**
     * CloudSync újrainicializálása
     */
    reinit() {
        this.cloud?.init();
    }

    /**
     * Pusztán pull művelet (csak letöltés, merge nélkül)
     */
    async pullOnly(table) {
        if (!this.cloud?.client || !this.config.useSupabase) return [];
        
        try {
            const data = await this.cloud?.select(table);
            return data;
        } catch (err) {
            console.warn(`[SYNC] Pull-only error from ${table}:`, err);
            return [];
        }
    }

    /**
     * Pusztán push művelet (csak feltöltés, merge nélkül)
     */
    async pushOnly(table, data) {
        if (!navigator.onLine) {
            console.log(`[SYNC] Offline, push-only naplózva: ${table}`);
            this.offline.addPendingChange(table, 'update', data);
            return;
        }

        if (!this.cloud?.client || !this.config.useSupabase) return;

        try {
            await this.cloud?.upsert(table, data);
            console.log(`[SYNC] Push-only ${table} successful`);
        } catch (err) {
            console.warn('[SYNC] Push-only error:', err);
            this.offline.addPendingChange(table, 'update', data);
            throw err;
        }
    }

    _showConflictResolutionModal(conflicts) {
        return new Promise((resolve, reject) => {
            const modal = document.getElementById('conflictModal');
            if (!modal) {
                console.warn('[SYNC] Conflict modal not found, falling back to LWW');
                resolve(conflicts.map(c => ({ ...c, resolvedValue: c.cloudTime > c.localTime ? 'cloud' : 'local' })));
                return;
            }

            // Populate last sync time
            const timeSpan = document.getElementById('conflictLastSyncTime');
            if (timeSpan) {
                timeSpan.textContent = this.lastSyncTime ? this.lastSyncTime.toLocaleString('hu-HU') : 'ismeretlen';
            }

            // Render conflicts list
            const listContainer = document.getElementById('conflictList');
            if (!listContainer) {
                resolve(conflicts.map(c => ({ ...c, resolvedValue: c.cloudTime > c.localTime ? 'cloud' : 'local' })));
                return;
            }

            listContainer.innerHTML = '';
            
            conflicts.forEach((conflict, idx) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'border border-gray-200 rounded-[20px] p-4 bg-gray-50/50 space-y-3';
                
                const localDateStr = new Date(conflict.localTime).toLocaleString('hu-HU');
                const cloudDateStr = new Date(conflict.cloudTime).toLocaleString('hu-HU');
                const tableNameHu = this._getTableNameHu(conflict.table);
                
                itemDiv.innerHTML = `
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-black uppercase px-2 py-1 bg-amber-100 text-amber-800 rounded-lg">${tableNameHu}</span>
                        <span class="text-[10px] font-mono text-gray-400">ID: ${conflict.key}</span>
                    </div>
                    <div class="font-bold text-gray-800 text-xs">${conflict.label}</div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-xs">
                        <!-- Local choice -->
                        <label class="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-amber-500 cursor-pointer transition">
                            <input type="radio" name="conflict_${idx}" value="local" checked class="mt-0.5 text-amber-500 focus:ring-amber-500">
                            <div class="space-y-1">
                                <span class="font-bold text-indigo-600 block">Helyi verzió</span>
                                <span class="text-[9px] text-gray-400 block">${localDateStr}</span>
                                <span class="text-gray-600 block truncate max-w-[200px]" title='${this._getRecordSummary(conflict.localItem)}'>
                                    ${this._getRecordSummary(conflict.localItem)}
                                </span>
                            </div>
                        </label>
                        
                        <!-- Cloud choice -->
                        <label class="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-amber-500 cursor-pointer transition">
                            <input type="radio" name="conflict_${idx}" value="cloud" class="mt-0.5 text-amber-500 focus:ring-amber-500">
                            <div class="space-y-1">
                                <span class="font-bold text-emerald-600 block">Felhő verzió</span>
                                <span class="text-[9px] text-gray-400 block">${cloudDateStr}</span>
                                <span class="text-gray-600 block truncate max-w-[200px]" title='${this._getRecordSummary(conflict.cloudItem)}'>
                                    ${this._getRecordSummary(conflict.cloudItem)}
                                </span>
                            </div>
                        </label>
                    </div>
                `;
                listContainer.appendChild(itemDiv);
            });

            // Show modal
            modal.classList.remove('hidden');

            const btnKeepAllLocal = document.getElementById('btnKeepAllLocal');
            const btnKeepAllCloud = document.getElementById('btnKeepAllCloud');
            const btnResolveConflicts = document.getElementById('btnResolveConflicts');
            const btnCloseConflictModal = document.getElementById('btnCloseConflictModal');

            const handleKeepAll = (side) => {
                conflicts.forEach((_, idx) => {
                    const radios = document.getElementsByName(`conflict_${idx}`);
                    radios.forEach(r => {
                        if (r.value === side) r.checked = true;
                    });
                });
            };

            const keepLocalHandler = () => handleKeepAll('local');
            const keepCloudHandler = () => handleKeepAll('cloud');
            
            const resolveHandler = () => {
                const resolved = conflicts.map((conflict, idx) => {
                    const radios = document.getElementsByName(`conflict_${idx}`);
                    let chosen = 'local';
                    radios.forEach(r => {
                        if (r.checked) chosen = r.value;
                    });
                    return {
                        ...conflict,
                        resolvedValue: chosen
                    };
                });
                cleanup();
                resolve(resolved);
            };

            const closeHandler = () => {
                cleanup();
                reject(new Error('A felhasználó megszakította a szinkronizációt az ütközések miatt.'));
            };

            const cleanup = () => {
                modal.classList.add('hidden');
                btnKeepAllLocal?.removeEventListener('click', keepLocalHandler);
                btnKeepAllCloud?.removeEventListener('click', keepCloudHandler);
                btnResolveConflicts?.removeEventListener('click', resolveHandler);
                btnCloseConflictModal?.removeEventListener('click', closeHandler);
            };

            btnKeepAllLocal?.addEventListener('click', keepLocalHandler);
            btnKeepAllCloud?.addEventListener('click', keepCloudHandler);
            btnResolveConflicts?.addEventListener('click', resolveHandler);
            btnCloseConflictModal?.addEventListener('click', closeHandler);
        });
    }

    _applyConflictResolutions(mergedData, resolutions) {
        resolutions.forEach(res => {
            const { table, key, resolvedValue, localItem, cloudItem } = res;
            const items = mergedData[table] || [];
            const keyField = table === 'months' ? 'month' : 'id';
            
            const index = items.findIndex(item => item[keyField] === key);
            if (index !== -1) {
                if (resolvedValue === 'local') {
                    items[index] = {
                        ...localItem,
                        _source: 'merged (local wins)',
                        _updated_at: new Date().toISOString()
                    };
                    this.currentSyncConflicts.push({
                        table,
                        key,
                        label: res.label,
                        localTime: res.localTime,
                        cloudTime: res.cloudTime,
                        resolvedBy: 'local',
                        resolution: 'Helyi nyert (felhasználó döntése)'
                    });
                } else {
                    items[index] = {
                        ...cloudItem,
                        _source: 'merged (cloud wins)',
                        _updated_at: new Date().toISOString()
                    };
                    this.currentSyncConflicts.push({
                        table,
                        key,
                        label: res.label,
                        localTime: res.localTime,
                        cloudTime: res.cloudTime,
                        resolvedBy: 'cloud',
                        resolution: 'Felhő nyert (felhasználó döntése)'
                    });
                }
            }
        });
    }

    _getTableNameHu(table) {
        switch (table) {
            case 'entries': return 'Tételek';
            case 'items': return 'Kategóriák';
            case 'months': return 'Hónapok';
            case 'templates': return 'Sablonok';
            case 'reminders': return 'Emlékeztetők';
            case 'incomings': return 'Bejövő utalások';
            case 'incoming_senders': return 'Partnerek';
            case 'works': return 'Munkák';
            default: return table;
        }
    }

    _getRecordSummary(item) {
        if (!item) return '';
        const parts = [];
        if (item.amount !== undefined) parts.push(`${Number(item.amount).toLocaleString('hu-HU')} Ft`);
        if (item.category !== undefined) parts.push(item.category);
        if (item.comment !== undefined && item.comment) parts.push(item.comment);
        if (item.name !== undefined && item.name) parts.push(item.name);
        if (item.title !== undefined && item.title) parts.push(item.title);
        if (item.sender !== undefined && item.sender) parts.push(item.sender);
        return parts.join(' - ') || JSON.stringify(item);
    }
}
