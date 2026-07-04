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
     * Csak pull (delegálás)
     */
    async executePull() {
        if (!this.service) return [];
        return this.service.pull('all');
    }

    /**
     * Csak push (delegálás)
     */
    async executePush() {
        if (!this.service) return;
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
    }

    // ========================================================
    // === HIÁNYZÓ METÓDUSOK ===
    // ========================================================

    /**
     * Pull statisztikák lekérése (felhőben lévő adatok száma)
     */
    async getPullStats() {
        const stats = {};
        
        if (!this.service) {
            console.warn('[SyncManager] SyncService nem elérhető');
            // Üres statisztika
            this.tables.forEach(table => stats[table] = 0);
            return stats;
        }

        for (const table of this.tables) {
            try {
                // Ha a service-nek van pull metódusa
                if (typeof this.service.pull === 'function') {
                    const data = await this.service.pull(table);
                    stats[table] = data?.length || 0;
                } 
                // Ha a service-nek van cloud pull metódusa
                else if (this.service.cloud && typeof this.service.cloud.pull === 'function') {
                    const data = await this.service.cloud.pull(table);
                    stats[table] = data?.length || 0;
                }
                // Ha nincs pull, akkor 0
                else {
                    stats[table] = 0;
                }
            } catch (e) {
                console.warn(`[SyncManager] Pull stats hiba a ${table} táblánál:`, e);
                stats[table] = 0;
            }
        }
        
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
