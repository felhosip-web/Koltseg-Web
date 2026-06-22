// js/app.js – v4.0 – Egységes tabos felület
import { Database, ConfigManager, CloudSync, ItemManager, MonthManager, EntryManager, TemplateManager } from './oop-core.js';
import { UIModalController } from './ui-modal-controller.js';
import { UIRenderer } from './ui-renderer.js';
import { UIController } from './ui-controller.js';
import { ChartsRenderer } from './oop-charts.js';
import { RemindersRenderer, ReminderManager } from './oop-reminders.js';

class App {
    constructor() {
        this.config = new ConfigManager();
        this.db = new Database();
        this.cloud = new CloudSync(this.config);
        this.hmiNotif = new UIModalController();

        // Domain managerek
        this.items = new ItemManager(this.db, this.cloud);
        this.months = new MonthManager(this.db, this.cloud);
        this.entries = new EntryManager(this.db, this.cloud);
        this.templates = new TemplateManager(this.db, this.cloud);

        // Rendererek
        this.renderer = new UIRenderer(this);
        this.uiController = new UIController(this);
        this.chartsRenderer = new ChartsRenderer(this);
        
        // Reminder rendszer
        this.reminderManager = new ReminderManager(this.db, this.cloud);
        
        this.deferredInstallPrompt = null;
        this.remindersRenderer = new RemindersRenderer(this, this.hmiNotif);

        // Állapotok
        this.currentFilter = 'all';
        this.activeTab = 'table';
    }

