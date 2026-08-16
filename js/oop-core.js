// js/oop-core.js - OOP HMI Core Infrastruktúra v5.0 (UUID-alapú IndexedDB)
import { generateUUID } from './uuid-utils.js';
import { useAppStore } from './store.js';
import { parseCellKey, buildCellKey } from './utils/cell-key-utils.js';
export class SecurityManager {
    static async generateChecksum(obj) {
        const { checksum, ...cleanObj } = obj;
        const str = JSON.stringify(cleanObj);
        const msgUint8 = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static validateSchema(storeName, data) {
        if (!data || typeof data !== 'object') return false;
        switch (storeName) {
            case 'entries':
                return (typeof data.cellKey === 'string' || (typeof data.itemId === 'string' && typeof data.month === 'string')) && !isNaN(data.amount);
            case 'items':
                return typeof data.name === 'string' && data.name.trim() !== '';
            case 'months':
                return /^\d{4}-\d{2}$/.test(data.month);
            case 'reminders':
                return typeof data.title === 'string' && !isNaN(data.amount) && typeof data.due_date === 'string';
            case 'incomings':
                return typeof data.sender === 'string' &&
                    data.sender.trim() !== '' &&
                    /^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
                    !isNaN(data.amount);
            case 'incoming_senders':
                return typeof data.id !== 'undefined' &&
                    typeof data.name === 'string' &&
                    data.name.trim() !== '';
            case 'works':
                return typeof data.name === 'string' &&
                    data.name.trim() !== '' &&
                    typeof data.date === 'string';
            case 'plugin_fuel_logs':
                return typeof data.id === 'string' && typeof data.odo === 'number';
            case 'plugin_shopping_list':
                return typeof data.id === 'string' && typeof data.name === 'string';
            case 'plugin_quick_notes':
                return typeof data.id === 'string' && typeof data.title === 'string';
            case 'plugin_mileage_saved_trips':
                return typeof data.id === 'string' && typeof data.dist === 'number';
            case 'plugin_calc_history':
                return typeof data.id === 'string' && typeof data.expr === 'string';
            case 'plugin_calendar_events':
                return typeof data.id === 'string' && typeof data.date === 'string' && typeof data.title === 'string';
            default:
                return true;
        }
    }
}

export class Database {

    _getTempItemId(entry) {
        let tempItemId = entry.itemId;
        if (!tempItemId && entry.cellKey) {
             const parts = entry.cellKey.split('_');
             tempItemId = parts[0];
             if (!/^[0-9]+$/.test(tempItemId) && parts.length >= 2 && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
                  tempItemId = parts[1];
             }
        }
        return tempItemId;
    }

    constructor(dbName = 'KoltsegNyilvantarto', version = 14) {  // ← verzió 14: Calendar plugin table
        let finalDbName = dbName;
        try {
            const path = window.location.pathname;
            const cleanPath = path.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
            if (cleanPath && cleanPath !== 'index.html' && cleanPath !== 'index_html' && cleanPath !== 'src') {
                finalDbName = `${dbName}_${cleanPath}`;
            }
        } catch (e) {
            console.warn('[DB] Nem sikerült egyedi adatbázis nevet generálni:', e);
        }
        this.dbName = finalDbName;
        this.version = version;
        this.db = null;
    }

    _enableMockDb() {
        this.isMock = true;
        this.mockStore = {
            entries: {},
            items: {},
            months: {},
            templates: {},
            reminders: {},
            incomings: {},
            incoming_senders: {},
            deleted_records: {},
            works: {}
        };
        this.mockIdCounter = {};
        console.log('[DB] ℹ️ Memóriabeli adatbázis sikeresen inicializálva.');
    }

    connect() {
        return new Promise((resolve) => {
            // Ellenőrizzük, hogy az IndexedDB egyáltalán létezik-e a window-ban
            if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
                console.warn('[DB] Az IndexedDB nem támogatott ebben a környezetben. Memóriabeli adatbázis mód bekapcsolva.');
                this._enableMockDb();
                return resolve(this);
            }

            try {
                const request = window.indexedDB.open(this.dbName, this.version);
                
                request.onupgradeneeded = (e) => {
                    try {
                        const transaction = e.target.transaction;
                        this._handleUpgrade(e.target.result, e.oldVersion, transaction);
                    } catch (err) {
                        console.error('[DB] Upgrade hiba:', err);
                    }
                };
                
                request.onsuccess = (e) => {
                    this.db = e.target.result;
                    console.log(`[DB] ✅ IndexedDB csatlakoztatva (v${this.version})`);
                    resolve(this);
                };
                
                request.onerror = (e) => {
                    const errObj = e?.target?.error || e || new Error('Ismeretlen adatbázis hiba');
                    console.warn('[DB] Kapcsolódási hiba, áttérés memóriabeli adatbázisra:', errObj);
                    this._enableMockDb();
                    resolve(this); // Mindig resolve-olunk, hogy az alkalmazás el tudjon indulni!
                };
            } catch (err) {
                console.warn('[DB] Kivétel az IndexedDB megnyitásakor, áttérés memóriabeli adatbázisra:', err);
                this._enableMockDb();
                resolve(this); // Mindig resolve-olunk, hogy az alkalmazás el tudjon indulni!
            }
        });
    }

