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
import { CellModalController } from './cell-modal-controller.js';
import { InputModalController } from './input-modal-controller.js';
import { AiModalController } from './ai-modal-controller.js';
import { StorageManager } from './storage-manager.js';
import { BootManager } from './boot-manager.js';
import { BackupManager } from './backup-manager.js';
import { PwaManager } from './pwa-manager.js';
import { RemoteConfigManager } from './remote-config-manager.js';
import { PluginStorage } from './plugin-storage.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';
import { OfflineHandler } from './offline-handler.js';
import { getVersionManager } from './version-manager.js';
import { MESSAGES, formatMessage } from './messages.js';
import { DatabaseAudit } from './db-audit.js';
import { SingletonLock } from './singleton-lock.js';
import { DataSyncController } from './data-sync-controller.js';
import { DataExportController } from './data-export-controller.js';
import { DataMaintenanceController } from './data-maintenance-controller.js';
import { ServiceDevManager } from './service-dev-manager.js';
import { setupDebugConsole, initDebugPanel } from './debug-panel.js';
import { LogManager } from './log-manager.js';
import { SecurityGuard } from './security-guard.js';
import { WorkLogManager } from './work-log.js';
import { GoogleDriveBackup } from './gdrive-backup.js';
import { ModalManager } from './modal-manager.js';
import { ModuleManager } from './module-manager.js';
import { TimeTrackerModule } from './modules/time-tracker/time-tracker.js';
import { parseCellKey } from './utils/cell-key-utils.js';
import { SyncManager } from './sync-manager.js';
import { useAppStore as useReactAppStore } from '../src/store/useAppStore.js';
import { appService } from '../src/services/appService.js';

// ================================================================
// === APP OSZTÁLY ===
// ================================================================

export class App {
    /**
     * Konstruktor - Alkalmazás fő példányának inicializálása
     */
    constructor() {
        appService.bind(this);
        // === 1. ALAP KOMPONENSEK ===
        this.config = new ConfigManager();
        this.db = new Database();
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
        if (this.db) {
            this.db.syncService = this.syncService;
        }
        this.syncController = null;
        this.exportController = null;
        this.maintenanceController = null;

        // === 5. CLOUD ===
        this.cloud = this.syncService.cloud;

        // === 6. DOMAIN MANAGEREK ===
        this.entries = new EntryManager(this.db, this.syncService);
        this.items = new ItemManager(this.db, this.syncService, this.entries);
        this.months = new MonthManager(this.db, this.syncService);
        this.templates = new TemplateManager(this.db, this.syncService);
        this.reminderManager = new ReminderManager(this.db, this.syncService);

        this.modalManager = new ModalManager(this);
        this.cellModal = new CellModalController(this);
        this.inputModal = new InputModalController(this);
        this.aiModal = new AiModalController(this);

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
        this.pluginStorage = new PluginStorage(this); // legacy compatibility
        this.pluginStorageService = new PluginStorageService(this.db, this.syncService);
        this.pluginRuntime = new PluginRuntime(this.pluginStorageService, appService);

        // === 9. BEJÖVŐ UTALÁSOK ===
        this.incomingManager = new IncomingManager(this.db, this.syncService);

        // === 9.5. MUNKA NYILVÁNTARTÁS ===
        this.workLogManager = new WorkLogManager(this.db, this.syncService);

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

    }

    // ================================================================
    // === SYNC MANAGER INICIALIZÁLÁS ===
    // ================================================================

