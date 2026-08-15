// js/app.js – v5.3.0 – Dashboard + Dinamikus Modul Kezelő & Plugin Architektúra
import './local-storage-sandbox.js';
// ================================================================
// 1. RÉSZ: Importok, Konstruktor, Segédfüggvények
// ================================================================

import { 
    Database, ConfigManager, CloudSync, 
    ItemManager, MonthManager, EntryManager, 
    TemplateManager, ReminderManager, IncomingManager 
} from './oop-core.js';
import { SyncService } from './sync-service.js';
import { UIModalController } from './ui-modal-controller.js';
import { UIController } from './ui-controller.js';
import { AiModalController } from './ai-modal-controller.js';
import { ChartsRenderer } from './oop-charts.js';
import { RemindersRenderer, RemindersApp } from './oop-reminders.js';
import { StorageManager } from './storage-manager.js';
import { setGlobalDb } from './store.js';
import { BootManager } from './boot-manager.js';
import { BackupManager } from './backup-manager.js';
import { PwaManager } from './pwa-manager.js';
import { RemoteConfigManager } from './remote-config-manager.js';
import { OfflineHandler } from './offline-handler.js';
import { getVersionManager } from './version-manager.js';
import { MESSAGES, formatMessage } from './messages.js';
import { VirtualTableRenderer } from './virtual-table-renderer.js';
import { DatabaseAudit } from './db-audit.js';
import { SingletonLock } from './singleton-lock.js';
import { DataSyncController } from './data-sync-controller.js';
import { DataExportController } from './data-export-controller.js';
import { DataMaintenanceController } from './data-maintenance-controller.js';
import { ServiceDevManager } from './service-dev-manager.js';
import { DashboardV2 } from './views/dashboard-v2.js';
import { DashboardRenderer } from './dashboard-renderer.js';
import { StatsRenderer } from './stats-renderer.js';
import { setupDebugConsole, initDebugPanel } from './debug-panel.js';
import { IncomingRenderer } from './incoming-renderer.js';
import { LogManager } from './log-manager.js';
import { SecurityGuard } from './security-guard.js';
import { WorkLogManager, WorkLogRenderer } from './work-log.js';
import { GoogleDriveBackup } from './gdrive-backup.js';
import { ModalManager } from './modal-manager.js';
import { ModuleManager } from './module-manager.js';
import { TimeTrackerModule } from './modules/time-tracker/time-tracker.js';

// ================================================================
// === APP OSZTÁLY ===
// ================================================================

class App {
    constructor() {
        // === 1. ALAP KOMPONENSEK ===
        this.config = new ConfigManager();
        this.db = new Database();
        setGlobalDb(this.db);
        this.hmiNotif = new UIModalController();
        this.storage = new StorageManager();
        this.singletonLock = new SingletonLock(this);
        this.logger = new LogManager(this);

        // === 2. VERZIÓKEZELÉS ===
        this.version = getVersionManager();
        this.messages = MESSAGES;
        this.formatMessage = formatMessage;
        window.messages = MESSAGES;
        window.formatMessage = formatMessage;

        // === 3. OFFLINE KEZELÉS ===
        this.offline = new OfflineHandler(this);

        // === 4. SZINKRONIZÁCIÓS SZOLGÁLTATÁS ===
        this.syncService = new SyncService(this.config, this.offline);
        if (typeof this.syncService.setApp === 'function') {
            this.syncService.setApp(this);
        }
        this.syncController = null;
        this.exportController = null;
        this.maintenanceController = null;

        // === 5. CLOUD ===
        this.cloud = this.syncService.cloud;

        // === 6. DOMAIN MANAGEREK ===
        this.items = new ItemManager(this.db, this.syncService);
        this.months = new MonthManager(this.db, this.syncService);
        this.entries = new EntryManager(this.db, this.syncService);
        this.templates = new TemplateManager(this.db, this.syncService);
        this.reminderManager = new ReminderManager(this.db, this.syncService);

        // === 7. UI RENDEREREK ===
        this.renderer = new VirtualTableRenderer(this);
        this.modalManager = new ModalManager(this);
        this.uiController = new UIController(this);
        this.aiModal = new AiModalController(this);
        this.chartsRenderer = new ChartsRenderer(this);
        this.remindersRenderer = new RemindersRenderer(this, this.hmiNotif);
        this.remindersApp = new RemindersApp();

        // === 8. TOVÁBBI MENEDZSEREK ===
        this.backupManager = new BackupManager(this);
        this.gdriveBackup = new GoogleDriveBackup(this);
        this.pwaManager = new PwaManager(this);
        this.remoteConfig = new RemoteConfigManager(this);
        this.bootManager = new BootManager(this);
        this.dbAudit = new DatabaseAudit(this);
        this.serviceDev = new ServiceDevManager(this);
        this.securityGuard = new SecurityGuard(this);
        this.moduleManager = new ModuleManager(this);

        // === 9. BEJÖVŐ UTALÁSOK ===
        this.incomingManager = new IncomingManager(this.db, this.syncService);
        this.incomingRenderer = new IncomingRenderer(this);

        // === 9.5. MUNKA NYILVÁNTARTÁS ===
        this.workLogManager = new WorkLogManager(this.db, this.syncService);
        this.workLogRenderer = new WorkLogRenderer(this, this.workLogManager);

        // === 9.6. TIME TRACKER ===
        this.timeTracker = new TimeTrackerModule(this);

        // === 10. HÁTTÉR ÉS ÁLLAPOTOK ===
        this.backgroundTasks = null;
        this.isShuttingDown = false;
        this.isVisible = true;
        this.visibilityHandler = null;

        // === 11. SYNC MANAGER ===
        this.syncManager = null;
        this._syncManagerPromise = this._initSyncManager();

        // === 12. ÁLLAPOTOK ===
        this.currentFilter = 'all';
        this.activeTab = 'dashboard';
        this.isBooted = false;
        this.isOfflineMode = false;
        this._networkListenersAdded = false;
        this._onlineHandler = null;
        this._offlineHandler = null;
        this._dashboardChart = null;

        // === 13. TAB ÁLLAPOTGÉP ===
        this.dashboardV2 = new DashboardV2(this);
        this.dashboardRenderer = new DashboardRenderer(this);
        this.statsRenderer = new StatsRenderer(this);

        this.tabStateMachine = {
            dashboard: () => {
                const container = document.getElementById('tab-dashboard');
                if (container) {
                    container.innerHTML = this.dashboardV2.render();
                    this.dashboardV2.attachEvents();
                }
            },
            table: () => this.renderer.renderTable(),
            charts: () => this.chartsRenderer.renderAll(this.currentFilter),
            time: () => this.timeTracker.renderTab(),
            reminders: () => this.remindersRenderer.renderList(),
            incoming: () => this.incomingRenderer.render(),
            stats: () => this.renderStats()
        };
    }