    async boot() {
        try {
        // ===== TARTÓS TÁRHELY KÉRÉSE ÉS FIGYELMEZTETÉS =====
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persisted();
            if (!isPersisted) {
                const granted = await navigator.storage.persist();
                if (granted) {
                    console.log('[STORAGE] Tartós tárhely engedélyezve!');
                    this.hmiNotif.showToast('Adatok tartósan tárolva!', 'success');
                } else {
                    console.warn('[STORAGE] Tartós tárhely elutasítva!');
                    // SÁRGA FIGYELMEZTETŐ MODAL (csak "Értem" gomb)
                    await this.hmiNotif.showConfirm(
                        "⚠️ Tárhely figyelmeztetés",
                        "A böngésző nem engedélyezte a tartós tárhelyet.\n\nAz adatok a böngésző gyorsítótárának törlésekor (pl. 'Cookie-k és webhelyadatok törlése') VESZNEK EL!\n\nKérlek, a böngésző beállításaiban engedélyezd a tartós tárolást, vagy rendszeresen készíts biztonsági mentést.",
                        false,          // false = sárga (info) stílus
                        "Értem",        // gomb szövege
                        false           // showCancel = false → csak OK gomb
                    );
                }
            } else {
                console.log('[STORAGE] Már tartós a tárhely.');
            }
        }
            await this.db.connect();
            await Promise.all([
                this.reminderManager.load(),
                this.items.load(),
                this.months.load(),
                this.entries.load(),
                this.templates.load()
            ]);

            // UI eseménykötések
            this.uiController.bindStaticEvents();

            // Tab kezelés
            this._initTabs();

            // Kezdeti renderelés
            this.renderer.renderTable();
            this.remindersRenderer.renderList();
            this.renderStats();
            this.updateReminderStatus();           // ← Új
            this._registerServiceWorker();
            this._bindPwaInstall();

            // Watchdog
            await this.config.watchDogEur((rate, mode) => {
                this.renderer.updateLed(rate, mode);
                const numericRate = Number(rate);
                this.eurRate = numericRate;
                if (this.config) this.config.eurRate = numericRate;
                this.renderer.renderTable();
                this.renderStats();
                if (this.activeTab === 'charts') {
                    this.chartsRenderer.renderAll(this.currentFilter);
                }
                this.renderer.updateFooterStatus(`Rendszer üzemkész - Online EUR: ${numericRate} Ft`);
            });

            // Havi szűrő
            document.getElementById('monthFilter')?.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                if (this.activeTab === 'charts') {
                    this.chartsRenderer.renderAll(this.currentFilter);
                }
            });

            // Reminder globális státusz kattintásra megnyitja a tabot
            document.getElementById('reminderGlobalStatus')?.addEventListener('click', () => {
                document.querySelector('[data-tab="reminders"]').click();
            });

            console.log('[HMI APP] Boot complete.');
        } catch (error) {
            console.error('Boot hiba:', error);
            this.hmiNotif.showToast('Rendszerindítási hiba!', 'error');
        }
    }

    // ===== TAB KEZELÉS =====
    _bindPwaInstall() {
        const installButton = document.getElementById('btnInstallApp');

        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            this.deferredInstallPrompt = event;
            installButton?.classList.remove('hidden');
        });

        window.addEventListener('appinstalled', () => {
            installButton?.classList.add('hidden');
            this.deferredInstallPrompt = null;
            this.hmiNotif.showToast('Az alkalmazás telepítése sikeres!', 'success');
        });

        installButton?.addEventListener('click', async () => {
            if (!this.deferredInstallPrompt) return;
            this.deferredInstallPrompt.prompt();
            const choiceResult = await this.deferredInstallPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
                this.hmiNotif.showToast('Telepítés elfogadva!', 'success');
            } else {
                this.hmiNotif.showToast('Telepítés elutasítva.', 'info');
            }
            this.deferredInstallPrompt = null;
            installButton.classList.add('hidden');
        });
    }

    _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => {
                    console.log('[PWA] Service worker registered:', reg.scope);
                })
                .catch(err => {
                    console.warn('[PWA] Service worker registration failed:', err);
                });
        }
    }

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
                tabButtons.forEach(b => {
                    b.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
                    b.classList.add('bg-gray-100', 'text-gray-600');
                });

                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-blue-600', 'text-white', 'shadow-md');

                Object.values(tabPanes).forEach(pane => pane.classList.add('hidden'));

                const tab = btn.dataset.tab;
                this.activeTab = tab;

                if (tabPanes[tab]) {
                    tabPanes[tab].classList.remove('hidden');

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

        document.querySelector('[data-tab="table"]')?.click();
    }

    // ===== STATISZTIKA =====
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

        document.getElementById('statTotal').textContent = total.toLocaleString('hu-HU') + ' Ft';
        document.getElementById('statCard').textContent = card.toLocaleString('hu-HU') + ' Ft';
        document.getElementById('statCash').textContent = cash.toLocaleString('hu-HU') + ' Ft';
        document.getElementById('statTransfer').textContent = transfer.toLocaleString('hu-HU') + ' Ft';
        document.getElementById('statItems').textContent = items.length;
        document.getElementById('statMonths').textContent = months.length;
        document.getElementById('statEntries').textContent = entries.length;

        const totalCells = items.length * months.length;
        const filledCells = entries.filter(e => e.cellKey).length;
        const fillPercent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
        document.getElementById('statFillBar').style.width = fillPercent + '%';
        document.getElementById('statFillPercent').textContent = fillPercent + '%';
    }

    // ===== REMINDER GLOBÁLIS STÁTUSZ =====
    updateReminderStatus() {
        const reminders = this.reminderManager.reminders || [];
        const today = dayjs();
        let overdue = 0, soon = 0;

        reminders.forEach(rem => {
            if (!rem.active) return;
            const due = dayjs(rem.due_date || rem.next_due_date);
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
}

// Indítás
async function loadRemoteConfig() {
    try {
        let res = await fetch('/settings.json');
        if (res.ok) return await res.json();
        // fallback: try raw file from gh-pages branch
        const rawUrl = 'https://raw.githubusercontent.com/felhosip-web/Koltseg-Web/gh-pages/settings.json';
        res = await fetch(rawUrl);
        if (!res.ok) return {};
        return await res.json();
    } catch (e) {
        return {};
    }
}

// Indítás
document.addEventListener('DOMContentLoaded', async () => {
    const remoteCfg = await loadRemoteConfig();
    const app = new App();
    // Apply remote config (if present). Only set client-safe values.
    if (remoteCfg.SUPABASE_URL) app.config.supabaseConfig.url = remoteCfg.SUPABASE_URL;
    if (remoteCfg.SUPABASE_ANON_KEY) app.config.supabaseConfig.key = remoteCfg.SUPABASE_ANON_KEY;
    // enable cloud usage when remote config is present
    if (remoteCfg.SUPABASE_URL && remoteCfg.SUPABASE_ANON_KEY) app.config.useSupabase = true;
    // re-init cloud client with the possibly-updated config
    try { app.cloud.init(); } catch (e) { console.warn('Cloud re-init failed', e); }
    window.app = app;
    app.boot();
});