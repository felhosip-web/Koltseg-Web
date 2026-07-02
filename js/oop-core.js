// js/oop-core.js - OOP HMI Core Infrastruktúra v4.1 (IndexedDB Optimalizált)
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
                return typeof data.cellKey === 'string' && !isNaN(data.amount);
            case 'items':
                return typeof data.name === 'string' && data.name.trim() !== '';
            case 'months':
                return /^\d{4}-\d{2}$/.test(data.month);
            case 'reminders':
                return typeof data.title === 'string' && !isNaN(data.amount) && typeof data.due_date === 'string';
            default:
                return true;
        }
    }
}

export class Database {
    constructor(dbName = 'KoltsegNyilvantarto', version = 6) {  // ← verzió 6-ra emelve
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onupgradeneeded = (e) => {
                try {
                    this._handleUpgrade(e.target.result, e.oldVersion);
                } catch (err) {
                    console.error('[DB] Upgrade hiba:', err);
                    // A hibát továbbítjuk, hogy az onerror elkapja
                    request.onerror?.(err);
                }
            };
            
            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log(`[DB] ✅ IndexedDB csatlakoztatva (v${this.version})`);
                resolve(this);
            };
            
            request.onerror = (e) => {
                console.error('[DB] Kapcsolódási hiba:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    _handleUpgrade(db, oldVersion) {
        console.log(`[DB] Upgrade: ${oldVersion} → ${this.version}`);

        // === Entries tábla ===
        if (!db.objectStoreNames.contains('entries')) {
            const store = db.createObjectStore('entries', { 
                keyPath: 'id', 
                autoIncrement: true 
            });
            store.createIndex('cellKey', 'cellKey', { unique: false });
            store.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // === Items tábla ===
        if (!db.objectStoreNames.contains('items')) {
            db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        }

        // === Months tábla ===
        if (!db.objectStoreNames.contains('months')) {
            db.createObjectStore('months', { keyPath: 'month' });
        }

        // === Templates tábla ===
        if (!db.objectStoreNames.contains('templates')) {
            db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        }

        // === Reminders tábla ===
        if (!db.objectStoreNames.contains('reminders')) {
            db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
        }

        // === Incomings tábla ===
        if (!db.objectStoreNames.contains('incomings')) {
            const store = db.createObjectStore('incomings', { 
                keyPath: 'id', 
                autoIncrement: true 
            });
            store.createIndex('sender', 'sender', { unique: false });
            store.createIndex('date', 'date', { unique: false });
            store.createIndex('sender_date', ['sender', 'date'], { unique: true });
            store.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // === Incoming senders tábla ===
        if (!db.objectStoreNames.contains('incoming_senders')) {
            const store = db.createObjectStore('incoming_senders', { 
                keyPath: 'id' 
            });
            store.createIndex('name', 'name', { unique: true });
        }
    }

    // ================================================================
    // === ADATBÁZIS MŰVELETEK ===
    // ================================================================

    async getByCellKey(cellKeyPrefix) {
        return new Promise((resolve) => {
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

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
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
}

export class TemplateManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.templates = []; 
    }
    
    async load() { 
        this.templates = await this.db.getAll('templates'); 
    }
    
    async add(template) {
        template.updated_at = new Date().toISOString();
        template.id = await this.db.save('templates', template);
        this.templates.push(template);
        await this.syncService.push('templates', template);
        return template;
    }
    
    async delete(id) {
        await this.db.delete('templates', id);
        this.templates = this.templates.filter(t => t.id !== id);
        await this.syncService.push('templates', id, true);
    }
}

export class ReminderManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.reminders = []; 
    }
    
    async load() { 
        this.reminders = await this.db.getAll('reminders'); 
        await this.autoGenerateRecurring();
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
        reminder.updated_at = new Date().toISOString();
        reminder.id = await this.db.save('reminders', reminder);
        this.reminders.push(reminder);
        await this.syncService.push('reminders', reminder);
        return reminder;
    }
    
    async delete(id) {
        await this.db.delete('reminders', id);
        this.reminders = this.reminders.filter(r => r.id !== id);
        await this.syncService.push('reminders', id, true);
    }
}

// ==================== ITEM, MONTH, ENTRY MANAGER ====================

export class ItemManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.items = []; 
    }
    
    async load() { 
        this.items = await this.db.getAll('items'); 
    }
    
    async add(name, color = '#dbeafe') {
        const item = { name, color, updated_at: new Date().toISOString() };
        item.id = await this.db.save('items', item);
        this.items.push(item);
        await this.syncService.push('items', item);
        return item;
    }
    
    async update(id, updatedData) {
        const idx = this.items.findIndex(i => i.id === id);
        if (idx === -1) return;
        const item = { ...this.items[idx], ...updatedData, updated_at: new Date().toISOString() };
        await this.db.save('items', item);
        this.items[idx] = item;
        await this.syncService.push('items', item);
        return item;
    }
    
    async delete(id) {
        await this.db.delete('items', id);
        this.items = this.items.filter(i => i.id !== id);
        await this.syncService.push('items', id, true);
    }
}

export class MonthManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.months = []; 
    }
    
    async load() { 
        const data = await this.db.getAll('months');
        this.months = data.map(m => m.month).sort(); 
    }
    
    async add(month) {
        const data = { month, updated_at: new Date().toISOString() };
        await this.db.save('months', data);
        this.months.push(month);
        this.months.sort();
        await this.syncService.push('months', data);
    }
    
    async delete(month) {
        await this.db.delete('months', month);
        this.months = this.months.filter(m => m !== month);
        await this.syncService.push('months', month, true, 'month');
    }
}