    // ================================================================
    // === SYNC MANAGER INICIALIZÁLÁS ===
    // ================================================================

    async _initSyncManager() {
        try {
            const { SyncManager } = await import('./sync-manager.js');
            this.syncManager = new SyncManager(this);
        } catch (e) {
            console.log('[APP] SyncManager nem szükséges (csak kompatibilitás)');
        }
    }

    // ================================================================
    // === PLATFORM DETEKTÁLÁS ===
    // ================================================================

    isDesktop() {
        return !('ontouchstart' in window) &&
            window.innerWidth > 768 &&
            window.matchMedia('(pointer: fine)').matches;
    }

    // ================================================================
    // === VISIBILITY API KEZELÉS ===
    // ================================================================

    _setupVisibilityHandling() {
        this.visibilityHandler = () => {
            const wasVisible = this.isVisible;
            this.isVisible = document.visibilityState === 'visible';

            if (this.isVisible && !wasVisible) {
                this._handlePageVisible();
            } else if (!this.isVisible) {
                this._handlePageHidden();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
        this.isVisible = document.visibilityState === 'visible';
    }

    _handlePageHidden() {
        console.log(`[VISIBILITY] Oldal rejtve → ${this.isDesktop() ? 'Desktop' : 'Mobile'} mód`);
        if (this.backgroundTasks) {
            this.backgroundTasks.pause?.();
        }
        if (this.isDesktop()) {
            if (this.chartsRenderer) this.chartsRenderer._destroyOldCharts?.();
        }
    }

    _handlePageVisible() {
        console.log(`[VISIBILITY] Oldal látható → resume (${this.isDesktop() ? 'Desktop' : 'Mobile'})`);
        if (this.backgroundTasks) {
            this.backgroundTasks.resume?.();
        }
        this.updateReminderStatus?.();

        this.tabStateMachine[this.activeTab]?.();

        if (this.syncManager?.hasPendingChanges?.() && navigator.onLine) {
            this.syncManager.processPendingChanges?.().catch(() => {});
        }
    }
    
// ================================================================
// 2. RÉSZ: start(), Verziókezelés, Hálózatkezelés
// ================================================================

    // ================================================================
    // === ALKALMAZÁS INDÍTÁSA ===
    // ================================================================

    async start() {
        try {
            console.log('[APP] 🚀 Alkalmazás indítása...');

            // === BIZTONSÁGI ZÁR KORAI INDÍTÁSA ===
            if (this.securityGuard) {
                this.securityGuard.init();
            }

            // === OFFLINE MÓD ELLENŐRZÉS ===
            const params = new URLSearchParams(window.location.search);
            const isSupabaseConfigured = localStorage.getItem('supabase_use') === 'true' && 
                                         localStorage.getItem('supabase_url') && 
                                         localStorage.getItem('supabase_key');

            if (params.get('offline') === 'true') {
                this.isOfflineMode = true;
                localStorage.setItem('offlineMode', 'true');
                console.log('[APP] Offline mód aktiválva (URL paraméter)');
            } else if (localStorage.getItem('offlineMode') === 'true' && !isSupabaseConfigured) {
                this.isOfflineMode = true;
                console.log('[APP] Offline mód aktiválva (localStorage)');
            } else if (!navigator.onLine && !isSupabaseConfigured) {
                this.isOfflineMode = true;
                localStorage.setItem('offlineMode', 'true');
                console.log('[APP] Offline mód automatikusan (nincs hálózat)');
            } else {
                this.isOfflineMode = false;
                localStorage.removeItem('offlineMode');
                console.log('[APP] Online mód aktiválva (felhő beállítva vagy aktív hálózat)');
            }

            if (this.isOfflineMode) {
                this.config.setSupabaseEnabled(false);
                this.offline.showBanner();
                this.hmiNotif.showToast('Offline mód – csak helyi adatok', 'warning');
            }

            const isOnline = navigator.onLine || isSupabaseConfigured;
            this.updateOnlineStatus(!this.isOfflineMode && isOnline);
            this._setupNetworkListeners();

            // === KRITIKUS: Singleton Lock ===
            const lockOk = await this.singletonLock.init();
            if (!lockOk) {
                console.warn('[APP] Megszakítva: másik példány már fut.');
                return;
            }

            // === VÁRUNK A SYNC MANAGERRE ===
            await this._syncManagerPromise;

            // === VERZIÓ BETÖLTÉSE ===
            await this.version.load();
            console.log(`[APP] 🏷️ Verzió: ${this.version.toString()}`);

            // === REMOTE CONFIG BETÖLTÉSE ===
            await this.remoteConfig.load();
            this.remoteConfig.applyToApp();

            const configStatus = this.remoteConfig.getStatus();
            console.log('[APP] Konfigurációs állapot:', configStatus);

            // === RENDSZER INDÍTÁSA ===
            await this.bootManager.boot();

            // === DINAMIKUS MODULOK ÉS BŐVÍTMÉNYEK INICIALIZÁLÁSA ===
            if (this.moduleManager) {
                await this.moduleManager.init();
            }

            this.logger?.log('system', 'success', `Alkalmazás sikeresen elindult. Verzió: ${this.version.toString()}`);

            // === VERZIÓ MEGJELENÍTÉSE ===
            this._updateVersionDisplay();

            // === VERZIÓ ELLENŐRZÉS ===
            setTimeout(() => {
                this.checkVersion().catch(() => {});
            }, 5 * 60 * 1000);

            // === CONTROLLEREK INICIALIZÁLÁSA ===
            this.dbAudit = new DatabaseAudit(this);
            this.syncController = new DataSyncController(this);
            this.exportController = new DataExportController(this);
            this.maintenanceController = new DataMaintenanceController(this);

            // === SERVICE DEV MANAGER ===
            const isServiceMode = this.serviceDev.init();
            if (isServiceMode) {
                console.log('[APP] 🛠️ Service/Dev mód aktív');
            }

            this._setupVisibilityHandling();
            this.isBooted = true;

            // Dashboard alapértelmezett render
            setTimeout(() => {
                this.tabStateMachine.dashboard();
            }, 100);

            console.log('[APP] ✅ Alkalmazás sikeresen elindult!');

        } catch (error) {
            console.error('[APP] ❌ Indítási hiba:', error);
            this.hmiNotif.showToast('Rendszerindítási hiba!', 'error');
            try {
                this.renderer.renderTable();
            } catch (e) {
                console.error('[APP] UI fallback hiba:', e);
            }
        }
    }

    // ================================================================
    // === VERZIÓKEZELÉS ===
    // ================================================================

    _updateVersionDisplay() {
        const info = this.version.getFullInfo();
        const versionEl = document.querySelector('.version-text');
        if (versionEl) {
            versionEl.textContent = info.label;
            versionEl.title = `Build: ${new Date(info.build).toLocaleString('hu-HU')}`;
        }
        const badgeEl = document.getElementById('dbVersionBadge');
        if (badgeEl) {
            badgeEl.textContent = `${info.label} (${new Date(info.build).toLocaleDateString('hu-HU')})`;
        }
        document.querySelectorAll('.app-version-label').forEach(el => {
            el.textContent = info.short;
        });
        document.title = `Költség Nyilvántartó ${info.short}`;
    }

    async checkVersion() {
        try {
            const update = await this.version.checkForUpdate();
            if (update) {
                const changelogText = this.version.getFormattedChangelog();
                const confirmed = await this.hmiNotif.showConfirm({
                    title: '🔄 Új verzió elérhető!',
                    message: `📌 Jelenlegi: ${update.current}\n📌 Új verzió: ${update.latest}\n📅 Build: ${new Date(update.build).toLocaleDateString('hu-HU')}\n\n📋 Változások:\n${changelogText || 'Nincs részletes változásnapló.'}\n\nKattints az "Újratöltés" gombra a frissítéshez.`,
                    type: 'info',
                    confirmText: '🔄 Újratöltés',
                    showCancel: true
                });
                if (confirmed) {
                    if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (const registration of registrations) {
                            await registration.update();
                        }
                    }
                    location.reload(true);
                }
            }
            return update;
        } catch (e) {
            console.warn('[APP] Verzió ellenőrzés sikertelen:', e);
            return null;
        }
    }

    getVersionInfo() {
        return this.version.getFullInfo();
    }

    // ================================================================
    // === HÁLÓZATI KEZELÉS ===
    // ================================================================

    updateOnlineStatus(isOnline) {
        const hasInternet = isOnline && !this.isOfflineMode;
        
        const useSupabase = this.config?.useSupabase;
        // Check if GDrive is active. A simple check is if we have gdriveBackup configured.
        const useGDrive = this.gdriveBackup && this.gdriveBackup.isConfigured && this.gdriveBackup.isConfigured();
        
        const isLoggedIn = localStorage.getItem('googleUser') !== null;
        
        // Update global network badges
        document.querySelectorAll('.global-network-badge').forEach(badge => {
            if (!hasInternet) {
                badge.className = 'global-network-badge text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium flex items-center gap-1 transition-colors';
            } else {
                badge.className = 'global-network-badge text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium flex items-center gap-1 transition-colors';
            }
        });
        
        document.querySelectorAll('.global-status-text').forEach(text => {
            if (!hasInternet) {
                text.textContent = 'Offline';
            } else if (useSupabase) {
                text.textContent = isLoggedIn ? 'Szerver Online (Fiók)' : 'Szerver Online';
            } else {
                text.textContent = isLoggedIn ? 'Online (Helyi + Fiók)' : 'Online (Helyi)';
            }
        });

        const eurLed = document.getElementById('eurLed');
        if (eurLed) {
            eurLed.className = hasInternet ? 'w-3 h-3 rounded-full bg-blue-400' : 'w-3 h-3 rounded-full bg-red-400';
        }

        // Update Supabase indicators
        document.querySelectorAll('.supabase-status-icon').forEach(icon => {
            if (!hasInternet) {
                icon.className = 'supabase-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 border border-transparent transition-all opacity-50';
                icon.title = 'Supabase (Offline)';
            } else if (useSupabase) {
                icon.className = 'supabase-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200 shadow-sm transition-all';
                icon.title = 'Supabase (Aktív)';
            } else {
                icon.className = 'supabase-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 border border-transparent transition-all';
                icon.title = 'Supabase (Inaktív)';
            }
        });

        // Update GDrive indicators
        document.querySelectorAll('.gdrive-status-icon').forEach(icon => {
            if (!hasInternet) {
                icon.className = 'gdrive-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 border border-transparent transition-all opacity-50';
                icon.title = 'Google Drive (Offline)';
            } else if (useGDrive) {
                icon.className = 'gdrive-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200 shadow-sm transition-all';
                icon.title = 'Google Drive (Aktív)';
            } else {
                icon.className = 'gdrive-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 border border-transparent transition-all';
                icon.title = 'Google Drive (Inaktív)';
            }
        });
    }

    _setupNetworkListeners() {
        if (this._networkListenersAdded) return;

        this._onlineHandler = () => {
            console.log('[APP] Hálózat online');
            this.offline.setOnlineStatus(true);
            this.offline.hideBanner();

            if (this.isOfflineMode) {
                this.hmiNotif.showConfirm({
                    title: '🌐 Internet elérhető',
                    message: 'Szeretnél kilépni az offline módból és szinkronizálni?',
                    confirmText: 'Igen, szinkronizálás',
                    cancelText: 'Maradok offline'
                }).then(confirmed => {
                    if (confirmed) {
                        this.isOfflineMode = false;
                        localStorage.removeItem('offlineMode');
                        this.config.setSupabaseEnabled(true);
                        this.updateOnlineStatus(true);
                        this.hmiNotif.showToast('✅ Online mód aktiválva', 'success');
                        this.logger?.log('system', 'success', 'Internetkapcsolat helyreállt. Felhasználó jóváhagyásával kiléptünk az offline módból.');
                        this.syncService?.sync?.().catch(() => {});
                    } else {
                        this.updateOnlineStatus(false);
                    }
                });
            } else {
                this.updateOnlineStatus(true);
                this.hmiNotif.showToast('Internetkapcsolat helyreállt', 'success');
                this.logger?.log('system', 'info', 'Internetkapcsolat helyreállt. A rendszer online módba lépett.');
                this.syncService?.sync?.().catch(() => {});
            }
        };

        this._offlineHandler = () => {
            console.log('[APP] Hálózat offline');
            const isSupabaseConfigured = localStorage.getItem('supabase_use') === 'true' && 
                                         localStorage.getItem('supabase_url') && 
                                         localStorage.getItem('supabase_key');
            if (!isSupabaseConfigured) {
                this.isOfflineMode = true;
                localStorage.setItem('offlineMode', 'true');
                this.config.setSupabaseEnabled(false);
            }
            this.updateOnlineStatus(false);
            this.offline.showBanner();
            this.hmiNotif.showToast('📡 Internetkapcsolat megszakadt – offline mód', 'warning');
            this.logger?.log('system', 'warn', 'Internetkapcsolat megszakadt. A rendszer offline módba lépett.');
        };

        window.addEventListener('online', this._onlineHandler);
        window.addEventListener('offline', this._offlineHandler);
        this._networkListenersAdded = true;
    }
    
// ================================================================
// 3. RÉSZ: Tab kezelés, Dashboard render
// ================================================================

    // ================================================================
    // === TAB KEZELÉS (6 TAB) ===
    // ================================================================

    switchTab(tab) {
        if (!tab) return;
        switch (tab) {
            case 'time':
            case 'time-tracker':
                if (!this.tabStateMachine['time']) {
                    this.tabStateMachine['time'] = () => this.timeTracker.renderTab();
                    this.tabStateMachine['time-tracker'] = () => this.timeTracker.renderTab();
                }
                break;
        }
        if (!this.tabStateMachine[tab] && !this.tabStateMachine[tab.replace('tab-', '')]) {
            console.warn(`[APP] Ismeretlen tab: ${tab}`);
            return;
        }

        const oldTab = this.activeTab;
        this.activeTab = tab;

        // Pane-ek elrejtése
        document.querySelectorAll('.tab-pane, .view').forEach(p => p.classList.add('hidden'));

        // Aktív pane megjelenítése
        const pane = document.getElementById(`tab-${tab}`) || document.getElementById(`${tab}-view`);
        if (pane) pane.classList.remove('hidden');

        // Renderer hívása
        if (this.tabStateMachine[tab]) {
            this.tabStateMachine[tab]();
        }

        // Modul hook esemény kiváltása
        if (this.moduleManager) {
            this.moduleManager.triggerHook('onTabChange', { newTab: tab, oldTab });
        }
    }

    showView(view) {
        this.switchTab(view);
    }

    _initTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        console.log('[APP] _initTabs() — found tab buttons:', tabButtons.length);

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;

                // Gombstílusok
                tabButtons.forEach(b => {
                    b.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
                    b.classList.add('bg-gray-100', 'text-gray-600');
                });
                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-blue-600', 'text-white', 'shadow-md');

                this.switchTab(tab);
            });
        });

        // Alapértelmezett tab
        const defaultBtn = document.querySelector('[data-tab="dashboard"]');
        if (defaultBtn) {
            console.log('[APP] _initTabs() — activating default dashboard tab');
            defaultBtn.click();
        } else {
            console.log('[APP] _initTabs() — dashboard button missing, falling back to table tab');
            document.querySelector('[data-tab="table"]')?.click();
        }
    }

    _cleanupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode?.replaceChild(newBtn, btn);
        });
        console.log('[APP] Tab event listeners takarítva');
    }

    renderDashboard() {
        this.dashboardRenderer.renderDashboard();
    }

    renderStats() {
        this.statsRenderer.renderStats();
    }

    updateReminderStatus() {
        this.statsRenderer.updateReminderStatus();
    }

 // ================================================================
