// js/app.js – v4.1 – Dashboard + 6 tabos felület verziókezeléssel
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
import { ChartsRenderer } from './oop-charts.js';
import { RemindersRenderer } from './oop-reminders.js';
import { StorageManager } from './storage-manager.js';
import { BootManager } from './boot-manager.js';
import { BackupManager } from './backup-manager.js';
import { PwaManager } from './pwa-manager.js';
import { RemoteConfigManager } from './remote-config-manager.js';
import { OfflineHandler } from './offline-handler.js';
import { getVersionManager } from './version-manager.js';
import { VirtualTableRenderer } from './virtual-table-renderer.js';
import { DatabaseAudit } from './db-audit.js';
import { SingletonLock } from './singleton-lock.js';
import { DataSyncController } from './data-sync-controller.js';
import { DataExportController } from './data-export-controller.js';
import { DataMaintenanceController } from './data-maintenance-controller.js';
import { ServiceDevManager } from './service-dev-manager.js';
import { IncomingRenderer } from './incoming-renderer.js';

// ================================================================
// === APP OSZTÁLY ===
// ================================================================

class App {
    constructor() {
        // === 1. ALAP KOMPONENSEK ===
        this.config = new ConfigManager();
        this.db = new Database();
        this.hmiNotif = new UIModalController();
        this.storage = new StorageManager();
        this.singletonLock = new SingletonLock(this);

        // === 2. VERZIÓKEZELÉS ===
        this.version = getVersionManager();

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
        this.uiController = new UIController(this);
        this.chartsRenderer = new ChartsRenderer(this);
        this.remindersRenderer = new RemindersRenderer(this, this.hmiNotif);

        // === 8. TOVÁBBI MENEDZSEREK ===
        this.backupManager = new BackupManager(this);
        this.pwaManager = new PwaManager(this);
        this.remoteConfig = new RemoteConfigManager(this);
        this.bootManager = new BootManager(this);
        this.dbAudit = new DatabaseAudit(this);
        this.serviceDev = new ServiceDevManager(this);

        // === 9. BEJÖVŐ UTALÁSOK ===
        this.incomingManager = new IncomingManager(this.db, this.syncService);
        this.incomingRenderer = new IncomingRenderer(this);

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
        this.tabStateMachine = {
            dashboard: () => this.renderDashboard(),
            table: () => this.renderer.renderTable(),
            charts: () => this.chartsRenderer.renderAll(this.currentFilter),
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

            // === OFFLINE MÓD ELLENŐRZÉS ===
            const params = new URLSearchParams(window.location.search);
            if (params.get('offline') === 'true') {
                this.isOfflineMode = true;
                localStorage.setItem('offlineMode', 'true');
                console.log('[APP] Offline mód aktiválva (URL paraméter)');
            } else if (localStorage.getItem('offlineMode') === 'true') {
                this.isOfflineMode = true;
                console.log('[APP] Offline mód aktiválva (localStorage)');
            } else if (!navigator.onLine) {
                this.isOfflineMode = true;
                localStorage.setItem('offlineMode', 'true');
                console.log('[APP] Offline mód automatikusan (nincs hálózat)');
            }

            if (this.isOfflineMode) {
                this.config.setSupabaseEnabled(false);
                this.offline.showBanner();
                this.hmiNotif.showToast('Offline mód – csak helyi adatok', 'warning');
            }

            this.updateOnlineStatus(!this.isOfflineMode && navigator.onLine);
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

            // === BEJÖVŐ ADATOK BETÖLTÉSE ===
            await this.incomingManager.load();

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

            // === UI BETÖLTÉSE ===
            this._initTabs();

            // Dashboard alapértelmezett render
            setTimeout(() => {
                this.renderDashboard();
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
        const statusBadge = document.getElementById('supabaseStatus');
        const statusText = document.getElementById('statusText');
        if (!statusBadge || !statusText) return;

        const effectiveOnline = isOnline && !this.isOfflineMode;

        if (!effectiveOnline) {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium flex items-center gap-1';
            statusText.textContent = 'Offline';
            const eurLed = document.getElementById('eurLed');
            if (eurLed) eurLed.className = 'w-3 h-3 rounded-full bg-red-400';
        } else {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium flex items-center gap-1';
            statusText.textContent = 'Online';
            const eurLed = document.getElementById('eurLed');
            if (eurLed) eurLed.className = 'w-3 h-3 rounded-full bg-green-400';
        }
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
                        this.syncService?.sync?.().catch(() => {});
                    } else {
                        this.updateOnlineStatus(false);
                    }
                });
            } else {
                this.updateOnlineStatus(true);
                this.hmiNotif.showToast('Internetkapcsolat helyreállt', 'success');
                this.syncService?.sync?.().catch(() => {});
            }
        };

        this._offlineHandler = () => {
            console.log('[APP] Hálózat offline');
            this.isOfflineMode = true;
            localStorage.setItem('offlineMode', 'true');
            this.config.setSupabaseEnabled(false);
            this.updateOnlineStatus(false);
            this.offline.showBanner();
            this.hmiNotif.showToast('📡 Internetkapcsolat megszakadt – offline mód', 'warning');
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
        if (!this.tabStateMachine[tab]) {
            console.warn(`[APP] Ismeretlen tab: ${tab}`);
            return;
        }

        this.activeTab = tab;

        // Pane-ek elrejtése
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));

        // Aktív pane megjelenítése
        const pane = document.getElementById(`tab-${tab}`);
        if (pane) pane.classList.remove('hidden');

        // Renderer hívása
        this.tabStateMachine[tab]();
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


    // ================================================================
    // === DASHBOARD RENDER ===
    // ================================================================

    renderDashboard() {
        const entries = this.entries.entries || [];
        const items = this.items.items || [];
        const months = this.months.months || [];
        const incomings = this.incomingManager?.incomings || [];
        const eurRate = this.config.eurRate || 400;

        // === 1. KIADÁSOK ÖSSZESÍTÉSE ===
        let total = 0;
        let monthlyTotal = 0;
        let topCategory = { name: '-', amount: 0 };
        const categoryTotals = {};

        const now = dayjs();
        const currentMonth = now.format('YYYY-MM');

        entries.forEach(e => {
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            total += amount;

            const entryMonth = e.cellKey?.substring(0, 7);
            if (entryMonth === currentMonth) {
                monthlyTotal += amount;
            }

            const itemName = items.find(i => i.id === e.itemId)?.name || 'Ismeretlen';
            if (!categoryTotals[itemName]) categoryTotals[itemName] = 0;
            categoryTotals[itemName] += amount;
        });

        for (const [name, amount] of Object.entries(categoryTotals)) {
            if (amount > topCategory.amount) {
                topCategory = { name, amount };
            }
        }

        // === 2. BEJÖVŐ UTALÁSOK ÖSSZESÍTÉSE ===
        let incomingTotal = 0;
        let incomingMonthly = 0;
        let topSender = { name: '-', amount: 0 };
        const senderTotals = {};

        incomings.forEach(e => {
            const amount = e.amount || 0;
            incomingTotal += amount;

            const entryMonth = e.date?.substring(0, 7);
            if (entryMonth === currentMonth) {
                incomingMonthly += amount;
            }

            if (!senderTotals[e.sender]) senderTotals[e.sender] = 0;
            senderTotals[e.sender] += amount;
        });

        for (const [name, amount] of Object.entries(senderTotals)) {
            if (amount > topSender.amount) {
                topSender = { name, amount };
            }
        }

        // === 3. EGYENLEG ===
        const balance = incomingTotal - total;

        // === 4. NAPI ÁTLAG ===
        const daysInMonth = now.daysInMonth();
        const dailyAvg = daysInMonth > 0 ? Math.round(monthlyTotal / daysInMonth) : 0;

        // === 5. KÁRTYÁK FRISSÍTÉSE (KIADÁS) ===
        this._setElementText('dashTotal', total.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashMonthly', monthlyTotal.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashTopCategory', topCategory.name);
        this._setElementText('dashTopAmount', topCategory.amount.toLocaleString('hu-HU') + ' Ft');

        // === 6. KÁRTYÁK FRISSÍTÉSE (BEJÖVŐ) ===
        this._setElementText('dashIncomingTotal', incomingTotal.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashIncomingMonthly', incomingMonthly.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashTopSender', topSender.name);
        this._setElementText('dashTopSenderAmount', topSender.amount.toLocaleString('hu-HU') + ' Ft');

        // === 7. EGYENLEG KÁRTYA ===
        const balanceEl = document.getElementById('dashBalance');
        if (balanceEl) {
            balanceEl.textContent = balance.toLocaleString('hu-HU') + ' Ft';
            balanceEl.className = `text-2xl font-bold mt-1 ${balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`;
        }

        // === 8. NAPI ÁTLAG ===
        this._setElementText('dashDailyAvg', dailyAvg.toLocaleString('hu-HU') + ' Ft');

        // === 9. TREND SZÖVEG ===
        const monthlyAvg = this._calculateMonthlyAvg();
        const trendEl = document.getElementById('dashTotalTrend');
        if (trendEl && monthlyAvg > 0) {
            const diff = ((total - monthlyAvg * months.length) / (monthlyAvg * months.length) * 100);
            if (Math.abs(diff) > 1) {
                trendEl.textContent = `${diff > 0 ? '↗︎' : '↘︎'} ${Math.abs(diff).toFixed(1)}% az átlaghoz képest`;
                trendEl.className = `text-xs ${diff > 0 ? 'text-rose-500' : 'text-emerald-500'} mt-1`;
            } else {
                trendEl.textContent = '↔️ Az átlagos szinten';
                trendEl.className = 'text-xs text-gray-400 mt-1';
            }
        }

        // === 10. HAVI PROGRESS ===
        const progressEl = document.getElementById('dashMonthlyProgress');
        if (progressEl && monthlyAvg > 0) {
            const progress = Math.min(Math.round((monthlyTotal / monthlyAvg) * 100), 100);
            progressEl.textContent = `Havi átlag: ${progress}%`;
            progressEl.className = `text-xs ${progress > 80 ? 'text-amber-500' : progress > 60 ? 'text-blue-500' : 'text-gray-400'} mt-1`;
        }

        // === 11. HAVI TREND ===
        this._renderDashboardTrend();

        // === 12. TOP 5 LISTA ===
        this._renderDashboardTop5(categoryTotals);

        // === 13. ÉRTESÍTÉSEK ===
        this._renderDashboardNotifications();

        // === 14. GYORS INFORMÁCIÓK ===
        this._setElementText('dashEurRate', eurRate.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashEntryCount', entries.length.toString());
        this._setElementText('dashMonthCount', months.length.toString());
        this._setElementText('dashItemCount', items.length.toString());
    }

    // ================================================================
    // === DASHBOARD SEGÉDFÜGGVÉNYEK ===
    // ================================================================

    _setElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    _calculateMonthlyAvg() {
        const entries = this.entries.entries || [];
        const eurRate = this.config.eurRate || 400;
        const monthlyData = {};

        entries.forEach(e => {
            const month = e.cellKey?.substring(0, 7);
            if (!month) return;
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            if (!monthlyData[month]) monthlyData[month] = 0;
            monthlyData[month] += amount;
        });

        const months = Object.keys(monthlyData);
        if (months.length === 0) return 0;
        const total = Object.values(monthlyData).reduce((a, b) => a + b, 0);
        return Math.round(total / months.length);
    }

    // ================================================================
    // === DASHBOARD - TREND CHART ===
    // ================================================================

    _renderDashboardTrend() {
        const canvas = document.getElementById('dashboardTrendChart');
        if (!canvas) return;

        if (this._dashboardChart) {
            this._dashboardChart.destroy();
            this._dashboardChart = null;
        }

        const entries = this.entries.entries || [];
        const eurRate = this.config.eurRate || 400;
        const monthlyData = {};

        entries.forEach(e => {
            const month = e.cellKey?.substring(0, 7);
            if (!month) return;
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            if (!monthlyData[month]) monthlyData[month] = 0;
            monthlyData[month] += amount;
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        const last6Months = sortedMonths.slice(-6);
        const labels = last6Months.map(m => {
            const [year, month] = m.split('-');
            return `${month}.${year.slice(2)}`;
        });
        const data = last6Months.map(m => monthlyData[m] || 0);

        if (data.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Nincs elég adat a trend megjelenítéséhez', canvas.width / 2, canvas.height / 2);
            return;
        }

        const ctx = canvas.getContext('2d');
        this._dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Havi kiadás (Ft)',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.parsed.y.toLocaleString('hu-HU') + ' Ft'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => (value / 1000).toFixed(0) + 'k'
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ================================================================
    // === DASHBOARD - TOP 5 ===
    // ================================================================

    _renderDashboardTop5(categoryTotals) {
        const container = document.getElementById('dashTop5List');
        if (!container) return;

        const sorted = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Nincs elég adat</div>';
            return;
        }

        const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
        const icons = ['🏠', '🛒', '💡', '📱', '🚗'];

        container.innerHTML = sorted.map(([name, amount], index) => `
            <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-lg flex-shrink-0">${icons[index] || '📌'}</span>
                    <span class="text-sm font-medium text-gray-700 truncate">${name}</span>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                    <span class="text-sm font-bold text-gray-800">${amount.toLocaleString('hu-HU')} Ft</span>
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${colors[index]}"></span>
                </div>
            </div>
        `).join('');
    }

    // ================================================================
    // === DASHBOARD - ÉRTESÍTÉSEK ===
    // ================================================================

    _renderDashboardNotifications() {
        const container = document.getElementById('dashNotifications');
        if (!container) return;

        const notifications = [];
        const reminders = this.reminderManager.reminders || [];
        const now = dayjs();

        // 1. Lejárt határidők
        const overdue = reminders.filter(r => dayjs(r.due_date).isBefore(now, 'day'));
        if (overdue.length > 0) {
            notifications.push({
                type: 'danger',
                icon: '⚠️',
                text: `${overdue.length} határidő lejárt!`
            });
        }

        // 2. Közelgő határidők (7 napon belül)
        const soon = reminders.filter(r => {
            const diff = dayjs(r.due_date).diff(now, 'day');
            return diff > 0 && diff <= 7;
        });
        if (soon.length > 0) {
            notifications.push({
                type: 'warning',
                icon: '⏰',
                text: `${soon.length} határidő közeledik (7 napon belül)`
            });
        }

        // 3. Havi kiadás figyelmeztetés
        const entries = this.entries.entries || [];
        const eurRate = this.config.eurRate || 400;
        const currentMonth = now.format('YYYY-MM');
        let monthlyTotal = 0;
        entries.forEach(e => {
            const month = e.cellKey?.substring(0, 7);
            if (month === currentMonth) {
                monthlyTotal += e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            }
        });

        const monthlyAvg = this._calculateMonthlyAvg();
        if (monthlyAvg > 0 && monthlyTotal > monthlyAvg * 1.3) {
            notifications.push({
                type: 'warning',
                icon: '📈',
                text: `Havi kiadás ${Math.round((monthlyTotal / monthlyAvg - 1) * 100)}%-kal magasabb az átlagnál`
            });
        }

        // 4. EUR árfolyam változás
        const savedRate = parseFloat(localStorage.getItem('last_eur_rate')) || eurRate;
        if (savedRate !== eurRate && savedRate > 0) {
            const change = ((eurRate - savedRate) / savedRate * 100);
            if (Math.abs(change) > 2) {
                notifications.push({
                    type: 'info',
                    icon: '💶',
                    text: `EUR árfolyam ${change > 0 ? '↗︎' : '↘︎'} ${Math.abs(change).toFixed(1)}% (${savedRate} → ${eurRate} Ft)`
                });
            }
            localStorage.setItem('last_eur_rate', eurRate);
        }

        // Megjelenítés
        if (notifications.length === 0) {
            container.innerHTML = `<div class="flex items-center gap-2 text-emerald-600 text-sm">
                <span>✅</span> Minden rendben
            </div>`;
        } else {
            container.innerHTML = notifications.map(n => `
                <div class="flex items-center gap-3 text-sm p-2 rounded-xl ${n.type === 'danger' ? 'bg-red-50 text-red-700' : n.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}">
                    <span>${n.icon}</span>
                    <span>${n.text}</span>
                </div>
            `).join('');
        }
    }

// ================================================================
// 4. RÉSZ: Statisztika, Reminder, Cleanup, Indítás
// ================================================================

    // ================================================================
    // === STATISZTIKA RENDER ===
    // ================================================================

    renderStats() {
        const entries = this.entries.entries || [];
        const items = this.items.items || [];
        const months = this.months.months || [];
        const incomings = this.incomingManager?.incomings || [];
        const eurRate = this.config.eurRate || 400;

        // === KIADÁS STATISZTIKA ===
        let total = 0, card = 0, cash = 0, transfer = 0;
        entries.forEach(e => {
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            total += amount;
            if (e.paymentMethod === 'Kártya') card += amount;
            else if (e.paymentMethod === 'Utalás') transfer += amount;
            else cash += amount;
        });

        // === BEJÖVŐ STATISZTIKA ===
        let incomingTotal = 0;
        let incomingBySender = {};
        incomings.forEach(e => {
            const amount = e.amount || 0;
            incomingTotal += amount;
            if (!incomingBySender[e.sender]) incomingBySender[e.sender] = 0;
            incomingBySender[e.sender] += amount;
        });

        const topSenders = Object.entries(incomingBySender)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const statElements = {
            total: document.getElementById('statTotal'),
            card: document.getElementById('statCard'),
            cash: document.getElementById('statCash'),
            transfer: document.getElementById('statTransfer'),
            items: document.getElementById('statItems'),
            months: document.getElementById('statMonths'),
            entries: document.getElementById('statEntries'),
            fillBar: document.getElementById('statFillBar'),
            fillPercent: document.getElementById('statFillPercent'),
            // === ÚJ ELEMEK ===
            incomingTotal: document.getElementById('statIncomingTotal'),
            incomingTopSender: document.getElementById('statIncomingTopSender'),
            incomingCount: document.getElementById('statIncomingCount'),
            balance: document.getElementById('statBalance')
        };

        // === KIADÁS FRISSÍTÉS ===
        if (statElements.total) statElements.total.textContent = total.toLocaleString('hu-HU') + ' Ft';
        if (statElements.card) statElements.card.textContent = card.toLocaleString('hu-HU') + ' Ft';
        if (statElements.cash) statElements.cash.textContent = cash.toLocaleString('hu-HU') + ' Ft';
        if (statElements.transfer) statElements.transfer.textContent = transfer.toLocaleString('hu-HU') + ' Ft';
        if (statElements.items) statElements.items.textContent = items.length;
        if (statElements.months) statElements.months.textContent = months.length;
        if (statElements.entries) statElements.entries.textContent = entries.length;

        // === KITÖLTÖTTSÉG ===
        const totalCells = items.length * months.length;
        const filledCells = entries.filter(e => e.cellKey).length;
        const fillPercent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
        if (statElements.fillBar) statElements.fillBar.style.width = fillPercent + '%';
        if (statElements.fillPercent) statElements.fillPercent.textContent = fillPercent + '%';

        // === BEJÖVŐ FRISSÍTÉS ===
        if (statElements.incomingTotal) {
            statElements.incomingTotal.textContent = incomingTotal.toLocaleString('hu-HU') + ' Ft';
        }
        if (statElements.incomingCount) {
            statElements.incomingCount.textContent = incomings.length;
        }
        if (statElements.incomingTopSender) {
            const top = topSenders[0];
            statElements.incomingTopSender.textContent = top
                ? `${top[0]} (${top[1].toLocaleString('hu-HU')} Ft)`
                : '-';
        }
        if (statElements.balance) {
            const balance = incomingTotal - total;
            statElements.balance.textContent = balance.toLocaleString('hu-HU') + ' Ft';
            statElements.balance.className = `text-2xl font-bold mt-2 ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
        }
    }

    // ================================================================
    // === REMINDER STÁTUSZ ===
    // ================================================================

    updateReminderStatus() {
        const reminders = this.reminderManager.reminders || [];
        const today = dayjs();
        let overdue = 0, soon = 0;

        reminders.forEach(rem => {
            const due = dayjs(rem.due_date);
            const diff = due.diff(today, 'day');
            if (diff < 0) overdue++;
            else if (diff <= 7) soon++;
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
        
        if (typeof this.renderDashboard === 'function') {
            this.renderDashboard();
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
    if (typeof this.renderDashboard === 'function') {
        this.renderDashboard();
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
        let created = 0;

        for (let i = 0; i < count; i++) {
            const itemId = itemIds[Math.floor(Math.random() * itemIds.length)];
            const month = months[Math.floor(Math.random() * months.length)];
            const amount = Math.round(Math.random() * 49000 + 1000);
            const currency = Math.random() < 0.15 ? 'EUR' : 'HUF';
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
            const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
            const timestamp = dayjs(`${month}-${day}`).toISOString();
            const cellKey = `${itemId}_${month}`;

            await this.entries.saveEntry({
                cellKey,
                amount,
                currency,
                paymentMethod,
                note: 'Teszt adat',
                color: '#c7d2fe',
                timestamp,
                updated_at: new Date().toISOString()
            });
            created++;
        }

        await Promise.all([
            this.items.load(),
            this.months.load(),
            this.entries.load()
        ]);

        return created;
    }

    async generateTestReminders(count = 10) {
        const titles = ['Rezsi fizetés', 'Bérlés', 'Telefon számla', 'Bankkártya', 'Bevásárlás', 'Előfizetés', 'Adó befizetés'];
        const frequencies = ['once', 'monthly', 'quarterly'];
        let created = 0;

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
            await this.reminderManager.add(reminder);
            created++;
        }

        return created;
    }

    async clearAllData() {
        const stores = ['entries', 'items', 'months', 'templates', 'reminders', 'incomings', 'incoming_senders'];
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
    }
}

// ================================================================
// === DEBUG CONSOLE PATCH + DEBUG PANEL (JAVÍTOTT) ===
// ================================================================

// Biztonságos console monkey-patch normál függvényként definálva
function setupDebugConsole() {
    if (window.__debugConsolePatched) return;
    window.__debugConsolePatched = true;

    const originalLog = console.log;
    console.log = function(...args) {
        originalLog.apply(console, args);
        try {
            const logs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
            logs.push(new Date().toLocaleTimeString('hu-HU') + ' ' + args.join(' '));
            localStorage.setItem('debug_logs', JSON.stringify(logs.slice(-100)));
        } catch(e) {}
    };

    const originalError = console.error;
    console.error = function(...args) {
        originalError.apply(console, args);
        try {
            const logs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
            logs.push('❌ ' + new Date().toLocaleTimeString('hu-HU') + ' ' + args.join(' '));
            localStorage.setItem('debug_logs', JSON.stringify(logs.slice(-100)));
        } catch(e) {}
    };

    console.log('💡 Debug console patch aktiválva');
}

// ================================================================
// === DEBUG PANEL HELPER FÜGGVÉNYEK ===
// ================================================================

function initDebugPanel() {
    const panel = document.getElementById('debugPanel');
    const toggleBtn = document.getElementById('debugToggleBtn');
    const closeBtn = document.getElementById('closeDebugPanel');

    if (!panel || !toggleBtn) return;

    let clickCount = 0;
    let clickTimer = null;
    
    toggleBtn.addEventListener('click', () => {
        clickCount++;
        clearTimeout(clickTimer);
        if (clickCount >= 5) {
            clickCount = 0;
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                updateDebugStatus();
                updateDebugLogs();
            }
        }
        clickTimer = setTimeout(() => { clickCount = 0; }, 800);
    });

    closeBtn?.addEventListener('click', () => {
        panel.classList.add('hidden');
    });

    // Debug gombok
    document.querySelectorAll('.debug-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            btn.textContent = '⏳ ...';
            btn.disabled = true;
            
            try {
                await handleDebugAction(action);
                updateDebugStatus();
                updateDebugLogs();
            } catch(e) {
                console.error('[DEBUG] Hiba:', e);
                alert('❌ Hiba: ' + e.message);
            } finally {
                btn.textContent = btn.dataset.action === 'loadData' ? '📥 Tesztadatok (30)' :
                                  btn.dataset.action === 'loadReminders' ? '⏰ Határidők (10)' :
                                  btn.dataset.action === 'refreshAll' ? '🔄 Minden frissítés' :
                                  btn.dataset.action === 'showData' ? '📊 Adatok mutatása' :
                                  '🗑️ ÖSSZES TÖRLÉSE';
                btn.disabled = false;
            }
        });
    });

    // Időzítők
    setInterval(() => {
        if (!panel.classList.contains('hidden')) updateDebugStatus();
    }, 5000);

    setInterval(() => {
        if (!panel.classList.contains('hidden')) updateDebugLogs();
    }, 3000);

    console.log('[DEBUG] Debug panel inicializálva (5x kattintás a toggle gombra)');
}

async function handleDebugAction(action) {
    const app = window.app;
    if (!app) throw new Error('App nem elérhető!');

    switch(action) {
        case 'loadData':
            await app.generateTestData(30);
            alert('✅ 30 teszt bejegyzés generálva!');
            break;
        case 'loadReminders':
            await app.generateTestReminders(10);
            alert('✅ 10 teszt határidő generálva!');
            break;
        case 'refreshAll':
            await app.reload();
            alert('✅ Minden frissítve!');
            break;
        case 'showData':
            const items = app.items?.items?.length || 0;
            const months = app.months?.months?.length || 0;
            const entries = app.entries?.entries?.length || 0;
            const reminders = app.reminderManager?.reminders?.length || 0;
            const incomings = app.incomingManager?.incomings?.length || 0;
            alert(`📊 Adatbázis állapot:\n\n📦 Kategóriák: ${items}\n📅 Hónapok: ${months}\n📝 Bejegyzések: ${entries}\n⏰ Határidők: ${reminders}\n📥 Bejövő: ${incomings}`);
            break;
        case 'clearAll':
            if (confirm('Biztosan törölsz mindent?')) {
                await app.clearAllData();
                alert('✅ Összes adat törölve!');
                await app.reload();
            }
            break;
    }
}

function updateDebugStatus() {
    const el = document.getElementById('debugStatus');
    if (!el) return;
    const app = window.app;
    if (!app) {
        el.innerHTML = '❌ App nem található!';
        return;
    }

    const items = app.items?.items?.length || 0;
    const months = app.months?.months?.length || 0;
    const entries = app.entries?.entries?.length || 0;
    const reminders = app.reminderManager?.reminders?.length || 0;
    const incomings = app.incomingManager?.incomings?.length || 0;
    const isOnline = navigator.onLine;

    el.innerHTML = `
        <div class="grid grid-cols-2 gap-1 text-xs">
            <div>📦 Kategóriák: <strong class="text-blue-600">${items}</strong></div>
            <div>📅 Hónapok: <strong class="text-purple-600">${months}</strong></div>
            <div>📝 Bejegyzések: <strong class="text-rose-600">${entries}</strong></div>
            <div>⏰ Határidők: <strong class="text-amber-600">${reminders}</strong></div>
            <div>📥 Bejövő: <strong class="text-emerald-600">${incomings}</strong></div>
            <div>📶 Hálózat: <span class="${isOnline ? 'text-emerald-600' : 'text-red-600'}">${isOnline ? '🟢 Online' : '🔴 Offline'}</span></div>
            <div class="col-span-2 text-gray-400 text-[10px] mt-1">Verzió: ${app.version?.toString() || 'v4.1'}</div>
        </div>
    `;
}

function updateDebugLogs() {
    const el = document.getElementById('debugLogs');
    if (!el) return;
    try {
        const logs = localStorage.getItem('debug_logs');
        el.textContent = logs ? JSON.parse(logs).slice(-50).join('\n') : 'Nincs mentett log';
    } catch(e) {
        el.textContent = 'Hiba a logok betöltésekor';
    }
}

// ================================================================
// === INDÍTÁS ===
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Elsőként aktiváljuk a konzol patchelést
    setupDebugConsole();
    
    // Debug panel indítása
    setTimeout(initDebugPanel, 1200);

    const app = new App();
    window.app = app;
    window.getVersion = () => app.getVersionInfo();
    
    await app.start();
});

console.log('💡 Költség Nyilvántartó v4.1 elindult');

console.log('💡 Költség Nyilvántartó v4.1');
console.log('📌 Elérhető parancsok:');
console.log('  window.app.getVersionInfo() - Verzió információ');
console.log('  window.app.checkVersion()   - Frissítés ellenőrzés');
console.log('  window.app.reload()         - Adatok újratöltése');
console.log('  window.app.renderDashboard() - Dashboard frissítése');