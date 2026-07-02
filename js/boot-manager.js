// js/boot-manager.js
//Indítási logika
export class BootManager {
    constructor(app) {
        this.app = app;
        this.bootSteps = [];
        this.currentStep = 0;
    }

    async boot() {
        console.log('[BOOT] Rendszer indítása...');
        
        const steps = [
            { name: 'Adatbázis kapcsolat', fn: () => this.app.db.connect() },
            { name: 'Adatok betöltése', fn: () => this._loadAllData() },
            { name: 'UI inicializálás', fn: () => this._initUI() },
            { name: 'Felhő kapcsolat', fn: () => this._initCloud() },
            { name: 'Szinkronizáció', fn: () => this._syncData() },
            { name: 'Automatikus backup', fn: () => this._initBackup() },
            { name: 'PWA regisztráció', fn: () => this._initPWA() },
            { name: 'Kész', fn: () => this._finalize() }
        ];

        for (const step of steps) {
            try {
                this.currentStep++;
                console.log(`[BOOT] ${this.currentStep}/${steps.length}: ${step.name}...`);
                await step.fn();
            } catch (error) {
                console.error(`[BOOT] Hiba a ${step.name} lépésnél:`, error);
                this.app.hmiNotif?.showToast(`Hiba: ${step.name}`, 'error');
                throw error;
            }
        }

        console.log('[BOOT] ✅ Rendszer sikeresen elindult!');
    }

    async _loadAllData() {
        await Promise.all([
            this.app.reminderManager.load(),
            this.app.items.load(),
            this.app.months.load(),
            this.app.entries.load(),
            this.app.templates.load()
        ]);
        this.app.hmiNotif?.showToast('Adatok betöltve', 'success');
    }

    async _initUI() {
        this.app.uiController.bindStaticEvents();
        this.app._initTabs();
        
        this.app.renderer.renderTable();
        this.app.remindersRenderer.renderList();
        this.app.renderStats();
        this.app.updateReminderStatus();
    }

    async _initCloud() {
        this.app.cloud.init();
        this.app.syncManager.loadPendingChanges();
        
        // Függő változtatások feldolgozása
        if (this.app.syncManager.hasPendingChanges() && navigator.onLine) {
            const processed = await this.app.syncManager.processPendingChanges();
            if (processed > 0) {
                this.app.hmiNotif.showToast(`${processed} függő változtatás szinkronizálva!`, 'success');
            }
        }
    }

    async _syncData() {
        if (this.app.config.useSupabase && navigator.onLine) {
            try {
                await this.app.syncManager.sync();
            } catch (e) {
                console.warn('[BOOT] Indításkori szinkronizáció sikertelen:', e);
            }
        }
    }

    async _initBackup() {
        this.app.backupManager.startAutoBackup();
        
        // Tab bezárás előtti mentés
        window.addEventListener('beforeunload', () => {
            this.app.backupManager.performBackup();
        });
    }

    async _initPWA() {
        this.app.pwaManager.registerServiceWorker();
        this.app.pwaManager.bindInstallPrompt();
    }

    async _finalize() {
        // Online/Offline eseményfigyelők
        window.addEventListener('online', async () => {
            console.log('[NETWORK] Online állapot helyreállt.');
            this.app.hmiNotif.showToast('Internetkapcsolat helyreállt!', 'info');
            
            if (this.app.syncManager.hasPendingChanges()) {
                await this.app.syncManager.processPendingChanges();
                await this.app.syncManager.sync();
            }
        });

        window.addEventListener('offline', () => {
            console.log('[NETWORK] Offline állapot.');
            this.app.hmiNotif.showToast('Internetkapcsolat megszakadt!', 'error');
        });
        
        // === ÚJ: HÁTTÉRFOLYAMATOK INDÍTÁSA ===
        try {
            const { BackgroundTaskManager } = await import('./background-tasks.js');
            this.app.backgroundTasks = new BackgroundTaskManager(this.app);
            this.app.backgroundTasks.startAll();
            console.log('[BOOT] Háttérfolyamatok sikeresen elindítva');
        } catch (e) {
            console.warn('[BOOT] Háttérfolyamatok indítása sikertelen:', e);
        }
       // Alkalmazás bezárás előtti cleanup
        window.addEventListener('beforeunload', () => {
            this.app.destroy();
        });
        
        console.log('[BOOT] ✅ Minden rendszer üzemkész.');
    }
}