// === CLEANUP (MÓDOSÍTVA) ===
// ================================================================

destroy() {
    // === TAB KEZELÉS TAKARÍTÁSA ===
    this._cleanupTabs?.();

    // === VISIBILITY HANDLER ELTÁVOLÍTÁSA ===
    if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
    }

    // === HÁLÓZATI ESEMÉNYEK ELTÁVOLÍTÁSA ===
    if (this._networkListenersAdded) {
        if (this._onlineHandler) {
            window.removeEventListener('online', this._onlineHandler);
            this._onlineHandler = null;
        }
        if (this._offlineHandler) {
            window.removeEventListener('offline', this._offlineHandler);
            this._offlineHandler = null;
        }
        this._networkListenersAdded = false;
    }

    // === SERVICE DEV MANAGER TAKARÍTÁSA ===
    if (this.serviceDev && typeof this.serviceDev.destroy === 'function') {
        console.log('[APP] 🧹 ServiceDevManager takarítása...');
        this.serviceDev.destroy();
        // NE nullázzuk ki! this.serviceDev = null;
    }

    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[APP] Alkalmazás takarítása indul...');

    try {
        // Dashboard chart
        if (this._dashboardChart) {
            this._dashboardChart.destroy();
            this._dashboardChart = null;
        }

        // Rendererek takarítása – NE nullázzuk ki a managereket!
        if (this.chartsRenderer && typeof this.chartsRenderer.destroy === 'function') {
            this.chartsRenderer.destroy();
        }
        if (this.remindersRenderer && typeof this.remindersRenderer.destroy === 'function') {
            this.remindersRenderer.destroy();
        }
        if (this.renderer && typeof this.renderer.destroy === 'function') {
            this.renderer.destroy();
        }
        if (this.backgroundTasks && typeof this.backgroundTasks.destroy === 'function') {
            this.backgroundTasks.destroy();
        }
        if (this.backupManager && typeof this.backupManager.destroy === 'function') {
            this.backupManager.destroy();
        }
        if (this.uiController && typeof this.uiController.destroy === 'function') {
            this.uiController.destroy();
        }
        if (this.singletonLock && typeof this.singletonLock.destroy === 'function') {
            this.singletonLock.destroy();
        }

        console.log('[APP] Takarítás sikeresen befejeződött');
    } catch (e) {
        console.warn('[APP] Takarítási hiba:', e);
    }
}

