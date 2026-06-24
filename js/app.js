// js/app.js – v4.0 – Egységes tabos felület verziókezeléssel
import { 
    Database, ConfigManager, CloudSync, 
    ItemManager, MonthManager, EntryManager, 
    TemplateManager, ReminderManager 
} from './oop-core.js';
import { SyncService } from './sync-service.js';
import { UIModalController } from './ui-modal-controller.js';
import { UIRenderer } from './ui-renderer.js';
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

class App {
    constructor() {
        // === 1. ALAP KOMPONENSEK ===
        this.config = new ConfigManager();
        this.db = new Database();
        this.hmiNotif = new UIModalController();
        this.storage = new StorageManager();

        // === 2. VERZIÓKEZELÉS ===
        this.version = getVersionManager();

        // === 3. OFFLINE KEZELÉS ===
        this.offline = new OfflineHandler(this);

        // === 4. SZINKRONIZÁCIÓS SZOLGÁLTATÁS ===
        this.syncService = new SyncService(this.config, this.offline);
        // App referencia beállítása a SyncService-nek
        if (typeof this.syncService.setApp === 'function') {
            this.syncService.setApp(this);
        }

        // === 5. CLOUD (alacsony szintű API) ===
        // A CloudSync már létrejött a SyncService konstruktorában
        this.cloud = this.syncService.cloud;

        // === 6. DOMAIN MANAGEREK ===
        this.items = new ItemManager(this.db, this.syncService);
        this.months = new MonthManager(this.db, this.syncService);
        this.entries = new EntryManager(this.db, this.syncService);
        this.templates = new TemplateManager(this.db, this.syncService);
        this.reminderManager = new ReminderManager(this.db, this.syncService);

        // === 7. UI RENDEREREK ===
        this.renderer = new UIRenderer(this);
        this.uiController = new UIController(this);
        this.chartsRenderer = new ChartsRenderer(this);
        this.remindersRenderer = new RemindersRenderer(this, this.hmiNotif);

        // === 8. TOVÁBBI MENEDZSEREK ===
        this.backupManager = new BackupManager(this);
        this.pwaManager = new PwaManager(this);
        this.remoteConfig = new RemoteConfigManager(this);
        this.bootManager = new BootManager(this);

        // === 9. SYNC MANAGER (kompatibilitási wrapper) ===
        // Dinamikus import, hogy elkerüljük a körkörös függőséget
        this._initSyncManager();

        // === 10. ÁLLAPOTOK ===
        this.currentFilter = 'all';
        this.activeTab = 'table';
        this.isBooted = false;
    }

    /**
     * SyncManager dinamikus inicializálása (körkörös függőség elkerülése)
     */
    async _initSyncManager() {
        try {
            const { SyncManager } = await import('./sync-manager.js');
            this.syncManager = new SyncManager(this);
        } catch (e) {
            console.log('[APP] SyncManager nem szükséges (csak kompatibilitás)');
        }
    }

    /**
     * Alkalmazás indítása
     */
    async start() {
        try {
            console.log('[APP] 🚀 Alkalmazás indítása...');

            // === 1. VERZIÓ BETÖLTÉSE ===
            await this.version.load();
            console.log(`[APP] 🏷️ Verzió: ${this.version.toString()}`);

            // === 2. REMOTE CONFIG BETÖLTÉSE ===
            await this.remoteConfig.load();
            this.remoteConfig.applyToApp();

            // === 3. KONFIGURÁCIÓ ELLENŐRZÉS ===
            const configStatus = this.remoteConfig.getStatus();
            console.log('[APP] Konfigurációs állapot:', configStatus);

            // === 4. RENDSZER INDÍTÁSA ===
            await this.bootManager.boot();

            // === 5. VERZIÓ MEGJELENÍTÉSE ===
            this._updateVersionDisplay();

            // === 6. VERZIÓ ELLENŐRZÉS (opcionális) ===
            // Automatikus frissítés ellenőrzés 5 perc után
            setTimeout(() => {
                this.checkVersion().catch(() => {});
            }, 5 * 60 * 1000);

            this.isBooted = true;
            console.log('[APP] ✅ Alkalmazás sikeresen elindult!');

        } catch (error) {
            console.error('[APP] ❌ Indítási hiba:', error);
            this.hmiNotif.showToast('Rendszerindítási hiba!', 'error');
            
            // Fallback: próbáljuk meg az alapvető UI-t betölteni
            try {
                this.renderer.renderTable();
            } catch (e) {
                console.error('[APP] UI fallback hiba:', e);
            }
        }
    }

    /**
     * Verzió megjelenítése a UI-ban
     */
    _updateVersionDisplay() {
        const info = this.version.getFullInfo();
        
        // Lábléc verzió
        const versionEl = document.querySelector('.version-text');
        if (versionEl) {
            versionEl.textContent = info.label;
            versionEl.title = `Build: ${new Date(info.build).toLocaleString('hu-HU')}`;
        }

        // Badge (Beállítások panelben)
        const badgeEl = document.getElementById('dbVersionBadge');
        if (badgeEl) {
            badgeEl.textContent = `${info.label} (${new Date(info.build).toLocaleDateString('hu-HU')})`;
        }

        // Document title
        document.title = `Költség Nyilvántartó ${info.short}`;
    }