    async _initSyncManager() {
        try {
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
    }

    _handlePageVisible() {
        console.log(`[VISIBILITY] Oldal látható → resume (${this.isDesktop() ? 'Desktop' : 'Mobile'})`);
        if (this.backgroundTasks) {
            this.backgroundTasks.resume?.();
        }
        this.updateReminderStatus?.();

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

            console.log('[APP] ✅ Alkalmazás sikeresen elindult!');

        } catch (error) {
            console.error('[APP] ❌ Indítási hiba:', error);
            this.hmiNotif.showToast('Rendszerindítási hiba!', 'error');
            try {

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
    // === SYSTEM STATUS & WORK LOG MODAL ORCHESTRATION ===
    // ================================================================

    setSystemStatus(text, isError = false) {
        if (typeof useReactAppStore?.getState === 'function') {
            useReactAppStore.getState().setSystemStatus(text, isError);
        }
    }

    openWorkModal(id = null) {
        const modal = document.getElementById('workEditorModal');
        if (!modal) return;

        let workToEdit = null;
        if (id) {
            workToEdit = (this.workLogManager?.works || []).find(w => String(w.id) === String(id));
            if (!workToEdit) {
                this.hmiNotif?.showToast?.('⚠️ A megadott munka bejegyzés nem található.', 'warning');
                return;
            }
        }

        const workForm = document.getElementById('workForm');
        if (workForm) workForm.reset();

        const title = document.getElementById('workEditorTitle');
        const idInput = document.getElementById('workIdInput');
        const nameInput = document.getElementById('workNameInput');
        const descInput = document.getElementById('workDescriptionInput');
        const locInput = document.getElementById('workLocationInput');
        const dateInput = document.getElementById('workDateInput');
        const durInput = document.getElementById('workDurationInput');
        const statusInput = document.getElementById('workStatusInput');
        const btnDelete = document.getElementById('btnDeleteWork');

        if (workToEdit) {
            if (title) title.innerText = 'Munka bejegyzés szerkesztése';
            if (idInput) idInput.value = workToEdit.id;
            if (nameInput) nameInput.value = workToEdit.name || '';
            if (descInput) descInput.value = workToEdit.description || '';
            if (locInput) locInput.value = workToEdit.location || '';
            if (dateInput) dateInput.value = workToEdit.date || '';
            if (durInput) durInput.value = workToEdit.duration || 1;
            if (statusInput) statusInput.value = workToEdit.status || 'folyamatban';
            if (btnDelete) btnDelete.classList.remove('hidden');
        } else {
            if (title) title.innerText = 'Új munka rögzítése';
            if (idInput) idInput.value = '';
            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            if (durInput) durInput.value = 1;
            if (statusInput) statusInput.value = 'folyamatban';
            if (btnDelete) btnDelete.classList.add('hidden');
        }

        const reactRoot = document.getElementById('workAppEditorRoot');
        if (reactRoot) {
            reactRoot.dispatchEvent(new CustomEvent('work-editor-open'));
        } else {
            modal.classList.remove('hidden');
        }
    }

    closeWorkModal() {
        const modal = document.getElementById('workEditorModal');
        if (!modal) return;
        const reactRoot = document.getElementById('workAppEditorRoot');
        if (reactRoot) {
            reactRoot.dispatchEvent(new CustomEvent('work-editor-close'));
        } else {
            modal.classList.add('hidden');
        }
    }

    async submitWorkForm(event) {
        if (event?.preventDefault) event.preventDefault();

        const idInput = document.getElementById('workIdInput');
        const nameInput = document.getElementById('workNameInput');
        const descInput = document.getElementById('workDescriptionInput');
        const locInput = document.getElementById('workLocationInput');
        const dateInput = document.getElementById('workDateInput');
        const durInput = document.getElementById('workDurationInput');
        const statusInput = document.getElementById('workStatusInput');

        if (!nameInput || !dateInput) {
            this.hmiNotif?.showToast?.('❌ Hiba: Hiányzó űrlap elemek!', 'error');
            return;
        }

        const nameValue = (nameInput.value || '').trim();
        if (!nameValue) {
            this.hmiNotif?.showToast?.('⚠️ Kérjük, adja meg a munka nevét!', 'warning');
            return;
        }

        const workData = {
            name: nameValue,
            description: (descInput ? descInput.value : '').trim(),
            location: (locInput ? locInput.value : '').trim(),
            date: dateInput.value,
            duration: Number(durInput ? durInput.value : 1) || 1,
            status: statusInput ? statusInput.value : 'folyamatban'
        };

        if (idInput && idInput.value) {
            workData.id = idInput.value;
        }

        try {
            await this.workLogManager.save(workData);
            this.updateReactStore();
            this.closeWorkModal();
            this.hmiNotif?.showToast?.('✅ Munka bejegyzés sikeresen mentve!', 'success');
        } catch (err) {
            console.error('[App] Hiba a munka mentése során:', err);
            this.hmiNotif?.showToast?.('❌ Hiba történt a mentés során: ' + err.message, 'error');
        }
    }

    async deleteWorkLog() {
        const idInput = document.getElementById('workIdInput');
        if (!idInput || !idInput.value) return;

        const id = idInput.value;
        const confirmed = await this.hmiNotif?.showConfirm?.({
            title: '⚠️ Törlés megerősítése',
            message: 'Biztosan törölni szeretné ezt a munka bejegyzést?',
            type: 'danger',
            confirmText: 'Törlés',
            cancelText: 'Mégse'
        });

        if (!confirmed) return;

        try {
            await this.workLogManager.delete(id);
            this.updateReactStore();
            this.closeWorkModal();
            this.hmiNotif?.showToast?.('🗑️ Munka bejegyzés sikeresen törölve!', 'success');
        } catch (err) {
            console.error('[App] Hiba a munka törlése során:', err);
            this.hmiNotif?.showToast?.('❌ Hiba történt a törlés során: ' + err.message, 'error');
        }
    }

    // ================================================================
    // === REACT SHARED API BRIDGE ===
    // ================================================================

    /**
     * Creates a snapshot of the core application data for React components.
     * @returns {Object} Data snapshot
     */
    getAppSnapshot() {
        const timeTracker = this.timeTracker;
        const timeTrackerState = timeTracker ? {
            projects: timeTracker.projects || [],
            activeTimer: timeTracker.activeTimer || null
        } : null;
        const safeJsonParse = (key, fallback = []) => {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : fallback;
            } catch (e) {
                console.warn(`[APP] Failed to parse localStorage key "${key}":`, e);
                return fallback;
            }
        };

        let calendarEvents = this.calendarEvents || safeJsonParse('plugin_calendar_events', []);
        if (!calendarEvents || calendarEvents.length === 0) {
            calendarEvents = safeJsonParse('calendar_events', []);
        }

        return {
            entries: this.entries?.entries || [],
            items: this.items?.items || [],
            months: this.months?.months || [],
            incomings: this.incomingManager?.incomings || [],
            eurRate: this.config?.eurRate || 400,
            reminders: this.reminderManager?.reminders || [],
            notes: this.notepadNotes || safeJsonParse('plugin_notepad_notes', []),
            calendarEvents: calendarEvents,
            shoppingItems: this.shoppingItems || safeJsonParse('plugin_shopping_list_items', []),
            fuelLogs: this.fuelLogs || safeJsonParse('plugin_fuel_logs', []),
            works: this.workLogManager?.works || [],
            isBooted: this.isBooted,
            timeTracker: timeTrackerState,
            lastSyncTime: this.syncService?.lastSyncTime || null,
            dayjs: window.dayjs
        };
    }

    /**
     * Subscribes a listener to app updates (compatibility stub).
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    subscribeAppData(listener) {
        return () => {};
    }

    updateReactStore() {
        const snapshot = this.getAppSnapshot();
        if (typeof useReactAppStore?.getState === 'function') {
            useReactAppStore.getState().setSnapshot(snapshot);
        }
    }

    // ================================================================
    // === HÁLÓZATI KEZELÉS ===
    // ================================================================

    updateOnlineStatus(isOnline) {
        const hasInternet = isOnline && !this.isOfflineMode;
        
        const useSupabase = this.config?.useSupabase;
        const useGDrive = this.gdriveBackup && this.gdriveBackup.isConfigured && this.gdriveBackup.isConfigured();
        const isLoggedIn = localStorage.getItem('googleUser') !== null;
        
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

    updateReminderStatus() {
        const reminders = this.reminderManager?.reminders || [];
        const today = dayjs();
        let overdue = 0, soon = 0;

        reminders.forEach(rem => {
            const due = dayjs(rem.due_date);
            const diff = due.diff(today, 'day');
            if (diff < 0) overdue++;
            else if (diff > 0 && diff <= 7) soon++;
        });

        const led = document.getElementById('reminderLed');
        const text = document.getElementById('reminderStatusText');
        const count = document.getElementById('reminderCount');

        if (!led || !text || !count) return;

        count.textContent = reminders.length;

        if (overdue > 0) {
            led.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
            text.textContent = `${overdue} LEJÁRT`;
            text.className = 'text-red-600 font-bold';
        } else if (soon > 0) {
            led.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
            text.textContent = `${soon} esedékes`;
            text.className = 'text-amber-600 font-medium';
        } else {
            led.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
            text.textContent = 'Minden rendben';
            text.className = 'text-emerald-600';
        }
    }

destroy() {
    this._cleanupTabs?.();

    if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
    }

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

    if (this.serviceDev && typeof this.serviceDev.destroy === 'function') {
        console.log('[APP] 🧹 ServiceDevManager takarítása...');
        this.serviceDev.destroy();
    }

    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[APP] Alkalmazás takarítása indul...');

    try {
        if (this._dashboardChart) {
            this._dashboardChart.destroy();
            this._dashboardChart = null;
        }

        if (this.backgroundTasks && typeof this.backgroundTasks.destroy === 'function') {
            this.backgroundTasks.destroy();
        }
        if (this.backupManager && typeof this.backupManager.destroy === 'function') {
            this.backupManager.destroy();
        }
        if (this.cellModal && typeof this.cellModal.destroy === 'function') {
            this.cellModal.destroy();
        }
        if (this.singletonLock && typeof this.singletonLock.destroy === 'function') {
            this.singletonLock.destroy();
        }

        console.log('[APP] Takarítás sikeresen befejeződött');
    } catch (e) {
        console.warn('[APP] Takarítási hiba:', e);
    }
}

async reload() {
    console.log('[APP] 🔄 Alkalmazás újratöltése...');
    this.hmiNotif.showToast('Újratöltés...', 'info');
    
    try {
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
        if (this.workLogManager && typeof this.workLogManager.load === 'function') {
            loadPromises.push(this.workLogManager.load());
        }
        
        await Promise.all(loadPromises);

        this.updateReactStore();
        
        if (typeof this.updateReminderStatus === 'function') {
            this.updateReminderStatus();
        }
        
        this.hmiNotif.showToast('✅ Adatok frissítve!', 'success');
        console.log('[APP] ✅ Újratöltés kész');
        
    } catch (e) {
        console.error('[APP] Újratöltési hiba:', e);
        this.hmiNotif.showToast('❌ Újratöltési hiba: ' + e.message, 'error');
    }
 }

    openSyncModal() {
        const modal = document.getElementById('syncModal');
        if (modal) modal.classList.remove('hidden');
    }

    openDbAuditModal() {
        const modal = document.getElementById('dbAuditModal');
        if (modal) modal.classList.remove('hidden');
    }

    handleCellClick(cellElement) {
        this.cellModal?.open(cellElement);
    }

    async handleRowDeleteSequence(itemIdStr, itemName) {
        const itemId = itemIdStr;
        if (!itemId) return;
        const allEntries = this.entries.entries;
        const associatedEntries = allEntries.filter(e => parseCellKey(e).itemId === itemId);

        let confirmed = false;
        try {
            confirmed = await this.hmiNotif.showConfirm({
               title: '⚠️ KRITIKUS: Kategóriasor törlése',
               message: `Biztosan törölni szeretné a teljes "${itemName.toUpperCase()}" kategóriát az összes havi rész-tételével (${associatedEntries.length} db) együtt?`,
              type: 'danger',
               confirmText: 'SOR TÖRLÉSE'
             });
        } catch (err) {
            console.error('[HMI PURGE ERROR] Modal hiba:', err);
            return;
        }

        if (confirmed) {
            try {
                for (const entry of associatedEntries) {
                    await this.entries.deleteEntry(entry.id).catch(e => console.warn('Entry már törölve:', entry.id));
                }
                await this.items.delete(itemId);

                await this.items.load().catch(() => {});
                await this.entries.load().catch(() => {});

                this.updateReactStore?.();
                this.hmiNotif.showToast(`"${itemName}" sikeresen eltávolítva.`, 'success');
            } catch (error) {
                console.error('[HMI PURGE CRITICAL ERROR]', error);
                this.hmiNotif.showToast('Hiba törlés közben.', 'error');
            }
        }
    }

    async handleMonthDeleteSequence(month) {
        if (!month) return;
        const allEntries = this.entries.entries;
        const associatedEntries = allEntries.filter(e => {
            return parseCellKey(e).month === month;
        });

        const confirmed = await this.hmiNotif.showConfirm({
            title: '⚠️ KRITIKUS: Hónap lezárása / törlése',
            message: `Biztosan törölni szeretné a(z) "${month}" hónapot az összes benne lévő rész-tételével (${associatedEntries.length} db) együtt?`,
            type: 'danger',
            confirmText: 'HÓNAP TÖRLÉSE'
        });

        if (confirmed) {
            try {
                for (const entry of associatedEntries) {
                    await this.entries.deleteEntry(entry.id).catch(e => console.warn('Entry már törölve:', entry.id));
                }
                await this.months.delete(month);

                await this.months.load().catch(() => {});
                await this.entries.load().catch(() => {});

                this.updateReactStore?.();
                this.hmiNotif.showToast(`"${month}" hónap sikeresen eltávolítva.`, 'success');
            } catch (error) {
                console.error('[HMI PURGE MONTH CRITICAL ERROR]', error);
                this.hmiNotif.showToast('Hiba a hónap törlésekor.', 'error');
            }
        }
    }

    togglePanel(id) {
        document.getElementById(id)?.classList.toggle('hidden');
    }

    applyDarkMode(isDark) {
        const body = document.body;
        const statusText = document.getElementById('darkModeStatusText');
        if (isDark) {
            body.classList.add('dark-mode');
            if (statusText) statusText.textContent = 'Aktív állapot: Bekapcsolva (Sötét mód)';
        } else {
            body.classList.remove('dark-mode');
            if (statusText) statusText.textContent = 'Aktív állapot: Kikapcsolva (Világos mód)';
        }
    }

    applyBgTheme(theme) {
        const body = document.body;
        body.classList.remove('bg-theme-cream', 'bg-theme-sage', 'bg-theme-ice', 'bg-theme-lavender', 'bg-theme-slate', 'bg-theme-emerald-slate', 'theme-custom-bg');
        if (theme !== 'white') {
            body.classList.add('theme-custom-bg');
            body.classList.add(`bg-theme-${theme}`);
        }
        if (theme === 'emerald-slate') {
            body.classList.add('dark-mode');
        } else {
            const savedDarkMode = localStorage.getItem('appearance_dark_mode') === 'true';
            if (savedDarkMode) {
                body.classList.add('dark-mode');
            } else {
                body.classList.remove('dark-mode');
            }
        }
    }

    updateBgThemeSelectorUI(selectedTheme) {
        const themeBgButtons = document.querySelectorAll('#themeBgSelectorContainer [data-bg-theme]');
        themeBgButtons.forEach(btn => {
            const theme = btn.getAttribute('data-bg-theme');
            const checkIcon = btn.querySelector('.check-icon');
            if (theme === selectedTheme) {
                btn.classList.add('border-indigo-600');
                btn.classList.remove('border-gray-200');
                checkIcon?.classList.remove('hidden');
            } else {
                btn.classList.remove('border-indigo-600');
                btn.classList.add('border-gray-200');
                checkIcon?.classList.add('hidden');
            }
        });
    }

    renderLogs() {
        const listContainer = document.getElementById('settingsLogsList');
        if (!listContainer || !this.logger) return;

        const logs = this.logger.getLogs();
        if (logs.length === 0) {
            listContainer.replaceChildren();
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-center py-8 text-gray-400 italic';
            emptyDiv.textContent = 'Nincsenek események rögzítve';
            listContainer.appendChild(emptyDiv);
            return;
        }

        listContainer.replaceChildren();
        logs.forEach(log => {
            let badgeClass = 'bg-gray-100 text-gray-700';
            if (log.level === 'error') badgeClass = 'bg-red-100 text-red-700 font-bold';
            else if (log.level === 'warn') badgeClass = 'bg-amber-100 text-amber-700 font-bold';
            else if (log.level === 'success') badgeClass = 'bg-emerald-100 text-emerald-700 font-bold';
            else if (log.level === 'conflict') badgeClass = 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-200';

            let categoryIcon = 'fa-info-circle';
            if (log.category === 'sync') categoryIcon = 'fa-sync';
            else if (log.category === 'db') categoryIcon = 'fa-database';
            else if (log.category === 'auth') categoryIcon = 'fa-user-shield';
            else if (log.category === 'reminder') categoryIcon = 'fa-clock';
            else if (log.category === 'conflict') categoryIcon = 'fa-code-branch';

            const row = document.createElement('div');
            row.className = 'flex items-start gap-2.5 p-2 hover:bg-gray-100/60 rounded-xl transition-all border-b border-gray-100/50 last:border-b-0';

            const timeSpan = document.createElement('span');
            timeSpan.className = 'text-[10px] text-gray-400 font-mono select-none pt-0.5 shrink-0';
            timeSpan.textContent = log.formattedTime || '';

            const badgeSpan = document.createElement('span');
            badgeSpan.className = `px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badgeClass} shrink-0 flex items-center gap-1`;
            const icon = document.createElement('i');
            icon.className = `fas ${categoryIcon}`;
            badgeSpan.appendChild(icon);
            badgeSpan.appendChild(document.createTextNode(` ${log.category || ''}`));

            const msgSpan = document.createElement('span');
            msgSpan.className = 'text-xs text-gray-700 leading-normal break-all';
            msgSpan.textContent = log.message || '';

            row.appendChild(timeSpan);
            row.appendChild(badgeSpan);
            row.appendChild(msgSpan);
            listContainer.appendChild(row);
        });
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
    setupDebugConsole();
    setTimeout(initDebugPanel, 1200);

    const app = new App();
    appService.bind(app);
    window.getVersion = () => app.getVersionInfo();

    window.runDbHealthCheck = async () => {
        if (!app || !app.db) {
            console.error('Nincs db!');
            return;
        }
        console.log('🔄 DB Egészségügyi Ellenőrzés futtatása...');
        const stores = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works', 'deleted_records'];
        const summary = { storeCounts: {} };

        for (const s of stores) {
            const data = await app.db.getAll(s);
            summary.storeCounts[s] = data.length;
        }

        const entries = await app.db.getAll('entries');
        const itemIds = new Set((await app.db.getAll('items')).map(i => i.id));
        const monthSet = new Set((await app.db.getAll('months')).map(m => m.month));

        let orphans = 0;
        let badCellKeys = 0;
        let missingExplicitFields = 0;

        entries.forEach(e => {
            if (!e.itemId || !e.month) missingExplicitFields++;

            const parsed = parseCellKey(e);
            let itemId = e.itemId || parsed.itemId;
            let month = e.month || parsed.month;

            if (!itemId || !month) {
                badCellKeys++;
                orphans++;
            } else if (!itemIds.has(itemId) || !monthSet.has(month)) {
                orphans++;
            }
        });

        summary.consistency = { orphans, badCellKeys, missingExplicitFields };

        if (app.syncService) {
            summary.queueStatus = app.syncService.getQueueStatus();
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

if (typeof window !== 'undefined' && !window.__DISABLE_AUTO_INIT__) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
}

console.log('💡 Költség Nyilvántartó v4.1 elindult');

console.log('💡 Költség Nyilvántartó v4.1');
console.log('📌 Elérhető parancsok:');
console.log('  appService.getAppInstance()?.getVersionInfo() - Verzió információ');

console.log('  window.runDbHealthCheck()   - Adatbázis állapot ellenőrzése');
