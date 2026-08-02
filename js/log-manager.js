// js/log-manager.js - Eseménynapló kezelő osztály (Offline-first / PWA naplózás)

export class LogManager {
    constructor(app) {
        this.app = app;
        this.maxLogs = 500; // Maximális naplóbejegyzés szám
        this.logs = [];
        this._loadLogs();
    }

    /**
     * Naplófájlok betöltése localStorage-ból
     */
    _loadLogs() {
        try {
            const saved = localStorage.getItem('hmi_event_logs');
            if (saved) {
                this.logs = JSON.parse(saved);
                console.log(`[LOGGER] 📝 ${this.logs.length} esemény napló betöltve`);
            } else {
                this.logs = [];
                this.log('system', 'info', 'Eseménynapló rendszer elindítva.');
            }
        } catch (e) {
            console.error('[LOGGER] Hiba a naplók betöltésekor:', e);
            this.logs = [];
        }
    }

    /**
     * Naplófájlok mentése localStorage-ba
     */
    _saveLogs() {
        try {
            localStorage.setItem('hmi_event_logs', JSON.stringify(this.logs));
        } catch (e) {
            console.warn('[LOGGER] Nem sikerült menteni a naplókat:', e);
        }
        // Értesítjük a UI-t, ha létezik a frissítő callback
        if (this.onLogUpdateCallback) {
            this.onLogUpdateCallback(this.logs);
        }
    }

    /**
     * Bejegyzés hozzáadása a naplóhoz
     * @param {string} category 'system' | 'sync' | 'db' | 'auth' | 'reminder' | 'conflict'
     * @param {string} level 'info' | 'warn' | 'error' | 'success' | 'conflict'
     * @param {string} message A napló üzenete
     */
    log(category, level, message) {
        const now = new Date();
        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: now.toISOString(),
            formattedTime: now.toLocaleDateString('hu-HU') + ' ' + now.toLocaleTimeString('hu-HU'),
            category,
            level,
            message
        };

        this.logs.unshift(entry); // Legfrissebb elöl

        // Korlátozzuk a méretet
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        this._saveLogs();
        
        // Eredeti konzol log hívás is, hogy látható legyen a fejlesztői eszközökben
        const prefix = `[LOG][${category.toUpperCase()}][${level.toUpperCase()}]`;
        if (level === 'error') {
            console.error(prefix, message);
        } else if (level === 'warn') {
            console.warn(prefix, message);
        } else {
            console.log(prefix, message);
        }
    }

    /**
     * Naplók ürítése
     */
    clear() {
        this.logs = [];
        this.log('system', 'info', 'Eseménynapló törölve a felhasználó által.');
        this._saveLogs();
    }

    /**
     * Naplók lekérése
     */
    getLogs() {
        return this.logs;
    }

    /**
     * Figyelő regisztrálása a változásokra
     */
    onUpdate(callback) {
        this.onLogUpdateCallback = callback;
        callback(this.logs);
    }

    /**
     * Exportálható szöveges formátum generálása
     */
    exportToText() {
        return this.logs.map(log => {
            return `[${log.formattedTime}] [${log.category.toUpperCase()}] [${log.level.toUpperCase()}] ${log.message}`;
        }).join('\r\n');
    }
}
