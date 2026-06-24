// js/sync-manager.js - Wrapper a SyncService-hez (kompatibilitás miatt)
// Ez az osztály csak továbbítja a hívásokat a SyncService-nek

export class SyncManager {
    constructor(app) {
        this.app = app;
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
        const tables = ['items', 'months', 'entries', 'templates', 'reminders'];
        for (const table of tables) {
            const data = this._getTableData(table, app);
            if (data && data.length > 0) {
                for (const item of data) {
                    await this.service.push(table, item);
                }
            }
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
        switch (table) {
            case 'items': return app.items?.items || [];
            case 'months': return app.months?.months || [];
            case 'entries': return app.entries?.entries || [];
            case 'templates': return app.templates?.templates || [];
            case 'reminders': return app.reminderManager?.reminders || [];
            default: return [];
        }
    }
}