// ================================================================
// === ÚJRATÖLTÉS (BIZTONSÁGOS VERZIÓ) ===
// ================================================================

async reload() {
    console.log('[APP] 🔄 Alkalmazás újratöltése...');
    this.hmiNotif.showToast('Újratöltés...', 'info');
    
    // Ne hívjuk meg a destroy-t, hogy a komponensek ne nullázódjanak ki
    // this.destroy(); // ← EZT KI KELL VENNI VAGY MÓDOSÍTANI!
    
    try {
        // Biztonságos betöltés – csak a létező komponenseket töltjük
        const loadPromises = [];
        
        if (this.items && typeof this.items.load === 'function') {
            loadPromises.push(this.items.load());
        }
        if (this.months && typeof this.months.load === 'function') {
            loadPromises.push(this.months.load());
        }
        if (this.entries && typeof this.entries.load === 'function') {
            loadPromises.push(this.entries.load());
        }
        if (this.templates && typeof this.templates.load === 'function') {
            loadPromises.push(this.templates.load());
        }
        if (this.reminderManager && typeof this.reminderManager.load === 'function') {
            loadPromises.push(this.reminderManager.load());
        }
        if (this.incomingManager && typeof this.incomingManager.load === 'function') {
            loadPromises.push(this.incomingManager.load());
        }
        
        await Promise.all(loadPromises);

        // UI frissítések – csak akkor hívjuk, ha a rendererek léteznek
        if (this.renderer && typeof this.renderer.renderTable === 'function') {
            this.renderer.renderTable();
        } else if (this.renderer && typeof this.renderer.render === 'function') {
            this.renderer.render();
        }
        
        if (this.remindersRenderer && typeof this.remindersRenderer.renderList === 'function') {
            this.remindersRenderer.renderList();
        }
        
        if (typeof this.renderStats === 'function') {
            this.renderStats();
        }
        
        if (typeof this.updateReminderStatus === 'function') {
            this.updateReminderStatus();
        }
        
        if (this.activeTab === 'dashboard') {
            this.tabStateMachine.dashboard();
        }

        if (this.activeTab === 'charts' && this.chartsRenderer && typeof this.chartsRenderer.renderAll === 'function') {
            this.chartsRenderer.renderAll(this.currentFilter);
        }
        
        if (this.incomingRenderer && typeof this.incomingRenderer.render === 'function') {
            this.incomingRenderer.render();
        }

        this.hmiNotif.showToast('✅ Adatok frissítve!', 'success');
        console.log('[APP] ✅ Újratöltés kész');
        
    } catch (e) {
        console.error('[APP] Újratöltési hiba:', e);
        this.hmiNotif.showToast('❌ Újratöltési hiba: ' + e.message, 'error');
    }
 }

