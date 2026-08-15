// js/boot-manager.js
//Indítási logika
import { setBootstrapping } from './store.js';

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
        setBootstrapping(true);
        try {
            await Promise.all([
                this.app.reminderManager.load(),
                this.app.items.load(),
                this.app.months.load(),
                this.app.entries.load(),
                this.app.templates.load(),
                this.app.incomingManager?.load?.(),
                this.app.pluginStorage?.init?.(),
                this.app.workLogManager?.load?.()
            ]);
            this.app.hmiNotif?.showToast('Adatok betöltve', 'success');
        } finally {
            setBootstrapping(false);
        }
    }

    async _initUI() {
        this.app.uiController.bindStaticEvents();
        this.app._initTabs();
        
        if (this.app.remindersApp) {
            await this.app.remindersApp.boot(this.app);
        }
        
        this.app.renderer.renderTable();
        this.app.renderStats();
        this.app.updateReminderStatus();
        
        // Initial Work Log rendering
        if (this.app.workLogRenderer) {
            await this.app.workLogRenderer.render();
        }

        // Initialize Landing Page Module switcher
        this._initLandingPage();
    }

    _initLandingPage() {
        const landing = document.getElementById('appLandingScreen');
        const costApp = document.getElementById('costAppView');
        const workApp = document.getElementById('workAppView');

        const btnLaunchCost = document.getElementById('btnLaunchCostApp');
        const btnLaunchWork = document.getElementById('btnLaunchWorkApp');
        const btnCostToMenu = document.getElementById('btnCostToMenu');
        const btnWorkToMenu = document.getElementById('btnWorkToMenu');

        // Restore selected module if any
        const savedModule = localStorage.getItem('hmi_selected_module');
        if (savedModule === 'cost') {
            if (landing) landing.classList.add('hidden');
            if (costApp) costApp.classList.remove('hidden');
        } else if (savedModule === 'work') {
            if (landing) landing.classList.add('hidden');
            if (workApp) workApp.classList.remove('hidden');
            this.app.workLogRenderer?.render?.();
        }

        if (btnLaunchCost) {
            btnLaunchCost.addEventListener('click', () => {
                if (landing) landing.classList.add('hidden');
                if (costApp) costApp.classList.remove('hidden');
                localStorage.setItem('hmi_selected_module', 'cost');
            });
        }

        if (btnLaunchWork) {
            btnLaunchWork.addEventListener('click', () => {
                if (landing) landing.classList.add('hidden');
                if (workApp) workApp.classList.remove('hidden');
                localStorage.setItem('hmi_selected_module', 'work');
                this.app.workLogRenderer?.render?.();
            });
        }

        if (btnCostToMenu) {
            btnCostToMenu.addEventListener('click', () => {
                if (costApp) costApp.classList.add('hidden');
                if (landing) landing.classList.remove('hidden');
                localStorage.removeItem('hmi_selected_module');
            });
        }

        if (btnWorkToMenu) {
            btnWorkToMenu.addEventListener('click', () => {
                if (workApp) workApp.classList.add('hidden');
                if (landing) landing.classList.remove('hidden');
                localStorage.removeItem('hmi_selected_module');
            });
        }
    }

    async _initCloud() {
        this.app.cloud.init();
        if (!this.app.syncManager) {
            console.warn('[BOOT] SyncManager nem elérhető, kihagyva a felhő inicializálást');
            return;
        }

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
            
            if (this.app.syncManager && this.app.syncManager.hasPendingChanges()) {
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
        // Alkalmazás bezárás előtti cleanup és mentés
        window.addEventListener('beforeunload', () => {
            this.app.backupManager.performBackup();
            this.app.destroy();
        });
        
        console.log('[BOOT] ✅ Minden rendszer üzemkész.');
        try {
            this.app.renderer.updateFooterStatus('Minden rendszer üzemkész', false);
        } catch (e) {
            console.warn('[BOOT] Hiba a lábléc frissítésekor:', e);
        }
    }
}
