// js/offline-handler.js
//Egységes offline kezelés
export class OfflineHandler {
    constructor(app) {
        this.app = app;
        this.isOnline = navigator.onLine;
        this.pendingChanges = {
            items: [],
            months: [],
            entries: [],
            templates: [],
            reminders: []
        };
    }

    /**
     * Függő változtatás hozzáadása
     */
    addPendingChange(table, operation, data, key = 'id') {
        this.pendingChanges[table].push({
            operation,
            data,
            key,
            timestamp: new Date().toISOString()
        });
        
        // Mentés localStorage-ba
        this._saveToStorage();
        console.log(`[OFFLINE] ${table} ${operation} naplózva (${this.pendingChanges[table].length} függő)`);
    }

    /**
     * Függő változtatások feldolgozása (online állapotban)
     */
    async processPendingChanges() {
        if (!this.isOnline) {
            console.log('[OFFLINE] Offline, a függő változtatások később kerülnek feldolgozásra.');
            return 0;
        }

        let processed = 0;
        const errors = [];

        for (const table in this.pendingChanges) {
            const changes = this.pendingChanges[table];
            if (changes.length === 0) continue;

            for (const change of changes) {
                try {
                    if (change.operation === 'delete') {
                        await this.app.cloud.push(table, change.data, true, change.key);
                    } else {
                        await this.app.cloud.push(table, change.data);
                    }
                    processed++;
                } catch (e) {
                    errors.push({ table, change, error: e });
                    console.warn(`[OFFLINE] Sikertelen: ${table} ${change.operation}`, e);
                }
            }
            
            this.pendingChanges[table] = [];
        }

        // Mentés frissítése
        this._saveToStorage();

        if (errors.length > 0) {
            console.warn(`[OFFLINE] ${errors.length} változtatás sikertelen`);
        }

        if (processed > 0) {
            console.log(`[OFFLINE] ${processed} függő változtatás feldolgozva`);
        }

        return processed;
    }

    /**
     * Függő változtatások betöltése a localStorage-ból
     */
    loadPendingChanges() {
        try {
            const saved = localStorage.getItem('hmi_pendingChanges');
            if (saved) {
                const parsed = JSON.parse(saved);
                for (const table in this.pendingChanges) {
                    if (parsed[table]) {
                        this.pendingChanges[table] = parsed[table];
                    }
                }
                const total = this.getPendingCount();
                if (total > 0) {
                    console.log(`[OFFLINE] ${total} függő változtatás betöltve a localStorage-ból`);
                }
            }
        } catch (e) {
            console.warn('[OFFLINE] Nem sikerült betölteni a függő változtatásokat:', e);
        }
    }

    /**
     * Függő változtatások mentése localStorage-ba
     */
    _saveToStorage() {
        try {
            localStorage.setItem('hmi_pendingChanges', JSON.stringify(this.pendingChanges));
        } catch (e) {
            console.warn('[OFFLINE] Nem sikerült menteni a függő változtatásokat:', e);
        }
    }

    /**
     * Függő változtatások száma
     */
    getPendingCount() {
        return Object.values(this.pendingChanges).reduce((sum, arr) => sum + arr.length, 0);
    }

    /**
     * Van-e függő változtatás
     */
    hasPendingChanges() {
        return this.getPendingCount() > 0;
    }

    /**
     * Függő változtatások listája (részletesen)
     */
    getPendingDetails() {
        const details = {};
        for (const table in this.pendingChanges) {
            if (this.pendingChanges[table].length > 0) {
                details[table] = this.pendingChanges[table].map(c => ({
                    operation: c.operation,
                    timestamp: c.timestamp
                }));
            }
        }
        return details;
    }

    /**
     * Online/Offline állapot beállítása
     */
    setOnlineStatus(isOnline) {
        this.isOnline = isOnline;
        if (isOnline) {
            console.log('[OFFLINE] Online állapot helyreállt');
        } else {
            console.log('[OFFLINE] Offline állapot');
        }
    }
}