export class EntryManager {
    constructor(db, syncService) { 
        this.db = db; 
        this.syncService = syncService;
        this.entries = []; 
    }
    
    async load() { 
        this.entries = await this.db.getAll('entries'); 
    }
    
    async getByCellKey(cellKeyPrefix) {
        return await this.db.getByCellKey(cellKeyPrefix);
    }
    
    async saveEntry(entry) {
        if (!entry.updated_at) entry.updated_at = new Date().toISOString();
        entry.id = await this.db.save('entries', entry);
        
        const idx = this.entries.findIndex(e => e.id === entry.id);
        if (idx !== -1) this.entries[idx] = entry;
        else this.entries.push(entry);
        
        await this.syncService.push('entries', entry);
        return entry;
    }
    
    async deleteEntry(id) {
        await this.db.delete('entries', id);
        this.entries = this.entries.filter(e => e.id !== id);
        await this.syncService.push('entries', id, true);
    }
}

// ==================== 3. CONFIGURATION MANAGER ====================
export class ConfigManager {
    constructor() {
        this.eurRate = parseFloat(localStorage.getItem('default_eur_rate')) || 400;
        this.useSupabase = localStorage.getItem('supabase_use') === 'true';
        this.supabaseConfig = {
            url: localStorage.getItem('supabase_url') || '',
            key: localStorage.getItem('supabase_key') || ''
        };
    }

    async watchDogEur(uiCallback) {
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
}

// ==================== 4. CLOUD SYNC SYSTEM ====================

export class CloudSync {
    constructor(configManager) {
        this.config = configManager;
        this.client = null;
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

                const { error } = await this.client
                    .from(storeName)
                    .upsert(data, { onConflict: customKey });

                if (error) throw error;
                console.log(`[CLOUD] ${storeName} upsert successful`);
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

            if (error) throw error;
            console.log(`[CLOUD] ${storeName} pull: ${data?.length || 0} records`);
            return data || [];

        } catch (err) {
            console.warn(`[CLOUD] Pull error from ${storeName}:`, err.message);
            return [];
        }
    }

    /**
     * Pull minden táblából
     */
    async pullAll() {
        const tables = ['items', 'months', 'entries', 'templates', 'reminders'];
        const result = {};

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
                reminders: cloudData.reminders?.length || 0
            });

            return { status: 'success', data: cloudData };

        } catch (e) {
            console.warn('[CLOUD] Full sync error:', e);
            return { status: 'error', message: e.message };
        }
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
        this.incomings = await this.db.getAll('incomings') || [];
        this.senders = await this.db.getAll('incoming_senders') || [];
        // Senders lista frissítése a bejegyzésekből
        this._updateSendersFromEntries();
    }

    /**
     * Senders lista frissítése a bejegyzésekből
     */
    _updateSendersFromEntries() {
        const senderSet = new Set();
        this.incomings.forEach(entry => {
            if (entry.sender) senderSet.add(entry.sender);
        });
        // Meglévő senders-eket megtartjuk, de újat is hozzáadunk
        const existingSenders = new Set(this.senders.map(s => s.name));
        senderSet.forEach(name => {
            if (!existingSenders.has(name)) {
                this.senders.push({ id: Date.now() + '_' + name, name, createdAt: new Date().toISOString() });
            }
        });
    }

    /**
     * Bejövő tétel hozzáadása
     * @param {string} sender - Utaló neve
     * @param {string} date - Dátum (YYYY-MM-DD)
     * @param {number} amount - Összeg
     * @returns {Promise<object>} - A létrehozott tétel
     */
    async add(sender, date, amount) {
        // Ellenőrizzük, hogy van-e már ilyen tétel
        const existing = this.incomings.find(
            entry => entry.sender === sender && entry.date === date
        );
        if (existing) {
            // Frissítjük a meglévőt
            existing.amount = amount;
            existing.updated_at = new Date().toISOString();
            await this.db.save('incomings', existing);
            return existing;
        }

        const entry = {
            sender,
            date,
            amount,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        };
        entry.id = await this.db.save('incomings', entry);
        this.incomings.push(entry);
        this._updateSendersFromEntries();
        await this.syncService.push('incomings', entry);
        return entry;
    }

    /**
     * Tétel frissítése
     */
    async update(id, data) {
        const idx = this.incomings.findIndex(e => e.id === id);
        if (idx === -1) return null;
        
        const entry = { ...this.incomings[idx], ...data, updated_at: new Date().toISOString() };
        await this.db.save('incomings', entry);
        this.incomings[idx] = entry;
        await this.syncService.push('incomings', entry);
        return entry;
    }

    /**
     * Tétel törlése
     */
    async delete(id) {
        await this.db.delete('incomings', id);
        this.incomings = this.incomings.filter(e => e.id !== id);
        await this.syncService.push('incomings', id, true);
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
        this.senders = this.senders.filter(s => s.name !== name);
        const sender = this.senders.find(s => s.name === name);
        if (sender) this.db.delete('incoming_senders', sender.id);
    }

    /**
     * Sender lista lekérése
     */
    getSenders() {
        return this.senders.map(s => s.name).sort();
    }
}