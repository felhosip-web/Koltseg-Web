// js/boot-manager.js
//Indítási logika
import { setBootstrapping } from './store.js';

export class BootManager {
    /**
     * Konstruktor - Boot Manager inicializálása
     * @param {Object} app - Az alkalmazás fő példánya
     */
    constructor(app) {
        this.app = app;
        this.bootSteps = [];
        this.currentStep = 0;
    }

    /**
     * Alkalmazás indítási folyamat végrehajtása
     * @returns {Promise<void>}
     */
    async boot() {
        console.log('[BOOT] Rendszer indítása (gyors UI váz renderelés)...');
        
        const steps = [
            { name: 'Adatbázis kapcsolat', fn: () => this.app.db.connect() },
            { name: 'UI inicializálás', fn: () => this._initUI() },
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

        // Indítsuk el a háttérfolyamatokat anélkül, hogy megvárnánk (non-blocking)
        this._runBackgroundBootTasks();

        console.log('[BOOT] ✅ Alaprendszer sikeresen elindult, adatok töltődnek a háttérben!');
    }

    /**
     * Háttérfolyamatok futtatása az indítás után
     * @returns {Promise<void>}
     */
    async _runBackgroundBootTasks() {
        console.log('[BOOT-BACKGROUND] Háttér adatbetöltés indítása...');
        try {
            if (this.app.renderer && typeof this.app.renderer.updateFooterStatus === 'function') {
                this.app.renderer.updateFooterStatus('Adatok töltődnek...', true);
            }

            await this._loadAllData();

            console.log('[BOOT-BACKGROUND] Adatok betöltve, UI frissítése...');
            // UI frissítése az adatok betöltése után
            if (this.app.renderer && typeof this.app.renderer.renderTable === 'function') {
                this.app.renderer.renderTable();
            }
            window.dispatchEvent(new Event('app-data-updated'));
            if (this.app.updateReminderStatus && typeof this.app.updateReminderStatus === 'function') {
                this.app.updateReminderStatus();
            }
            if (this.app.workLogRenderer && typeof this.app.workLogRenderer.render === 'function') {
                this.app.workLogRenderer.render();
            }
            if (this.app.tabStateMachine && this.app.activeTab && this.app.tabStateMachine[this.app.activeTab]) {
                this.app.tabStateMachine[this.app.activeTab]();
            }

            if (this.app.renderer && typeof this.app.renderer.updateFooterStatus === 'function') {
                this.app.renderer.updateFooterStatus('Adatok betöltve', false);
            }

            // További háttérfolyamatok: felhő, szinkronizáció, backup
            console.log('[BOOT-BACKGROUND] Felhő és szinkronizáció indítása...');
            try {
                await this._initCloud();
                await this._syncData();
                await this._initBackup();

                if (this.app.renderer && typeof this.app.renderer.updateFooterStatus === 'function') {
                    this.app.renderer.updateFooterStatus('Minden rendszer üzemkész', false);
                }
            } catch (serviceError) {
                console.error('[BOOT-BACKGROUND] Hiba a háttérszolgáltatások (felhő/szinkron/backup) indításakor:', serviceError);
                if (this.app.renderer && typeof this.app.renderer.updateFooterStatus === 'function') {
                    this.app.renderer.updateFooterStatus('Háttérszolgáltatási hiba', false);
                }
            }

        } catch (error) {
            console.error('[BOOT-BACKGROUND] Hiba a háttérbetöltés során:', error);
            this.app.hmiNotif?.showToast('Az adatok betöltése nem sikerült!', 'error');
            if (this.app.renderer && typeof this.app.renderer.updateFooterStatus === 'function') {
                this.app.renderer.updateFooterStatus('Adatbetöltési hiba', false);
            }
        }
    }

    /**
     * Összes alkalmazás adat betöltése
     * @returns {Promise<void>}
     */
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
            // A sikeres toast-ot kivettük, hogy ne zavarja a felhasználót induláskor,
            // de az állapotot (Minden rendszer üzemkész) a footer jelzi.
        } finally {
            setBootstrapping(false);
        }
    }

    /**
     * UI komponensek inicializálása
     * @returns {Promise<void>}
     */
    async _initUI() {
        this.app.uiController.bindStaticEvents();
        
        if (this.app.remindersApp) {
            await this.app.remindersApp.boot(this.app);
        }
        
        if (this.app.renderer && typeof this.app.renderer.renderTable === 'function') {
            this.app.renderer.renderTable();
        }
        window.dispatchEvent(new Event('app-data-updated'));

        if (this.app.updateReminderStatus && typeof this.app.updateReminderStatus === 'function') {
            this.app.updateReminderStatus();
        }
        
        // Initial Work Log rendering
        if (this.app.workLogRenderer && typeof this.app.workLogRenderer.render === 'function') {
            await this.app.workLogRenderer.render();
        }

        // Initialize Landing Page Module switcher
        this._initLandingPage();
    }

    /**
     * Landing page modul választó inicializálása
     */
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

    /**
     * Felhő szolgáltatások inicializálása
     * @returns {Promise<void>}
     */
    async _initCloud() {
        if (this.app._syncManagerPromise) {
            await this.app._syncManagerPromise;
        }
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

    /**
     * Adatok szinkronizálása a felhővel
     * @returns {Promise<void>}
     */
    async _syncData() {
        if (this.app.config.useSupabase && navigator.onLine) {
            try {
                await this.app.syncManager.sync();
            } catch (e) {
                console.warn('[BOOT] Indításkori szinkronizáció sikertelen:', e);
            }
        }
    }

    /**
     * Automatikus backup szolgáltatás indítása
     * @returns {Promise<void>}
     */
    async _initBackup() {
        this.app.backupManager.startAutoBackup();
    }

    /**
     * PWA (Progressive Web App) szolgáltatások inicializálása
     * @returns {Promise<void>}
     */
    async _initPWA() {
        this.app.pwaManager.registerServiceWorker();
        this.app.pwaManager.bindInstallPrompt();
    }

    /**
     * Boot folyamat véglegesítése és eseményfigyelők beállítása
     * @returns {Promise<void>}
     */
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
        
        console.log('[BOOT] Inicializálás kész.');
    }
}