    _handleUpgrade(db, oldVersion, transaction) {
        console.log(`[DB] Upgrade: ${oldVersion} → ${this.version}`);

        // ================================================================
        // v11 UUID MIGRÁCIÓ: Táblák újraépítése autoIncrement nélkül
        // ================================================================
        
        // Segédfüggvény: object store újraépítése UUID-vel
        const _migrateStoreToUUID = (storeName, options = {}) => {
            const { indexes = [], keyPath = 'id' } = options;
            
            if (db.objectStoreNames.contains(storeName) && oldVersion < 11) {
                // Meglévő adatok kiolvasása a tranzakcióból
                const existingStore = transaction.objectStore(storeName);
                const getAllReq = existingStore.getAll();
                
                getAllReq.onsuccess = () => {
                    const existingData = getAllReq.result || [];
                    
                    // Store törlése és újraépítése autoIncrement NÉLKÜL
                    db.deleteObjectStore(storeName);
                    const newStore = db.createObjectStore(storeName, { keyPath });
                    
                    // Indexek létrehozása
                    indexes.forEach(idx => {
                        try {
                            newStore.createIndex(idx.name, idx.keyPath || idx.name, { unique: idx.unique || false });
                        } catch (e) {
                            console.warn(`[DB] Index hiba (${storeName}.${idx.name}):`, e);
                            if (idx.unique) {
                                try { newStore.createIndex(idx.name, idx.keyPath || idx.name, { unique: false }); } catch (e2) {}
                            }
                        }
                    });
                    
                    // Meglévő adatok visszaírása UUID-vel
                    existingData.forEach(record => {
                        if (keyPath === 'id') {
                            // Integer ID → UUID konverzió
                            const oldId = record.id;
                            if (typeof oldId === 'number' || (typeof oldId === 'string' && /^\d+$/.test(oldId))) {
                                record._old_autoincrement_id = oldId;
                                record.id = generateUUID();
                            }
                        }
                        try {
                            newStore.put(record);
                        } catch (e) {
                            console.warn(`[DB] Migráció hiba (${storeName}):`, e, record);
                        }
                    });
                    
                    console.log(`[DB] ${storeName}: ${existingData.length} rekord migrálva UUID-re (v11)`);
                };
                return true; // Migráció indítva
            }
            return false; // Nem volt szükséges
        };

        // === Entries tábla ===
        if (!db.objectStoreNames.contains('entries')) {
            const store = db.createObjectStore('entries', { keyPath: 'id' });
            store.createIndex('cellKey', 'cellKey', { unique: false });
            store.createIndex('updated_at', 'updated_at', { unique: false });
        } else if (oldVersion < 11) {
            _migrateStoreToUUID('entries', {
                indexes: [
                    { name: 'cellKey', unique: false },
                    { name: 'updated_at', unique: false }
                ]
            });
        } else if (transaction) {
            const store = transaction.objectStore('entries');
            try {
                if (store.indexNames.contains('cellKey')) store.deleteIndex('cellKey');
                if (store.indexNames.contains('updated_at')) store.deleteIndex('updated_at');
                store.createIndex('cellKey', 'cellKey', { unique: false });
                store.createIndex('updated_at', 'updated_at', { unique: false });
                console.log('[DB] Entries indexek sikeresen újjáépítve upgrade során');
            } catch (err) {
                console.warn('[DB] Entries index újjáépítési hiba:', err);
            }
        }

        // === Items tábla ===
        if (!db.objectStoreNames.contains('items')) {
            db.createObjectStore('items', { keyPath: 'id' });
        } else if (oldVersion < 11) {
            _migrateStoreToUUID('items');
        }

        // === Months tábla (keyPath: 'month' – nem kell UUID) ===
        if (!db.objectStoreNames.contains('months')) {
            db.createObjectStore('months', { keyPath: 'month' });
        }

        // === Templates tábla ===
        if (!db.objectStoreNames.contains('templates')) {
            db.createObjectStore('templates', { keyPath: 'id' });
        } else if (oldVersion < 11) {
            _migrateStoreToUUID('templates');
        }

        // === Reminders tábla ===
        if (!db.objectStoreNames.contains('reminders')) {
            db.createObjectStore('reminders', { keyPath: 'id' });
        } else if (oldVersion < 11) {
            _migrateStoreToUUID('reminders');
        }

        // === Incomings tábla ===
        if (!db.objectStoreNames.contains('incomings')) {
            const store = db.createObjectStore('incomings', { keyPath: 'id' });
            store.createIndex('sender', 'sender', { unique: false });
            store.createIndex('date', 'date', { unique: false });
            try {
                store.createIndex('sender_date', ['sender', 'date'], { unique: true });
            } catch (e) {
                console.warn('[DB] Duplikált bejövő utalások miatt nem-egyedi indexet hozunk létre a(z) sender_date mezőhöz:', e);
                store.createIndex('sender_date', ['sender', 'date'], { unique: false });
            }
            store.createIndex('updated_at', 'updated_at', { unique: false });
        } else if (oldVersion < 11) {
            _migrateStoreToUUID('incomings', {
                indexes: [
                    { name: 'sender', unique: false },
                    { name: 'date', unique: false },
                    { name: 'sender_date', keyPath: ['sender', 'date'], unique: false },
                    { name: 'updated_at', unique: false }
                ]
            });
        } else if (transaction) {
            const store = transaction.objectStore('incomings');
            try {
                if (store.indexNames.contains('sender')) store.deleteIndex('sender');
                if (store.indexNames.contains('date')) store.deleteIndex('date');
                if (store.indexNames.contains('sender_date')) store.deleteIndex('sender_date');
                if (store.indexNames.contains('updated_at')) store.deleteIndex('updated_at');
                
                store.createIndex('sender', 'sender', { unique: false });
                store.createIndex('date', 'date', { unique: false });
                try {
                    store.createIndex('sender_date', ['sender', 'date'], { unique: true });
                } catch (e) {
                    console.warn('[DB] Nem-egyedi index fallback a sender_date mezőhöz:', e);
                    store.createIndex('sender_date', ['sender', 'date'], { unique: false });
                }
                store.createIndex('updated_at', 'updated_at', { unique: false });
                console.log('[DB] Incomings indexek sikeresen újjáépítve upgrade során');
            } catch (err) {
                console.warn('[DB] Incomings index újjáépítési hiba:', err);
            }
        }

        // === Incoming senders tábla ===
        if (!db.objectStoreNames.contains('incoming_senders')) {
            const store = db.createObjectStore('incoming_senders', { keyPath: 'id' });
            try {
                store.createIndex('name', 'name', { unique: true });
            } catch (e) {
                store.createIndex('name', 'name', { unique: false });
            }
        } else if (transaction) {
            const store = transaction.objectStore('incoming_senders');
            try {
                if (store.indexNames.contains('name')) store.deleteIndex('name');
                try {
                    store.createIndex('name', 'name', { unique: true });
                } catch (e) {
                    store.createIndex('name', 'name', { unique: false });
                }
                console.log('[DB] Incoming senders indexek sikeresen újjáépítve upgrade során');
            } catch (err) {
                console.warn('[DB] Incoming senders index újjáépítési hiba:', err);
            }
        }

        // === deleted_records tábla (v9) ===
        if (!db.objectStoreNames.contains('deleted_records')) {
            db.createObjectStore('deleted_records', { keyPath: 'id' });
            console.log('[DB] deleted_records tábla sikeresen létrehozva (v9)');
        }

        // === works tábla ===
        if (!db.objectStoreNames.contains('works')) {
            db.createObjectStore('works', { keyPath: 'id' });
            console.log('[DB] works tábla sikeresen létrehozva (UUID, v11)');
        } else if (oldVersion < 11) {
            _migrateStoreToUUID('works');
        }


        // === Plugin Tables (v14) ===
        const pluginTables = [
            'plugin_fuel_logs',
            'plugin_shopping_list',
            'plugin_quick_notes',
            'plugin_mileage_saved_trips',
            'plugin_calc_history',
            'plugin_calendar_events'
        ];
        pluginTables.forEach(table => {
            if (!db.objectStoreNames.contains(table)) {
                db.createObjectStore(table, { keyPath: 'id' });
            }
        });

        if (oldVersion < 11) {
            console.log('[DB] ✅ v11 UUID migráció indítva – az összes autoIncrement tábla konvertálva');
        }
    }