    /**
     * Verzió ellenőrzés (frissítés keresés)
     */
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
                    // Service Worker frissítés kérése
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

    /**
     * Verzió információ lekérése (külső hívásokhoz)
     */
    getVersionInfo() {
        return this.version.getFullInfo();
    }

    // ==================== TAB KEZELÉS ====================
    _initTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanes = {
            table: document.getElementById('tab-table'),
            charts: document.getElementById('tab-charts'),
            reminders: document.getElementById('tab-reminders'),
            stats: document.getElementById('tab-stats')
        };

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Stílusok
                tabButtons.forEach(b => {
                    b.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
                    b.classList.add('bg-gray-100', 'text-gray-600');
                });
                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-blue-600', 'text-white', 'shadow-md');

                // Pane-ek
                Object.values(tabPanes).forEach(pane => pane.classList.add('hidden'));
                const tab = btn.dataset.tab;
                this.activeTab = tab;

                if (tabPanes[tab]) {
                    tabPanes[tab].classList.remove('hidden');
                    
                    // Frissítés szükség szerint
                    if (tab === 'charts') {
                        this.chartsRenderer.renderAll(this.currentFilter);
                    } else if (tab === 'reminders') {
                        this.remindersRenderer.renderList();
                    } else if (tab === 'stats') {
                        this.renderStats();
                    } else if (tab === 'table') {
                        this.renderer.renderTable();
                    }
                }
            });
        });

        // Alapértelmezett fül
        document.querySelector('[data-tab="table"]')?.click();
    }

    // ==================== STATISZTIKA ====================
    renderStats() {
        const entries = this.entries.entries;
        const items = this.items.items;
        const months = this.months.months;
        const eurRate = this.config.eurRate || 400;

        let total = 0, card = 0, cash = 0, transfer = 0;
        entries.forEach(e => {
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            total += amount;
            if (e.paymentMethod === 'Kártya') card += amount;
            else if (e.paymentMethod === 'Utalás') transfer += amount;
            else cash += amount;
        });

        // Kártyák frissítése
        const statElements = {
            total: document.getElementById('statTotal'),
            card: document.getElementById('statCard'),
            cash: document.getElementById('statCash'),
            transfer: document.getElementById('statTransfer'),
            items: document.getElementById('statItems'),
            months: document.getElementById('statMonths'),
            entries: document.getElementById('statEntries'),
            fillBar: document.getElementById('statFillBar'),
            fillPercent: document.getElementById('statFillPercent')
        };

        if (statElements.total) statElements.total.textContent = total.toLocaleString('hu-HU') + ' Ft';
        if (statElements.card) statElements.card.textContent = card.toLocaleString('hu-HU') + ' Ft';
        if (statElements.cash) statElements.cash.textContent = cash.toLocaleString('hu-HU') + ' Ft';
        if (statElements.transfer) statElements.transfer.textContent = transfer.toLocaleString('hu-HU') + ' Ft';
        if (statElements.items) statElements.items.textContent = items.length;
        if (statElements.months) statElements.months.textContent = months.length;
        if (statElements.entries) statElements.entries.textContent = entries.length;

        // Kitöltöttség
        const totalCells = items.length * months.length;
        const filledCells = entries.filter(e => e.cellKey).length;
        const fillPercent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
        if (statElements.fillBar) statElements.fillBar.style.width = fillPercent + '%';
        if (statElements.fillPercent) statElements.fillPercent.textContent = fillPercent + '%';
    }

    // ==================== REMINDER STÁTUSZ ====================
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

    // ==================== ÚJRATÖLTÉS (SEGÉD) ====================
    async reload() {
        console.log('[APP] 🔄 Alkalmazás újratöltése...');
        this.hmiNotif.showToast('Újratöltés...', 'info');
        
        try {
            // Adatok újratöltése
            await Promise.all([
                this.items.load(),
                this.months.load(),
                this.entries.load(),
                this.templates.load(),
                this.reminderManager.load()
            ]);

            // UI frissítés
            this.renderer.renderTable();
            this.remindersRenderer.renderList();
            this.renderStats();
            this.updateReminderStatus();

            // Aktív tab frissítése
            if (this.activeTab === 'charts') {
                this.chartsRenderer.renderAll(this.currentFilter);
            }

            this.hmiNotif.showToast('✅ Adatok frissítve!', 'success');
            console.log('[APP] ✅ Újratöltés kész');
        } catch (e) {
            console.error('[APP] Újratöltési hiba:', e);
            this.hmiNotif.showToast('❌ Újratöltési hiba!', 'error');
        }
    }
}

// ==================== INDÍTÁS ====================
document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    window.app = app;
    
    // Globális elérés a verzióhoz (debug)
    window.getVersion = () => app.getVersionInfo();
    
    await app.start();
});

// Konzol segédlet
console.log('💡 Költség Nyilvántartó v4.0');
console.log('📌 Elérhető parancsok:');
console.log('  window.app.getVersionInfo() - Verzió információ');
console.log('  window.app.checkVersion()   - Frissítés ellenőrzés');
console.log('  window.app.reload()         - Adatok újratöltése');