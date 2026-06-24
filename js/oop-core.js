// js/oop-core.js - OOP HMI Core Infrastruktúra v4.0
// Tartalmazza: SecurityManager, Database, ConfigManager, CloudSync, Domain Managerek

// ==================== 1. SECURITY MANAGER ====================
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

// ==================== 2. DATABASE ====================
export class Database {
    constructor(dbName = 'KoltsegNyilvantarto', version = 4) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this); };
            request.onerror = (e) => reject(e.target.error);
            request.onupgradeneeded = (e) => this._handleUpgrade(e.target.result);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve) => {
            if (!this.db) return resolve([]);
            try {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();

                req.onsuccess = async (e) => {
                    const rawData = e.target.result || [];
                    const validData = [];
                    for (const row of rawData) {
                        if (!row.checksum) { validData.push(row); continue; }
                        try {
                            const currentHash = await SecurityManager.generateChecksum(row);
                            if (currentHash === row.checksum) validData.push(row);
                            else validData.push(row);
                        } catch { validData.push(row); }
                    }
                    resolve(validData);
                };
                req.onerror = () => resolve([]);
            } catch { resolve([]); }
        });
    }

    async save(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!SecurityManager.validateSchema(storeName, data)) {
                return reject(new Error(`Séma validációs hiba: ${storeName}`));
            }
            try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                
                SecurityManager.generateChecksum(data).then(hash => {
                    data.checksum = hash;
                    const req = store.put(data);
                    req.onsuccess = (e) => resolve(e.target.result);
                    req.onerror = (e) => reject(e.target.error);
                });
            } catch (err) { reject(err); }
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = (e) => reject(e.target.error);
            } catch (err) { reject(err); }
        });
    }

    _handleUpgrade(db) {
        if (!db.objectStoreNames.contains('items')) 
            db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('months')) 
            db.createObjectStore('months', { keyPath: 'month' });
        if (!db.objectStoreNames.contains('templates')) 
            db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('reminders')) 
            db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('entries')) {
            const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
            store.createIndex('cellKey', 'cellKey', { unique: false });
            store.createIndex('updated_at', 'updated_at', { unique: false });
        }
    }
}

// ==================== 3. CONFIG MANAGER ====================
export class ConfigManager {
    constructor() {
        // Csak egyszer olvasunk localStorage-ból induláskor!
        this._loadFromStorage();
    }

    _loadFromStorage() {
        try {
            this.eurRate = parseFloat(localStorage.getItem('default_eur_rate')) || 400;
            this.useSupabase = localStorage.getItem('supabase_use') === 'true';
            this.supabaseConfig = {
                url: localStorage.getItem('supabase_url') || '',
                key: localStorage.getItem('supabase_key') || ''
            };
        } catch (e) {
            console.warn('[CONFIG] localStorage olvasási hiba:', e);
            this.eurRate = 400;
            this.useSupabase = false;
            this.supabaseConfig = { url: '', key: '' };
        }
    }

    /**
     * Beállítások mentése (egységesített)
     */
    saveSettings(settings) {
        const { url, key, useCloud, eurRate } = settings;

        if (url !== undefined) {
            this.supabaseConfig.url = url;
            localStorage.setItem('supabase_url', url);
        }
        if (key !== undefined) {
            this.supabaseConfig.key = key;
            localStorage.setItem('supabase_key', key);
        }
        if (useCloud !== undefined) {
            this.useSupabase = useCloud;
            localStorage.setItem('supabase_use', useCloud ? 'true' : 'false');
        }
        if (eurRate !== undefined) {
            this.eurRate = eurRate;
            localStorage.setItem('default_eur_rate', String(eurRate));
        }

        console.log('[CONFIG] Beállítások mentve:', { url, key, useCloud, eurRate });
        return true;
    }

    /**
     * Konfiguráció újratöltése localStorage-ból
     */
    reload() {
        this._loadFromStorage();
        console.log('[CONFIG] Konfiguráció újratöltve');
        return this;
    }

    /**
     * EUR árfolyam élő lekérése (watchdog)
     */
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

    /**
     * Jelenlegi állapot lekérése
     */
    getStatus() {
        return {
            useCloud: this.useSupabase,
            hasUrl: !!(this.supabaseConfig?.url),
            hasKey: !!(this.supabaseConfig?.key),
            eurRate: this.eurRate
        };
    }
}

// ==================== 4. CLOUD SYNC (ALACSONY SZINTŰ API) ====================
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
                    console.log('[CLOUD] Supabase client initialized');
                }
            } catch (e) {
                console.error('[CLOUD] Supabase initialization failed', e);
            }
        }
    }

    async upsert(storeName, data, conflictKey = 'id') {
        if (!this.client || !this.config.useSupabase) return;
        try {
            const { error } = await this.client.from(storeName).upsert(data, { 
                onConflict: conflictKey 
            });
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`[CLOUD] Upsert error on ${storeName}:`, err);
            throw err;
        }
    }

    async delete(storeName, key, keyField = 'id') {
        if (!this.client || !this.config.useSupabase) return;
        try {
            const { error } = await this.client.from(storeName).delete().eq(keyField, key);
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`[CLOUD] Delete error on ${storeName}:`, err);
            throw err;
        }
    }

    async select(storeName, query = {}) {
        if (!this.client || !this.config.useSupabase) return [];
        try {
            let q = this.client.from(storeName).select('*');
            if (query.order) {
                q = q.order(query.order.column, { ascending: query.order.ascending !== false });
            }
            if (query.limit) {
                q = q.limit(query.limit);
            }
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error(`[CLOUD] Select error on ${storeName}:`, err);
            return [];
        }
    }
}

// ==================== 5. DOMAIN MANAGEREK ====================
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
        const item = { 
            ...this.items[idx], 
            ...updatedData, 
            updated_at: new Date().toISOString() 
        };
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
        this.months = (await this.db.getAll('months')).map(m => m.month).sort(); 
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
    
    async saveEntry(entry) {
        if (!entry.updated_at) {
            entry.updated_at = new Date().toISOString();
        }
        entry.id = await this.db.save('entries', entry);
        const idx = this.entries.findIndex(e => e.id === entry.id);
        if (idx !== -1) this.entries[idx] = entry; 
        else this.entries.push(entry);
        await this.syncService.push('entries', entry);
    }
    
    async deleteEntry(id) {
        await this.db.delete('entries', id);
        this.entries = this.entries.filter(e => e.id !== id);
        await this.syncService.push('entries', id, true);
    }
    
    getByCellKey(cellKey) {
        return this.entries.filter(e => e.cellKey === cellKey);
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
            if (rem.frequency && rem.frequency !== 'once') {
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
        }
        if (updated) this.reminders = await this.db.getAll('reminders');
    }
    
    async add(reminder) {
        reminder.updated_at = new Date().toISOString();
        reminder.id = await this.db.save('reminders', reminder);
        this.reminders.push(reminder);
        await this.syncService.push('reminders', reminder);
        return reminder;
    }
    
    async update(id, updatedData) {
        const idx = this.reminders.findIndex(r => r.id === id);
        if (idx === -1) return;
        const reminder = { 
            ...this.reminders[idx], 
            ...updatedData, 
            updated_at: new Date().toISOString() 
        };
        await this.db.save('reminders', reminder);
        this.reminders[idx] = reminder;
        await this.syncService.push('reminders', reminder);
        return reminder;
    }
    
    async delete(id) {
        await this.db.delete('reminders', id);
        this.reminders = this.reminders.filter(r => r.id !== id);
        await this.syncService.push('reminders', id, true);
    }
}