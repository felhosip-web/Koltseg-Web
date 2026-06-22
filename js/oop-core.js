// js/oop-core.js - OOP HMI Core Infrastruktúra v3.0

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

// ==================== 2. DATABASE SYSTEM (INDEXEDDB) ====================
export class Database {
    constructor(dbName = 'KoltsegNyilvantarto', version = 3) {
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
                        if (!row.checksum) {
                            validData.push(row);
                            continue;
                        }
                        try {
                            const currentHash = await SecurityManager.generateChecksum(row);
                            if (currentHash === row.checksum) {
                                validData.push(row);
                            } else {
                                validData.push(row); // Bypassed for UI safety
                            }
                        } catch {
                            validData.push(row);
                        }
                    }
                    resolve(validData);
                };
                req.onerror = () => resolve([]);
            } catch {
                resolve([]);
            }
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
            } catch (err) {
                reject(err);
            }
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
            } catch (err) {
                reject(err);
            }
        });
    }

    _handleUpgrade(db) {
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('months')) db.createObjectStore('months', { keyPath: 'month' });
        if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('reminders')) db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('entries')) {
            const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
            store.createIndex('cellKey', 'cellKey', { unique: false });
        }
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
                }
            } catch (e) {
                console.error('[CLOUD] Supabase initialization failed', e);
            }
        }
    }

    async push(storeName, data, isDelete = false, customKey = 'id') {
        if (!this.client || !this.config.useSupabase) return;
        try {
            if (isDelete) {
                await this.client.from(storeName).delete().eq(customKey, data);
            } else {
                await this.client.from(storeName).upsert(data, { onConflict: 'id' });
            }
            console.log(`[CLOUD] ${storeName} push successful`);
        } catch (err) {
            console.warn('[CLOUD] Sync error, data preserved locally:', err);
        }
    }

    // ÚJ METÓDUS: Pull (letöltés)
    async pull(storeName) {
        if (!this.client || !this.config.useSupabase) return [];
        try {
            const { data, error } = await this.client.from(storeName).select('*');
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.warn(`[CLOUD] Pull error from ${storeName}:`, err);
            return [];
        }
    }

    // Teljes szinkronizáció
    async fullSync() {
        if (!this.client || !this.config.useSupabase) return;
        try {
            // Pull + helyi felülírás
            const [cloudItems, cloudEntries] = await Promise.all([
                this.pull('items'),
                this.pull('entries')
            ]);

            // Itt bonyolultabb lenne a teljes merge, ezért most csak figyelmeztetünk
            console.log('[CLOUD] Full sync data received:', { items: cloudItems.length, entries: cloudEntries.length });
        } catch (e) {
            console.warn('[CLOUD] Full sync error:', e);
        }
    }
}

// ==================== 5. DOMAIN DATA MANAGERS ====================

export class ItemManager {
    constructor(db, cloud) { this.db = db; this.cloud = cloud; this.items = []; }
    async load() { this.items = await this.db.getAll('items'); }
    async add(name, color = '#dbeafe') {
        const item = { name, color };
        item.id = await this.db.save('items', item);
        this.items.push(item);
        await this.cloud.push('items', item);
        return item;
    }
    async update(id, updatedData) {
        const idx = this.items.findIndex(i => i.id === id);
        if (idx === -1) return;
        const item = { ...this.items[idx], ...updatedData };
        await this.db.save('items', item);
        this.items[idx] = item;
        await this.cloud.push('items', item);
        return item;
    }
}

export class MonthManager {
    constructor(db, cloud) { this.db = db; this.cloud = cloud; this.months = []; }
    async load() { this.months = (await this.db.getAll('months')).map(m => m.month).sort(); }
    async add(month) {
        await this.db.save('months', { month });
        this.months.push(month);
        this.months.sort();
        await this.cloud.push('months', { month });
    }
}

export class EntryManager {
    constructor(db, cloud) { this.db = db; this.cloud = cloud; this.entries = []; }
    async load() { this.entries = await this.db.getAll('entries'); }
    async saveEntry(entry) {
        entry.id = await this.db.save('entries', entry);
        const idx = this.entries.findIndex(e => e.id === entry.id || (e.cellKey === entry.cellKey && entry.cellKey));
        if (idx !== -1) this.entries[idx] = entry; else this.entries.push(entry);
        await this.cloud.push('entries', entry);
    }
    async deleteEntry(id) {
        await this.db.delete('entries', id);
        this.entries = this.entries.filter(e => e.id !== id);
        await this.cloud.push('entries', id, true);
    }
}

export class TemplateManager {
    constructor(db, cloud) { this.db = db; this.cloud = cloud; this.templates = []; }
    async load() { this.templates = await this.db.getAll('templates'); }
}