/**
 * Minden tab és dashboard frissítése (adatmódosítás után)
 */
refreshAllTabs() {
    console.log('[APP] 🔄 UI frissítése minden tabon...');

    // 1. Dashboard
    if (this.activeTab === 'dashboard') {
        this.tabStateMachine.dashboard();
    }

    // 2. Táblázat (VirtualTableRenderer)
    if (this.renderer) {
        if (typeof this.renderer.renderTable === 'function') {
            this.renderer.renderTable();
        } else if (typeof this.renderer.render === 'function') {
            this.renderer.render();
        }
    }

    // 3. Kimutatások (Charts)
    if (this.chartsRenderer && typeof this.chartsRenderer.renderAll === 'function') {
        this.chartsRenderer.renderAll(this.currentFilter || 'all');
    }

    // 4. Határidők
    if (this.remindersRenderer && typeof this.remindersRenderer.renderList === 'function') {
        this.remindersRenderer.renderList();
    }

    // 5. Bejövő utalások
    if (this.incomingRenderer && typeof this.incomingRenderer.render === 'function') {
        this.incomingRenderer.render();
    }

    // 6. Statisztika
    if (typeof this.renderStats === 'function') {
        this.renderStats();
    }

    // 7. Reminder státusz (lábléc)
    if (typeof this.updateReminderStatus === 'function') {
        this.updateReminderStatus();
    }

    console.log('[APP] ✅ UI frissítés kész');
}

    async generateTestData(count = 30) {
        const sampleItems = ['Kávé', 'Bérlet', 'Áram', 'Internet', 'Bevásárlás', 'Benzin', 'Mozijegy'];
        const paymentMethods = ['Kártya', 'Utalás', 'Készpénz', 'Egyéb'];
        const months = [
            dayjs().format('YYYY-MM'),
            dayjs().subtract(1, 'month').format('YYYY-MM'),
            dayjs().subtract(2, 'month').format('YYYY-MM')
        ];

        for (const month of months) {
            if (!this.months.months.includes(month)) {
                await this.months.add(month);
            }
        }

        for (const name of sampleItems) {
            if (!this.items.items.some(i => i.name === name)) {
                await this.items.add(name, '#dbeafe');
            }
        }

        const itemIds = this.items.items.map(i => i.id).filter(Boolean);
        const createdIds = [];

        for (let i = 0; i < count; i++) {
            const itemId = itemIds[Math.floor(Math.random() * itemIds.length)];
            const month = months[Math.floor(Math.random() * months.length)];
            const amount = Math.round(Math.random() * 49000 + 1000);
            const currency = Math.random() < 0.15 ? 'EUR' : 'HUF';
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
            const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
            const timestamp = dayjs(`${month}-${day}`).toISOString();
            const cellKey = `${itemId}_${month}`;

            const saved = await this.entries.saveEntry({
                cellKey,
                amount,
                currency,
                paymentMethod,
                note: 'Teszt adat',
                color: '#c7d2fe',
                timestamp,
                updated_at: new Date().toISOString()
            });
            if (saved && saved.id) {
                createdIds.push(saved.id);
            }
        }

        await Promise.all([
            this.items.load(),
            this.months.load(),
            this.entries.load()
        ]);

        return {
            count: createdIds.length,
            ids: createdIds,
            type: 'entries',
            valueOf() { return this.count; },
            toString() { return String(this.count); }
        };
    }

    async generateTestReminders(count = 10) {
        const titles = ['Rezsi fizetés', 'Bérlés', 'Telefon számla', 'Bankkártya', 'Bevásárlás', 'Előfizetés', 'Adó befizetés'];
        const frequencies = ['once', 'monthly', 'quarterly'];
        const createdIds = [];

        for (let i = 0; i < count; i++) {
            const title = titles[i % titles.length] + ' ' + (i + 1);
            const amount = Math.round(Math.random() * 9000 + 500);
            const dueDate = dayjs().add(Math.floor(Math.random() * 30), 'day').format('YYYY-MM-DD');
            const reminder = {
                title,
                amount,
                currency: 'HUF',
                due_date: dueDate,
                frequency: frequencies[Math.floor(Math.random() * frequencies.length)],
                updated_at: new Date().toISOString()
            };
            const saved = await this.reminderManager.add(reminder);
            if (saved && saved.id) {
                createdIds.push(saved.id);
            }
        }

        return {
            count: createdIds.length,
            ids: createdIds,
            type: 'reminders',
            valueOf() { return this.count; },
            toString() { return String(this.count); }
        };
    }

    async generateTestWorks(count = 10) {
        const names = ['Karbantartás', 'Takarítás', 'Fejlesztés', 'Design tervezés', 'Adatbázis migráció', 'Szerver beállítás', 'Dokumentáció írás'];
        const locations = ['Iroda', 'Otthon', 'Helyszínen', 'Távmunka'];
        const statuses = ['folyamatban', 'elvégzett', 'meghiúsult'];
        const createdIds = [];

        for (let i = 0; i < count; i++) {
            const name = names[i % names.length] + ' ' + (i + 1);
            const description = 'Ez egy automatikusan generált teszt munka leírás.';
            const location = locations[Math.floor(Math.random() * locations.length)];
            const date = dayjs().subtract(Math.floor(Math.random() * 15), 'day').format('YYYY-MM-DD');
            const duration = Math.floor(Math.random() * 8) + 1;
            const status = statuses[Math.floor(Math.random() * statuses.length)];

            const work = {
                name,
                description,
                location,
                date,
                duration,
                status,
                updated_at: new Date().toISOString()
            };
            const saved = await this.workLogManager.save(work);
            if (saved && saved.id) {
                createdIds.push(saved.id);
            }
        }

        return {
            count: createdIds.length,
            ids: createdIds,
            type: 'works',
            valueOf() { return this.count; },
            toString() { return String(this.count); }
        };
    }

    async clearAllData() {
        const stores = ['entries', 'items', 'months', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works'];
        for (const store of stores) {
            const rows = await this.db.getAll(store);
            await Promise.all(rows.map(row => {
                const key = row.id !== undefined ? row.id : row.month;
                return this.db.delete(store, key);
            }));
        }

        this.items.items = [];
        this.months.months = [];
        this.entries.entries = [];
        this.templates.templates = [];
        this.reminderManager.reminders = [];
        this.incomingManager.incomings = [];
        this.incomingManager.senders = [];
        if (this.workLogManager) this.workLogManager.works = [];
    }
}


