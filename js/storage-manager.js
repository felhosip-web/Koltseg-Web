// js/storage-manager.js
export class StorageManager {
    constructor(prefix = 'hmi_') {
        this.prefix = prefix;
        this.cache = new Map();
    }

    /**
     * Kulcs előtaggal ellátva
     */
    _key(key) {
        return `${this.prefix}${key}`;
    }

    /**
     * Mentés localStorage-ba (cache-elve)
     */
    set(key, value) {
        const fullKey = this._key(key);
        const json = JSON.stringify(value);
        localStorage.setItem(fullKey, json);
        this.cache.set(fullKey, value);
        return true;
    }

    /**
     * Betöltés localStorage-ból (cache-ből vagy storage-ból)
     */
    get(key, defaultValue = null) {
        const fullKey = this._key(key);
        
        // Cache ellenőrzés
        if (this.cache.has(fullKey)) {
            return this.cache.get(fullKey);
        }
        
        // Storage betöltés
        const raw = localStorage.getItem(fullKey);
        if (raw === null) return defaultValue;
        
        try {
            const value = JSON.parse(raw);
            this.cache.set(fullKey, value);
            return value;
        } catch {
            return defaultValue;
        }
    }

    /**
     * Törlés localStorage-ból
     */
    remove(key) {
        const fullKey = this._key(key);
        localStorage.removeItem(fullKey);
        this.cache.delete(fullKey);
        return true;
    }

    /**
     * Összes kulcs listázása (előtag alapján)
     */
    keys() {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.prefix)) {
                result.push(key.substring(this.prefix.length));
            }
        }
        return result;
    }

    /**
     * Összes adat törlése az előtag alatt
     */
    clear() {
        const keys = this.keys();
        for (const key of keys) {
            this.remove(key);
        }
        this.cache.clear();
        return keys.length;
    }
}