    // ================================================================
    // === ADATBÁZIS MŰVELETEK ===
    // ================================================================

    async getByCellKey(cellKeyPrefix) {
        return new Promise((resolve) => {
            if (this.isMock) {
                const results = Object.values(this.mockStore.entries).filter(entry => 
                    entry && entry.cellKey && entry.cellKey.startsWith(cellKeyPrefix)
                );
                return resolve(results);
            }
            if (!this.db) return resolve([]);
            try {
                const tx = this.db.transaction('entries', 'readonly');
                const store = tx.objectStore('entries');
                const index = store.index('cellKey');
                const range = IDBKeyRange.bound(cellKeyPrefix, cellKeyPrefix + '\uffff');
                const req = index.getAll(range);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch (e) {
                console.warn('[DB] getByCellKey hiba:', e);
                resolve([]);
            }
        });
    }

    async getAll(storeName) {
        return new Promise((resolve) => {
            if (this.isMock) {
                const results = Object.values(this.mockStore[storeName] || {});
                return resolve(results);
            }
            if (!this.db) return resolve([]);
            try {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch (e) {
                console.warn(`[DB] getAll(${storeName}) hiba:`, e);
                resolve([]);
            }
        });
    }

    async save(storeName, data) {
        if (!SecurityManager.validateSchema(storeName, data)) {
            return Promise.reject(new Error(`Séma hiba: ${storeName}`));
        }
        if (!data.updated_at) data.updated_at = new Date().toISOString();

        return new Promise((resolve, reject) => {
            if (this.isMock) {
                this.mockStore[storeName] = this.mockStore[storeName] || {};
                
                let key;
                if (storeName === 'months') {
                    key = data.month;
                } else if (storeName === 'incoming_senders') {
                    key = data.id;
                } else {
                    if (!data.id) {
                        data.id = generateUUID();
                    }
                    key = data.id;
                }
                
                this.mockStore[storeName][key] = JSON.parse(JSON.stringify(data));
                return resolve(key);
            }
            if (!this.db) return reject(new Error('Nincs adatbázis kapcsolat!'));
            try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.put(data);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async _directDelete(storeName, key) {
        return new Promise((resolve, reject) => {
            if (this.isMock) {
                if (this.mockStore[storeName]) {
                    delete this.mockStore[storeName][key];
                }
                return resolve();
            }
            if (!this.db) return reject(new Error('Nincs adatbázis kapcsolat!'));
            try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = (e) => reject(e.target.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async delete(storeName, key) {
        const syncService = this.syncService || window.app?.syncService || window.app?.syncManager;
        const isMuted = syncService?.isMuted || syncService?.service?.isMuted;

        // Track deletion in tombstone table
        if (storeName !== 'deleted_records' && !isMuted) {
            try {
                const deletedRecord = {
                    id: `${storeName}_${key}`,
                    record_id: String(key),
                    table_name: storeName,
                    deleted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                await this.save('deleted_records', deletedRecord);
                
                // Track in Sync Queue
                if (syncService) {
                    syncService.addToQueue('delete', { id: key }, storeName, 'high');
                }
            } catch (err) {
                console.warn('[DB] Hiba a törlés naplózásakor:', err);
            }
        }
        return this._directDelete(storeName, key);
    }

    async deleteItemWithEntries(itemId) {
        return new Promise((resolve, reject) => {
            if (this.isMock) {
                // Mock implementation
                if (this.mockStore['items']) {
                    delete this.mockStore['items'][itemId];
                }
                if (this.mockStore['entries']) {
                    const entriesToDelete = Object.values(this.mockStore['entries']).filter(e => {
                        let tempItemId = this._getTempItemId(e);
                        return tempItemId === itemId || (e.cellKey && (e.cellKey.startsWith(`${itemId}_`) || e.cellKey.endsWith(`_${itemId}`)));
                    });
                    entriesToDelete.forEach(e => {
                        delete this.mockStore['entries'][e.id];
                    });
                }
                return resolve();
            }
            if (!this.db) return reject(new Error('Nincs adatbázis kapcsolat!'));

            try {
                const tx = this.db.transaction(['items', 'entries', 'deleted_records'], 'readwrite');
                const itemStore = tx.objectStore('items');
                const entryStore = tx.objectStore('entries');
                const deletedStore = tx.objectStore('deleted_records');

                itemStore.delete(itemId);

                const syncService = this.syncService || window.app?.syncService || window.app?.syncManager;
                const isMuted = syncService?.isMuted || syncService?.service?.isMuted;
                if (!isMuted) {
                    deletedStore.put({
                        id: `items_${itemId}`,
                        record_id: String(itemId),
                        table_name: 'items',
                        deleted_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }

                const req = entryStore.getAll();
                req.onsuccess = (e) => {
                    const entries = e.target.result || [];
                    const syncService = this.syncService || window.app?.syncService || window.app?.syncManager;
                    const isMuted = syncService?.isMuted || syncService?.service?.isMuted;

                    entries.forEach(entry => {
                        let tempItemId = this._getTempItemId(entry);
                        if (tempItemId === itemId || (entry.cellKey && (entry.cellKey.startsWith(`${itemId}_`) || entry.cellKey.endsWith(`_${itemId}`)))) {
                            entryStore.delete(entry.id);

                            // Tombstone rögzítése
                            if (!isMuted) {
                                const deletedRecord = {
                                    id: `entries_${entry.id}`,
                                    record_id: String(entry.id),
                                    table_name: 'entries',
                                    deleted_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                };
                                deletedStore.put(deletedRecord);
                            }
                        }
                    });
                };
                req.onerror = (e) => {
                    reject(e.target.error);
                };

                tx.oncomplete = () => {
                    resolve();
                };
                tx.onerror = (e) => {
                    reject(e.target.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }
}

export class TemplateManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.templates = []; 
    }
    
    async load() { 
        try {
            this.templates = await this.db.getAll('templates');
        } catch (e) {
            console.error('[TemplateManager] Betöltési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async add(template) {
        try {
            if (!template.id) template.id = generateUUID();
            template.updated_at = new Date().toISOString();
            await this.db.save('templates', template);
            this.templates.push(template);
            await this.syncService.push('templates', template);
            return template;
        } catch (e) {
            console.error('[TemplateManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async delete(id) {
        try {
            await this.db.delete('templates', id);
            this.templates = this.templates.filter(t => t.id !== id);
            await this.syncService.push('templates', id, true);
        } catch (e) {
            console.error('[TemplateManager] Törlési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
}

export class ReminderManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.reminders = []; 
    }
    
    async load() { 
        try {
            this.reminders = await this.db.getAll('reminders');
            await this.autoGenerateRecurring();
        } catch (e) {
            console.error('[ReminderManager] Betöltési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
  
    async autoGenerateRecurring() {
        let updated = false;
        const today = dayjs();

        for (const rem of this.reminders) {
            if (!rem.frequency || rem.frequency === 'once') continue;

            let dueDate = dayjs(rem.due_date);
            while (dueDate.isBefore(today, 'day')) {
                if (rem.frequency === 'monthly') dueDate = dueDate.add(1, 'month');
                else if (rem.frequency === 'quarterly') dueDate = dueDate.add(3, 'month');
                else if (rem.frequency === 'yearly') dueDate = dueDate.add(1, 'year');

                rem.due_date = dueDate.format('YYYY-MM-DD');
                rem.updated_at = new Date().toISOString();

                await this.db.save('reminders', rem);
                await this.syncService.push('reminders', rem);
                updated = true;
            }
        }

        if (updated) {
            this.reminders = await this.db.getAll('reminders');
        }
    }
    
    async add(reminder) {
        try {
            if (!reminder.id) reminder.id = generateUUID();
            reminder.updated_at = new Date().toISOString();
            await this.db.save('reminders', reminder);
            this.reminders.push(reminder);
            await this.syncService.push('reminders', reminder);
            return reminder;
        } catch (e) {
            console.error('[ReminderManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async delete(id) {
        try {
            await this.db.delete('reminders', id);
            this.reminders = this.reminders.filter(r => r.id !== id);
            await this.syncService.push('reminders', id, true);
        } catch (e) {
            console.error('[ReminderManager] Törlési hiba:', e);
            // queue clear removed
            throw e;
        }
    }

    async markAsCompleted(id) {
        const rem = this.reminders.find(r => r.id === id);
        if (!rem) return;

        rem.completed = true;
        rem.updated_at = new Date().toISOString();

        await this.db.save('reminders', rem);
        await this.syncService.push('reminders', rem);

        // Ha ismétlődő határidő, akkor léptetjük a dátumot a következő alkalomra
        if (rem.frequency && rem.frequency !== 'once') {
            let dueDate = dayjs(rem.due_date);
            if (rem.frequency === 'monthly') dueDate = dueDate.add(1, 'month');
            else if (rem.frequency === 'quarterly') dueDate = dueDate.add(3, 'month');
            else if (rem.frequency === 'yearly') dueDate = dueDate.add(1, 'year');

            // Létrehozunk egy új (vagyis visszaállított) határidőt a jövőbeli dátumra
            rem.completed = false;
            rem.due_date = dueDate.format('YYYY-MM-DD');
            rem.updated_at = new Date().toISOString();
            
            await this.db.save('reminders', rem);
            await this.syncService.push('reminders', rem);
        }

        this.reminders = await this.db.getAll('reminders');
    }
}

// ==================== ITEM, MONTH, ENTRY MANAGER ====================

export class ItemManager {

    _getTempItemId(entry) {
        let tempItemId = entry.itemId;
        if (!tempItemId && entry.cellKey) {
             const parts = entry.cellKey.split('_');
             tempItemId = parts[0];
             if (!/^[0-9]+$/.test(tempItemId) && parts.length >= 2 && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
                  tempItemId = parts[1];
             }
        }
        return tempItemId;
    }

    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
    }

    get items() {
        return useAppStore.getState().items;
    }

    set items(val) {
        useAppStore.setState({ items: val });
    }
    
    async load() { 
        try {
            const data = await this.db.getAll('items');
            this.items = data;
        } catch (e) {
            console.error('[ItemManager] Betöltési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async add(name, color = '#dbeafe') {
        try {
            const item = { id: generateUUID(), name, color, updated_at: new Date().toISOString() };
            await this.db.save('items', item);
            this.items = [...this.items, item];
            await this.syncService.push('items', item);
            return item;
        } catch (e) {
            console.error('[ItemManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async update(id, updatedData) {
        try {
            const idx = this.items.findIndex(i => i.id === id);
            if (idx === -1) return;
            const item = { ...this.items[idx], ...updatedData, updated_at: new Date().toISOString() };
            await this.db.save('items', item);
            const newItems = [...this.items];
            newItems[idx] = item;
            this.items = newItems;
            await this.syncService.push('items', item);
            return item;
        } catch (e) {
            console.error('[ItemManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async delete(id) {
        try {
            await this.db.deleteItemWithEntries(id);
            this.items = this.items.filter(i => i.id !== id);

            const entriesToDel = (this.syncService?._app?.entries?.entries || window.app?.entries?.entries)?.filter(e => {
                let tempItemId = e.itemId;
                if (!tempItemId && e.cellKey) {
                     const parts = e.cellKey.split('_');
                     tempItemId = parts[0];
                     if (!/^[0-9]+$/.test(tempItemId) && parts.length >= 2 && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
                          tempItemId = parts[1];
                     }
                }
                return tempItemId === id || (e.cellKey && (e.cellKey.startsWith(`${id}_`) || e.cellKey.endsWith(`_${id}`)));
            }) || [];
            const appEntries = this.syncService?._app?.entries || window.app?.entries;
            if (appEntries) {
                appEntries.entries = appEntries.entries.filter(e => {
                let tempItemId = e.itemId;
                if (!tempItemId && e.cellKey) {
                     const parts = e.cellKey.split('_');
                     tempItemId = parts[0];
                     if (!/^[0-9]+$/.test(tempItemId) && parts.length >= 2 && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
                          tempItemId = parts[1];
                     }
                }
                return !(tempItemId === id || (e.cellKey && (e.cellKey.startsWith(`${id}_`) || e.cellKey.endsWith(`_${id}`))));
            });
            }

            // Push changes
            await this.syncService.push('items', id, true);
            for (const entry of entriesToDel) {
                await this.syncService.push('entries', entry.id, true);

                // Track in tombstone (már a db.deleteItemWithEntries kezeli belül)
            }

        } catch (e) {
            console.error('[ItemManager] Törlési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
}

export class MonthManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
    }

    get months() {
        return useAppStore.getState().months;
    }

    set months(val) {
        useAppStore.setState({ months: val });
    }
    
    async load() { 
        try {
            const data = await this.db.getAll('months');
            this.months = data.map(m => m.month).sort();
        } catch (e) {
            console.error('[MonthManager] Betöltési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async add(month) {
        try {
            const data = { month, updated_at: new Date().toISOString() };
            await this.db.save('months', data);
            const newMonths = [...this.months, month];
            newMonths.sort();
            this.months = newMonths;
            await this.syncService.push('months', data, false, 'month');
        } catch (e) {
            console.error('[MonthManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async delete(month) {
        try {
            await this.db.delete('months', month);
            this.months = this.months.filter(m => m !== month);
            await this.syncService.push('months', month, true, 'month');
        } catch (e) {
            console.error('[MonthManager] Törlési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
}

export class EntryManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
    }

    get entries() {
        return useAppStore.getState().entries;
    }

    set entries(val) {
        useAppStore.setState({ entries: val });
    }
    
    async load() { 
        try {
            const data = await this.db.getAll('entries');
            // Normalize cellKey to explicit itemId and month fields
            data.forEach(e => {
                if (e.cellKey && (!e.itemId || !e.month)) {
                    const parsed = parseCellKey(e);
                    if (!e.itemId) e.itemId = parsed.itemId;
                    if (!e.month) e.month = parsed.month;
                }
            });
            this.entries = data;
        } catch (e) {
            console.error('[EntryManager] Betöltési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async getByCellKey(cellKeyPrefix) {
        return await this.db.getByCellKey(cellKeyPrefix);
    }
    
    async saveEntry(entry) {
        try {
            if (!entry.id) entry.id = generateUUID();
            if (!entry.updated_at) entry.updated_at = new Date().toISOString();

            // Explicit field generation
            if (entry.itemId && entry.month && !entry.cellKey) {
                entry.cellKey = `${entry.itemId}_${entry.month}_${Date.now()}`;
            } else if (entry.cellKey && (!entry.itemId || !entry.month)) {
                const parts = entry.cellKey.split('_');
                let tempItemId = parts[0];
                let tempMonth = parts[1];
                if (!/^[0-9]+$/.test(tempItemId) && parts.length >= 2 && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
                    tempMonth = parts[0];
                    tempItemId = parts[1];
                }
                if (!entry.itemId) entry.itemId = tempItemId;
                if (!entry.month) entry.month = tempMonth;
            }
            await this.db.save('entries', entry);

            const idx = this.entries.findIndex(e => e.id === entry.id);
            const newEntries = [...this.entries];
            if (idx !== -1) newEntries[idx] = entry;
            else newEntries.push(entry);
            this.entries = newEntries;

            await this.syncService.push('entries', entry);
            return entry;
        } catch (e) {
            console.error('[EntryManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
    
    async deleteEntry(id) {
        try {
            await this.db.delete('entries', id);
            this.entries = this.entries.filter(e => e.id !== id);
            await this.syncService.push('entries', id, true);
        } catch (e) {
            console.error('[EntryManager] Törlési hiba:', e);
            // queue clear removed
            throw e;
        }
    }
}

// ==================== 3. CONFIGURATION MANAGER ====================
export class ConfigManager {
    constructor() {
        this.defaultEurRate = parseFloat(localStorage.getItem('default_eur_rate')) || 400;
        this.eurRate = parseFloat(localStorage.getItem('live_eur_rate')) || this.defaultEurRate;
        this.useLiveEur = localStorage.getItem('use_live_eur') !== 'false';
        this.useSupabase = localStorage.getItem('supabase_use') === 'true';
        this.weatherCity = localStorage.getItem('weather_city') || 'Budapest';
        
        let savedUrl = localStorage.getItem('supabase_url') || '';
        if (savedUrl) {
            savedUrl = savedUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
            if (!savedUrl.startsWith('http://') && !savedUrl.startsWith('https://')) {
                savedUrl = 'https://' + savedUrl;
            }
        }
        this.supabaseConfig = {
            url: savedUrl,
            key: localStorage.getItem('supabase_key') || ''
        };
        this.aiConfig = {
            apiKey: localStorage.getItem('ai_api_key') || '',
            model: localStorage.getItem('ai_model') || 'gemini-3.5-flash'
        };
    }

    async watchDogEur(uiCallback) {
        if (!this.useLiveEur) {
            this.eurRate = this.defaultEurRate;
            uiCallback(this.eurRate, 'fallback');
            return;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch('https://open.er-api.com/v6/latest/EUR', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error();
            const data = await response.json();
            
            if (data?.rates?.HUF) {
                this.eurRate = parseFloat(data.rates.HUF);
                localStorage.setItem('live_eur_rate', this.eurRate.toFixed(2));
                uiCallback(this.eurRate.toFixed(2), 'live');
                return;
            }
            throw new Error();
        } catch {
            const fallback = localStorage.getItem('default_eur_rate') || 400;
            this.eurRate = parseFloat(fallback);
            uiCallback(this.eurRate, 'fallback');
        }
    }

    saveSettings(settings) {
        if (!settings || typeof settings !== 'object') return false;
        const { url, key, useCloud, eurRate, useLiveEur, weatherCity } = settings;

        if (url !== undefined) {
            this.supabaseConfig.url = url;
            localStorage.setItem('supabase_url', url);
        }
        if (key !== undefined) {
            this.supabaseConfig.key = key;
            localStorage.setItem('supabase_key', key);
        }
        if (useCloud !== undefined) {
            this.useSupabase = Boolean(useCloud);
            localStorage.setItem('supabase_use', this.useSupabase ? 'true' : 'false');
        }
        if (weatherCity !== undefined) {
            this.weatherCity = weatherCity;
            localStorage.setItem('weather_city', weatherCity);
        }
        if (eurRate !== undefined) {
            this.defaultEurRate = Number(eurRate);
            localStorage.setItem('default_eur_rate', String(this.defaultEurRate));
            if (!this.useLiveEur) {
                this.eurRate = this.defaultEurRate;
            }
        }
        if (useLiveEur !== undefined) {
            this.useLiveEur = Boolean(useLiveEur);
            localStorage.setItem('use_live_eur', this.useLiveEur ? 'true' : 'false');
            if (!this.useLiveEur) {
                this.eurRate = this.defaultEurRate;
            }
        }

        return true;
    }

    setSupabaseEnabled(enabled) {
        this.useSupabase = Boolean(enabled);
        localStorage.setItem('supabase_use', this.useSupabase ? 'true' : 'false');
    }
}

// ==================== 4. CLOUD SYNC SYSTEM ====================

export class CloudSync {
    constructor(configManager) {
        this.config = configManager;
        this.client = null;
        this.tablesMissing = false;
        this.init();
    }

    init() {
        if (this.config.useSupabase && this.config.supabaseConfig.url && this.config.supabaseConfig.key) {
            try {
                if (window.supabase) {
                    this.client = window.supabase.createClient(
                        this.config.supabaseConfig.url, 
                        this.config.supabaseConfig.key,
                        { auth: { persistSession: true } }
                    );
                    console.log('[CLOUD] Supabase client initialized successfully');
                } else {
                    console.warn('[CLOUD] Supabase library not loaded');
                }
            } catch (e) {
                console.error('[CLOUD] Supabase initialization failed', e);
            }
        }
    }

    /**
     * Egyedi sor beszúrása vagy frissítése a felhőben (hibát dob, ha sikertelen)
     */
    async upsert(storeName, data, customKey = 'id') {
        if (!this.client || !this.config.useSupabase) {
            throw new Error('Supabase kliens nincs inicializálva vagy ki van kapcsolva');
        }
        
        if (!data || typeof data !== 'object') {
            console.error('[CLOUD] Érvénytelen adat:', data, 'storeName:', storeName); throw new Error('Érvénytelen adat az upsert művelethez');
        }

        let currentData = { ...data };
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                const { error } = await this.client
                    .from(storeName)
                    .upsert(currentData, { onConflict: customKey });

                if (error) {
                    throw error;
                }
                console.log(`[CLOUD] ${storeName} egyedi upsert sikeres`);
                return;
            } catch (err) {
                // 42703 is undefined_column in Postgres
                const isColumnError = err.code === '42703' || 
                                      (err.message && (err.message.toLowerCase().includes('column') && (err.message.toLowerCase().includes('does not exist') || err.message.toLowerCase().includes('not found'))));
                
                if (isColumnError && attempts < maxAttempts - 1) {
                    let columnName = null;
                    const match = err.message.match(/column "([^"]+)"/i) || err.message.match(/column ([a-zA-Z0-9_]+)/i);
                    if (match) {
                        columnName = match[1];
                    } else {
                        if (err.message.includes('isStorno')) {
                            columnName = 'isStorno';
                        }
                    }
                    
                    if (columnName && currentData.hasOwnProperty(columnName)) {
                        console.warn(`[CLOUD] ${storeName} táblában nem létezik a(z) "${columnName}" oszlop. Eltávolítjuk a felhőbe küldés előtt és újrapróbáljuk.`);
                        delete currentData[columnName];
                        attempts++;
                        continue;
                    }
                }
                
                if (err.code === '42P01' || (err.message && (err.message.includes('relation') || err.message.includes('does not exist')))) {
                    this.tablesMissing = true;
                }
                throw err;
            }
        }
    }

    /**
     * Egyedi sor törlése a felhőben (hibát dob, ha sikertelen)
     */
    async delete(storeName, data, customKey = 'id') {
        if (!this.client || !this.config.useSupabase) {
            throw new Error('Supabase kliens nincs inicializálva vagy ki van kapcsolva');
        }

        let keyValue = typeof data === 'object' && data !== null ? data[customKey] : data;
        if (keyValue === undefined && typeof data === 'object' && data !== null) {
            keyValue = data.id;
        }

        if (keyValue === undefined || keyValue === null) {
            throw new Error('Hiányzó kulcsmező a törlés művelethez');
        }

        try {
            const { error } = await this.client
                .from(storeName)
                .delete()
                .eq(customKey, keyValue);

            if (error) {
                if (error.code === '42P01') {
                    this.tablesMissing = true;
                }
                throw error;
            }
            console.log(`[CLOUD] ${storeName} egyedi törlés sikeres (${customKey}: ${keyValue})`);
        } catch (err) {
            if (err.code === '42P01' || (err.message && (err.message.includes('relation') || err.message.includes('does not exist')))) {
                this.tablesMissing = true;
            }
            throw err;
        }
    }

    // ========================================================
    // === JAVÍTOTT PUSH (törlés logika) ===
    // ========================================================

    async push(storeName, data, isDelete = false, customKey = 'id') {
        if (!this.client || !this.config.useSupabase) {
            console.log(`[CLOUD] Push skipped: ${!this.client ? 'no client' : 'supabase disabled'}`);
            return;
        }

        try {
            if (isDelete) {
                // Törlés: data lehet ID vagy objektum
                let keyValue;
                if (typeof data === 'object' && data !== null) {
                    keyValue = data[customKey];
                    // Ha nincs kulcs, próbáljuk az 'id'-t
                    if (keyValue === undefined) {
                        keyValue = data.id;
                    }
                } else {
                    keyValue = data;
                }

                if (keyValue === undefined || keyValue === null) {
                    console.warn('[CLOUD] Delete: nincs érvényes kulcs', { data, customKey });
                    return;
                }

                const { error } = await this.client
                    .from(storeName)
                    .delete()
                    .eq(customKey, keyValue);

                if (error) throw error;
                console.log(`[CLOUD] ${storeName} delete successful (${customKey}: ${keyValue})`);

            } else {
                // Upsert: data objektum
                if (!data || typeof data !== 'object') {
                    console.warn('[CLOUD] Upsert: érvénytelen adat', data);
                    return;
                }

                await this.upsert(storeName, data, customKey);
            }

        } catch (err) {
            console.warn(`[CLOUD] Sync error on ${storeName}:`, err.message);
            // Nem dobunk hibát, hogy a helyi adat megmaradjon
        }
    }

    // ========================================================
    // === ÚJ: BULK PUSH (tömeges műveletek) ===
    // ========================================================

    /**
     * Tömeges push művelet (gyorsabb, mint egyesével)
     * @param {string} storeName - Tábla neve
     * @param {Array} dataArray - Adatok tömbje
     * @param {string} customKey - Kulcs mező neve (alapértelmezett: 'id')
     * @param {boolean} isDelete - Törlés művelet-e
     * @returns {Promise<{success: number, failed: number, errors: Array}>}
     */
    async pushBulk(storeName, dataArray, customKey = 'id', isDelete = false) {
        if (!this.client || !this.config.useSupabase) {
            console.log(`[CLOUD] Bulk push skipped: no client or supabase disabled`);
            return { success: 0, failed: dataArray?.length || 0, errors: [] };
        }

        if (!dataArray || dataArray.length === 0) {
            return { success: 0, failed: 0, errors: [] };
        }

        const result = { success: 0, failed: 0, errors: [] };

        try {
            if (isDelete) {
                // Törlés: egyesével kell, mert a Supabase nem támogatja a bulk deletet
                for (const item of dataArray) {
                    try {
                        await this.push(storeName, item, true, customKey);
                        result.success++;
                    } catch (e) {
                        result.failed++;
                        result.errors.push({ item, error: e.message });
                    }
                }
            } else {
                // Upsert: tömegesen
                const { error } = await this.client
                    .from(storeName)
                    .upsert(dataArray, { 
                        onConflict: customKey,
                        ignoreDuplicates: false 
                    });

                if (error) {
                    // Ha a bulk hiba, próbáljuk egyesével
                    console.warn(`[CLOUD] Bulk upsert failed, trying individually:`, error.message);
                    for (const item of dataArray) {
                        try {
                            await this.push(storeName, item, false, customKey);
                            result.success++;
                        } catch (e) {
                            result.failed++;
                            result.errors.push({ item, error: e.message });
                        }
                    }
                } else {
                    result.success = dataArray.length;
                }
            }

            console.log(`[CLOUD] Bulk push ${storeName}: ${result.success} success, ${result.failed} failed`);
            return result;

        } catch (err) {
            console.warn(`[CLOUD] Bulk push error on ${storeName}:`, err.message);
            // Fallback: egyesével
            for (const item of dataArray) {
                try {
                    await this.push(storeName, item, isDelete, customKey);
                    result.success++;
                } catch (e) {
                    result.failed++;
                    result.errors.push({ item, error: e.message });
                }
            }
            return result;
        }
    }

    // ========================================================
    // === PULL (változatlan) ===
    // ========================================================

    async pull(storeName) {
        if (!this.client || !this.config.useSupabase) {
            console.log(`[CLOUD] Pull skipped: ${!this.client ? 'no client' : 'supabase disabled'}`);
            return [];
        }

        try {
            const { data, error } = await this.client
                .from(storeName)
                .select('*');

            if (error) {
                if (error.code === '42P01') {
                    this.tablesMissing = true;
                }
                throw error;
            }
            console.log(`[CLOUD] ${storeName} pull: ${data?.length || 0} records`);
            return data || [];

        } catch (err) {
            console.warn(`[CLOUD] Pull error from ${storeName}:`, err.message);
            if (err.code === '42P01' || (err.message && (err.message.includes('relation') || err.message.includes('does not exist')))) {
                this.tablesMissing = true;
            }
            return [];
        }
    }

    /**
     * Pull minden táblából
     */
    async pullAll() {
        const tables = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders'];
        const result = {};

        this.tablesMissing = false;

        for (const table of tables) {
            result[table] = await this.pull(table);
        }

        return result;
    }

    // ========================================================
    // === FULL SYNC (kiegészítve) ===
    // ========================================================

    async fullSync() {
        if (!this.client || !this.config.useSupabase) {
            console.log('[CLOUD] Full sync skipped: no client or supabase disabled');
            return { status: 'skipped', message: 'No Supabase connection' };
        }

        try {
            // Pull adatok
            const cloudData = await this.pullAll();

            // Itt jönne a merge logika
            console.log('[CLOUD] Full sync data received:', {
                items: cloudData.items?.length || 0,
                entries: cloudData.entries?.length || 0,
                months: cloudData.months?.length || 0,
                templates: cloudData.templates?.length || 0,
                reminders: cloudData.reminders?.length || 0,
                incomings: cloudData.incomings?.length || 0,
                incoming_senders: cloudData.incoming_senders?.length || 0
            });

            return { status: 'success', data: cloudData };

        } catch (e) {
            console.warn('[CLOUD] Full sync error:', e);
            return { status: 'error', message: e.message };
        }
    }

    /**
     * Teljes felhő adatbázis törlése (minden sor törlése a táblákból)
     */
    async wipeCloudDatabase() {
        if (!this.client || !this.config.useSupabase) {
            throw new Error('Supabase kliens nincs inicializálva vagy ki van kapcsolva!');
        }

        const tables = [
            { name: 'items', key: 'id', type: 'text' },
            { name: 'months', key: 'month', type: 'text' },
            { name: 'entries', key: 'id', type: 'text' },
            { name: 'templates', key: 'id', type: 'text' },
            { name: 'reminders', key: 'id', type: 'text' },
            { name: 'incomings', key: 'id', type: 'text' },
            { name: 'incoming_senders', key: 'id', type: 'text' },
            { name: 'deleted_records', key: 'id', type: 'text' }
        ];

        const errors = [];
        for (const table of tables) {
            try {
                let query = this.client.from(table.name).delete();
                if (table.type === 'bigint') {
                    query = query.neq(table.key, -999999);
                } else {
                    query = query.neq(table.key, '___non_existent_wipe___');
                }
                
                const { error } = await query;
                if (error) {
                    throw error;
                }
                console.log(`[CLOUD] ${table.name} tábla összes adata törölve a felhőben.`);
            } catch (err) {
                console.error(`[CLOUD] Hiba a ${table.name} tábla törlése közben:`, err);
                errors.push(`${table.name}: ${err.message || err}`);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Néhány táblát nem sikerült törölni: ${errors.join(', ')}`);
        }
        
        this.tablesMissing = false;
        return true;
    }
}

export class IncomingManager {
    constructor(db, syncService) {
        this.db = db;
        this.syncService = syncService;
        this.incomings = [];
        this.senders = [];
    }

    /**
     * Adatok betöltése
     */
    async load() {
        try {
            this.incomings = await this.db.getAll('incomings') || [];
            const rawSenders = await this.db.getAll('incoming_senders') || [];

            // Öngyógyító beolvasás: Kiszűrjük az esetleges duplikátumokat az adatbázisból
            const seenNames = new Set();
            this.senders = [];
            for (const sender of rawSenders) {
                const nameNorm = String(sender.name || '').trim();
                if (nameNorm && !seenNames.has(nameNorm)) {
                    seenNames.add(nameNorm);
                    this.senders.push(sender);
                } else if (sender.id) {
                    // Ha duplikált névvel van bejegyzés, töröljük az adatbázisból is a tisztaság kedvéért
                    await this.db.delete('incoming_senders', sender.id);
                }
            }

            // Senders lista frissítése a bejegyzésekből
            await this._updateSendersFromEntries();
        } catch (e) {
            console.error('[IncomingManager] Betöltési hiba:', e);
            // queue clear removed
            throw e;
        }
    }

    /**
     * Senders lista frissítése a bejegyzésekből
     */
    async _updateSendersFromEntries() {
        const senderSet = new Set();
        this.incomings.forEach(entry => {
            if (entry.sender) {
                const nameNorm = String(entry.sender).trim();
                if (nameNorm) senderSet.add(nameNorm);
            }
        });
        
        // Meglévő senders-eket megtartjuk, de újat is hozzáadunk
        const existingSenders = new Set(this.senders.map(s => String(s.name || '').trim()));
        const newSenders = [];
        
        senderSet.forEach(name => {
            if (!existingSenders.has(name)) {
                const sender = { 
                    id: generateUUID(),
                    name, 
                    createdAt: new Date().toISOString() 
                };
                this.senders.push(sender);
                newSenders.push(sender);
                existingSenders.add(name);
            }
        });

        await Promise.all(newSenders.map(sender => this.db.save('incoming_senders', sender)));
    }

    /**
     * Bejövő tétel hozzáadása
     * @param {string} sender - Utaló neve
     * @param {string} date - Dátum (YYYY-MM-DD)
     * @param {number} amount - Összeg
     * @returns {Promise<object>} - A létrehozott tétel
     */
    async add(sender, date, amount) {
        try {
            sender = String(sender || '').trim();
            if (!sender) {
                throw new Error('Az utaló neve nem lehet üres.');
            }
            const normalizedDate = String(date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || Number.isNaN(new Date(normalizedDate).getTime())) {
                throw new Error('Érvénytelen dátum formátum.');
            }
            if (isNaN(amount) || amount <= 0) {
                throw new Error('Az összegnek nagyobbnak kell lennie nullánál.');
            }
            // Ellenőrizzük, hogy van-e már ilyen tétel
            const existing = this.incomings.find(
                entry => entry.sender === sender && entry.date === normalizedDate
            );
            if (existing) {
                // Frissítjük a meglévőt
                existing.amount = amount;
                existing.updated_at = new Date().toISOString();
                await this.db.save('incomings', existing);
                return existing;
            }

            const entry = {
                id: generateUUID(),
                sender,
                date: normalizedDate,
                amount,
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            await this.db.save('incomings', entry);
            this.incomings.push(entry);
            await this._updateSendersFromEntries();
            await this.syncService.push('incomings', entry);
            return entry;
        } catch (e) {
            console.error('[IncomingManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }

    /**
     * Tétel frissítése
     */
    async update(id, data) {
        try {
            const idx = this.incomings.findIndex(e => String(e.id) === String(id));
            if (idx === -1) return null;
            if (data.hasOwnProperty('amount')) {
                if (isNaN(data.amount) || data.amount <= 0) {
                    throw new Error('Az összegnek nagyobbnak kell lennie nullánál.');
                }
            }
            if (data.hasOwnProperty('sender')) {
                const senderName = String(data.sender || '').trim();
                if (!senderName) {
                    throw new Error('Az utaló neve nem lehet üres.');
                }
                data.sender = senderName;
            }
            if (data.hasOwnProperty('date')) {
                const normalizedDate = String(data.date || '').trim();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || Number.isNaN(new Date(normalizedDate).getTime())) {
                    throw new Error('Érvénytelen dátum formátum.');
                }
                data.date = normalizedDate;
            }

            const entry = { ...this.incomings[idx], ...data, updated_at: new Date().toISOString() };
            await this.db.save('incomings', entry);
            this.incomings[idx] = entry;
            await this.syncService.push('incomings', entry);
            return entry;
        } catch (e) {
            console.error('[IncomingManager] Mentési hiba:', e);
            // queue clear removed
            throw e;
        }
    }

    /**
     * Tétel törlése
     */
    async delete(id) {
        try {
            await this.db.delete('incomings', id);
            this.incomings = this.incomings.filter(e => String(e.id) !== String(id));
            await this.syncService.push('incomings', id, true);
        } catch (e) {
            console.error('[IncomingManager] Törlési hiba:', e);
            // queue clear removed
            throw e;
        }
    }

    /**
     * Összes tétel törlése (karbantartás)
     */
    async deleteAll() {
        for (const entry of this.incomings) {
            await this.db.delete('incomings', entry.id);
        }
        this.incomings = [];
        await this.syncService.push('incomings', 'all', true, 'bulk');
    }

    /**
     * Bejövő tételek lekérése szűréssel
     */
    getBySender(sender) {
        return this.incomings.filter(e => e.sender === sender);
    }

    /**
     * Bejövő tételek lekérése dátum szerint
     */
    getByDate(date) {
        return this.incomings.filter(e => e.date === date);
    }

    /**
     * Összesítés utalónként
     */
    getTotalsBySender() {
        const totals = {};
        this.incomings.forEach(e => {
            if (!totals[e.sender]) totals[e.sender] = 0;
            totals[e.sender] += e.amount;
        });
        return totals;
    }

    /**
     * Sender hozzáadása (csak név)
     */
    addSender(name) {
        if (this.senders.find(s => s.name === name)) return null;
        const sender = { id: Date.now() + '_' + name, name, createdAt: new Date().toISOString() };
        this.senders.push(sender);
        this.db.save('incoming_senders', sender);
        this.syncService.push('incoming_senders', sender);
        return sender;
    }

    /**
     * Sender törlése (csak akkor, ha nincs hozzá tétel)
     */
    deleteSender(name) {
        const hasEntries = this.incomings.some(e => e.sender === name);
        if (hasEntries) {
            throw new Error('Nem törölhető, mert vannak hozzá tartozó tételek!');
        }
        const sender = this.senders.find(s => s.name === name);
        this.senders = this.senders.filter(s => s.name !== name);
        if (sender) {
            this.db.delete('incoming_senders', sender.id);
            this.syncService.push('incoming_senders', sender.id, true);
        }
    }

    /**
     * Sender lista lekérése
     */
    getSenders() {
        return [...new Set(this.senders.map(s => String(s.name || '').trim()))].sort();
    }
}