// ================================================================
// === INDÍTÁS ===
// ================================================================

async function initApp() {
    // Elsőként aktiváljuk a konzol patchelést
    setupDebugConsole();
    
    // Debug panel indítása
    setTimeout(initDebugPanel, 1200);

    const app = new App();
    window.app = app;
    window.getVersion = () => app.getVersionInfo();

    window.runDbHealthCheck = async () => {
        if (!window.app || !window.app.db) {
            console.error('Nincs db!');
            return;
        }
        console.log('🔄 DB Egészségügyi Ellenőrzés futtatása...');
        const stores = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works', 'deleted_records'];
        const summary = { storeCounts: {} };

        for (const s of stores) {
            const data = await window.app.db.getAll(s);
            summary.storeCounts[s] = data.length;
        }

        const entries = await window.app.db.getAll('entries');
        const itemIds = new Set((await window.app.db.getAll('items')).map(i => i.id));
        const monthSet = new Set((await window.app.db.getAll('months')).map(m => m.month));

        let orphans = 0;
        let badCellKeys = 0;
        let missingExplicitFields = 0;

        entries.forEach(e => {
            if (!e.itemId || !e.month) missingExplicitFields++;
            let itemId = e.itemId;
            let month = e.month;
            if (!itemId || !month) {
                if (e.cellKey && typeof e.cellKey === 'string') {
                    const parts = e.cellKey.split('_');
                    itemId = parts[0];
                    month = parts[1];
                    if (!/^[0-9]+$/.test(itemId) && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
                        month = parts[0];
                        itemId = parts[1];
                    }
                }
            }

            if (!itemId || !month) {
                badCellKeys++;
                orphans++;
            } else if (!itemIds.has(itemId) || !monthSet.has(month)) {
                orphans++;
            }
        });

        summary.consistency = { orphans, badCellKeys, missingExplicitFields };

        if (window.app.syncService) {
            summary.queueStatus = window.app.syncService.getQueueStatus();
        }

        console.table(summary.storeCounts);
        console.table([summary.consistency]);
        if (summary.queueStatus) {
            console.table([{ pending: summary.queueStatus.pending, processing: summary.queueStatus.processing, failed: summary.queueStatus.failed, total: summary.queueStatus.total }]);
        }

        if (summary.consistency.orphans > 0 || summary.consistency.badCellKeys > 0) {
            console.warn('⚠️ Találtunk árva vagy hibás bejegyzéseket! Futtasd a UI-ról a "Adatbázis Gyógyítása" funkciót, vagy hívd meg a app.dbAudit.autoRepairDatabase() metódust!');
        } else {
            console.log('✅ Adatbázis konzisztens.');
        }

        return summary;
    };
    
    await app.start();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

console.log('💡 Költség Nyilvántartó v4.1 elindult');

console.log('💡 Költség Nyilvántartó v4.1');
console.log('📌 Elérhető parancsok:');
console.log('  window.app.getVersionInfo() - Verzió információ');
console.log('  window.app.checkVersion()   - Frissítés ellenőrzés');
console.log('  window.app.reload()         - Adatok újratöltése');
console.log('  window.app.renderDashboard() - Dashboard frissítése');
console.log('  window.runDbHealthCheck()   - Adatbázis állapot ellenőrzése');
