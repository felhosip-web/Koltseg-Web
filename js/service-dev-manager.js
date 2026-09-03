// js/service-dev-manager.js
// Fejlesztői/Szerviz menü – Platform-specifikus belépési pontokkal
// JAVÍTOTT VERZIÓ – minden hiányzó metódussal

export class ServiceDevManager {
    constructor(app) {
        this.app = app;
        this.isActive = false;
        this.isLoggingEnabled = true;
        this.logs = [];
        this.maxLogs = 500;
        this.generationHistory = [];
        this.testResults = null;
        this.menuElement = null;
        this.isMenuVisible = false;
        this._isDestroyed = false;
        this._boundHandlers = {};

        this.isMobile = this._detectMobile();
        this.isDesktop = !this.isMobile;
        console.log(`[SERVICE] 📱 Platform: ${this.isMobile ? 'Mobil' : 'Desktop'}`);
    }

    // ================================================================
    // === PLATFORM DETEKTÁLÁS ===
    // ================================================================

    _detectMobile() {
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth < 768;
        const isMobileUA = /Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
        return isTouch && (isSmallScreen || isMobileUA);
    }

    // ================================================================
    // === INICIALIZÁLÁS ===
    // ================================================================

    init() {
        if (this._isDestroyed) {
            console.warn('[SERVICE] ❌ A manager már megsemmisült!');
            return false;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const hasParam = urlParams.get('service') === 'true' || urlParams.get('dev') === 'true';

        if (hasParam) {
            this.isActive = true;
            console.log('[SERVICE] 🛠️ Fejlesztői mód aktiválva (paraméter)');
        }

        if (hasParam) {
            // Expose a console-friendly handle
            try { window.service = this; } catch (e) { /* ignore in strict contexts */ }
        }

        if (this.isMobile) {
            this._setupMobileUnlocks();
        } else {
            this._setupDesktopUnlocks();
        }
        this._setupCommonUnlocks();

        if (hasParam) {
            this._setupServiceMenu();
            this._bindEvents();
            this._updateInfo();
            this._showConsoleHelp();
        }

        this._showUnlockHints();
        return hasParam;
    }

    // ================================================================
    // === BELÉPÉSI PONTOK (MOBIL) ===
    // ================================================================

    _setupMobileUnlocks() {
        if (this._isDestroyed) return;
        console.log('[SERVICE] 📱 Mobil belépési pontok aktívak:');
        console.log('  👆 3 ujjas lefelé húzás');
        console.log('  👆 5x koppintás a címre');
        
        this._setupThreeFingerSwipe();
        this._setupLogoDoubleTap();
    }

    _setupThreeFingerSwipe() {
        if (this._isDestroyed) return;
        let startY = null;
        const handler = (e) => {
            if (!e.touches || e.touches.length < 3) return;
            startY = e.touches[0].clientY;
        };
        const move = (e) => {
            if (!startY || !e.touches || e.touches.length < 3) return;
            const cur = e.touches[0].clientY;
            if (cur - startY > 120) {
                // detected downward three-finger swipe
                this._triggerUnlock('3-finger-swipe');
                this.showMenu();
                startY = null;
            }
        };
        const end = () => { startY = null; };
        document.addEventListener('touchstart', handler, { passive: true });
        document.addEventListener('touchmove', move, { passive: true });
        document.addEventListener('touchend', end, { passive: true });
        this._boundHandlers.threeFinger = { handler, move, end };
    }

    _setupLogoDoubleTap() {
        if (this._isDestroyed) return;
        const el = document.querySelector('.app-title') || document.querySelector('header') || document.body;
        let taps = 0, timer = null;
        const onTap = (e) => {
            taps++;
            clearTimeout(timer);
            if (taps >= 5) {
                taps = 0;
                this._triggerUnlock('5-tap-logo');
                this.showMenu();
            }
            timer = setTimeout(() => { taps = 0; }, 1000);
        };
        el.addEventListener('touchend', onTap);
        this._boundHandlers.logoTap = { el, onTap };
    }

    // ================================================================
    // === BELÉPÉSI PONTOK (DESKTOP) ===
    // ================================================================

    _setupDesktopUnlocks() {
        if (this._isDestroyed) return;
        console.log('[SERVICE] 💻 Desktop belépési pontok aktívak:');
        console.log('  🎮 Konami kód: ↑ ↑ ↓ ↓ ← → ← → B A');
        console.log('  💻 Konzol: devMode()');
        this._setupKonamiCode();
        this._setupConsoleCommand();
    }

    _setupKonamiCode() {
        if (this._isDestroyed) return;
        const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        let pos = 0;
        const onKey = (e) => {
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            const expected = seq[pos];
            if ((expected.length === 1 && key === expected) || key === expected) {
                pos++;
                if (pos === seq.length) {
                    pos = 0;
                    this._triggerUnlock('konami');
                    this.showMenu();
                }
            } else {
                pos = key === seq[0] ? 1 : 0;
            }
        };
        window.addEventListener('keydown', onKey);
        this._boundHandlers.konami = { onKey };
    }

    _setupConsoleCommand() {
        window.devMode = () => {
            if (this._isDestroyed) return '❌ Manager már megsemmisült!';
            this.showMenu();
            return '🛠️ Fejlesztői mód aktiválva!';
        };
        window.unlockDev = window.devMode;
        window.exitDev = () => {
            if (this._isDestroyed) return '❌ Manager már megsemmisült!';
            this.hideMenu();
            this._addLog('info', '👋 Kilépés a fejlesztői módból');
            return '👋 Fejlesztői mód bezárva';
        };
        console.log('%c🔑 Tipp: írd be a konzolba: devMode()', 'color: #6b7280; font-size: 12px;');
        console.log('%c👋 Visszalépés: exitDev()', 'color: #6b7280; font-size: 12px;');
    }

    // ================================================================
    // === KÖZÖS BELÉPÉSI PONTOK ===
    // ================================================================

    _setupCommonUnlocks() {
        if (this._isDestroyed) return;
        const versionEl = document.querySelector('.version-text');
        if (versionEl) {
            let clicks = 0, timer = null;
            versionEl.addEventListener('click', () => {
                clicks++;
                clearTimeout(timer);
                if (clicks >= 3) {
                    clicks = 0;
                    this.showMenu();
                }
                timer = setTimeout(() => { clicks = 0; }, 800);
            });
            versionEl.title = 'Kattints 3-szor a verziószámra!';
        }
    }

    // ================================================================
    // === MENU KEZELÉS ===
    // ================================================================

    showMenu() {
        if (this._isDestroyed) return;
        if (!this.menuElement) {
            this._setupServiceMenu();
            this._bindEvents();
        }
        if (this.menuElement) {
            this.menuElement.classList.remove('hidden');
            this.isMenuVisible = true;
            this._updateInfo();
            this._updateLogDisplay();
        }
    }

    hideMenu() {
        if (this._isDestroyed) return;
        if (this.menuElement) {
            this.menuElement.classList.add('hidden');
            this.isMenuVisible = false;
        }
    }

    toggleMenu() {
        this.isMenuVisible ? this.hideMenu() : this.showMenu();
    }

    // ================================================================
    // === SERVICE MENU UI ===
    // ================================================================

    _setupServiceMenu() {
        if (this._isDestroyed) return;
        let menu = document.getElementById('serviceMenu');
        if (menu) {
            this.menuElement = menu;
            menu.classList.remove('hidden');
            return;
        }
        menu = document.createElement('div');
        menu.id = 'serviceMenu';
        menu.className = 'hidden fixed top-4 right-4 z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 max-w-sm w-full max-h-[90vh] overflow-y-auto';

        menu.innerHTML = this._getMenuHTML();
        document.body.appendChild(menu);
        this.menuElement = menu;
        this._injectStyles();
    }

    _getMenuHTML() {
        return `
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <i class="fas fa-tools text-blue-600"></i> Fejlesztői menü
                        <span class="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-mono">${this.isMobile ? '📱 MOBIL' : '💻 DESKTOP'}</span>
                    </h3>
                    <p class="text-[8px] text-gray-400 mt-0.5">${this.isMobile ? '👆 3 ujjas húzás vagy 5x koppintás' : '🎮 Konami kód vagy devMode()'}</p>
                </div>
                <div class="flex gap-1">
                    <button id="btnExitDevMode" class="text-gray-400 hover:text-emerald-600 transition p-1" title="Visszalépés">
                        <i class="fas fa-door-open"></i>
                    </button>
                    <button id="btnCloseServiceMenu" class="text-gray-400 hover:text-gray-600 transition p-1">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="space-y-3">
                <div class="border-b border-gray-100 pb-3">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-database text-blue-500"></i> Adatgenerálás</p>
                    <div class="grid grid-cols-2 gap-2">
                        <button id="btnGenerateEntries" class="btn-service px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"><i class="fas fa-table"></i> <span class="btn-text">Táblázat (30-40)</span> <span class="spinner"></span></button>
                        <button id="btnGenerateReminders" class="btn-service px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"><i class="fas fa-clock"></i> <span class="btn-text">Határidők (10)</span> <span class="spinner"></span></button>
                        <button id="btnGenerateWorks" class="btn-service px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"><i class="fas fa-briefcase"></i> <span class="btn-text">Munkák (10)</span> <span class="spinner"></span></button>
                        <button id="btnGenerateMassive" class="btn-service px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"><i class="fas fa-layer-group"></i> <span class="btn-text">Tömeges (500+)</span> <span class="spinner"></span></button>
                        <button id="btnGenerateMixed" class="btn-service px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition col-span-2 flex items-center justify-center gap-1"><i class="fas fa-box-open"></i> <span class="btn-text">Mindhárom</span> <span class="spinner"></span></button>
                    </div>
                    <div class="mt-2">
                        <button id="btnUndoGeneration" class="btn-service w-full px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5" disabled>
                            <i class="fas fa-undo-alt"></i> <span class="btn-text">Utolsó generálás visszavonása</span> <span class="spinner"></span>
                        </button>
                    </div>
                    <div id="generationStatusResult" class="text-[10px] mt-2 p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono hidden"></div>
                </div>
                <div class="border-b border-gray-100 pb-3">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-gauge-high text-emerald-500"></i> Teljesítmény teszt</p>
                    <div class="grid grid-cols-3 gap-2">
                        <button id="btnPerfSmall" class="btn-service px-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-bold transition"><span class="btn-text">100</span><span class="spinner"></span></button>
                        <button id="btnPerfMedium" class="btn-service px-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-bold transition"><span class="btn-text">500</span><span class="spinner"></span></button>
                        <button id="btnPerfLarge" class="btn-service px-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-bold transition"><span class="btn-text">1000</span><span class="spinner"></span></button>
                    </div>
                    <div id="perfResult" class="text-[10px] text-gray-500 mt-1.5 font-mono hidden"></div>
                </div>
                <div class="border-b border-gray-100 pb-3">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <i class="fas fa-scroll text-gray-600"></i> Logging <span id="logCount" class="text-[9px] text-gray-400 font-normal ml-auto">0</span>
                    </p>
                    <div class="flex gap-2">
                        <button id="btnToggleLogging" class="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-[10px] font-bold transition"><i class="fas fa-pause"></i> <span class="btn-text">Szünet</span></button>
                        <button id="btnClearLogs" class="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-[10px] font-bold transition"><i class="fas fa-eraser"></i> Törlés</button>
                        <button id="btnExportLogs" class="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-[10px] font-bold transition"><i class="fas fa-download"></i> Export</button>
                    </div>
                    <div id="logContainer" class="mt-2 bg-gray-900 rounded-xl p-2 max-h-[120px] overflow-y-auto font-mono text-[9px] leading-relaxed hidden"></div>
                </div>
                <div class="border-b border-gray-100 pb-3">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-cog text-indigo-500"></i> Service Worker</p>
                    <div class="grid grid-cols-2 gap-2">
                        <button id="btnSWStatus" class="btn-service px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">📊 Státusz</span><span class="spinner"></span></button>
                        <button id="btnSWRefresh" class="btn-service px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">🔄 Frissítés</span><span class="spinner"></span></button>
                        <button id="btnSWOfflinePage" class="btn-service px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition col-span-2"><span class="btn-text">📴 Offline oldal megnyitása</span><span class="spinner"></span></button>
                        <button id="btnSWClearCache" class="btn-service px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition col-span-2"><span class="btn-text">🗑️ Cache törlés</span><span class="spinner"></span></button>
                    </div>
                    <div id="swStatusResult" class="text-[10px] text-gray-500 mt-1.5 font-mono hidden"></div>
                </div>
                <div class="border-b border-gray-100 pb-3">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-folder-open text-amber-500"></i> Adatkezelés</p>
                    <div class="grid grid-cols-2 gap-2">
                        <button id="btnExportServiceData" class="btn-service px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">📥 Export</span><span class="spinner"></span></button>
                        <button id="btnClearServiceData" class="btn-service px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">🗑️ Törlés</span><span class="spinner"></span></button>
                    </div>
                </div>
                <div class="border-b border-gray-100 pb-3">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-bell text-purple-500"></i> Push Értesítések</p>
                    <div class="grid grid-cols-2 gap-2">
                        <button id="btnPushStatus" class="btn-service px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">📊 Státusz</span><span class="spinner"></span></button>
                        <button id="btnPushSubscribe" class="btn-service px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">🔔 Feliratkozás</span><span class="spinner"></span></button>
                        <button id="btnPushTest" class="btn-service px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">📨 Teszt</span><span class="spinner"></span></button>
                        <button id="btnPushUnsubscribe" class="btn-service px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition"><span class="btn-text">🔕 Leiratkozás</span><span class="spinner"></span></button>
                    </div>
                    <div id="pushResult" class="text-[10px] text-gray-500 mt-1.5 font-mono hidden"></div>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><i class="fas fa-info-circle text-gray-600"></i> Rendszer info</p>
                    <div id="serviceInfo" class="text-[10px] text-gray-600 space-y-0.5 font-mono bg-gray-50 p-2 rounded-xl">
                        <div class="flex justify-between"><span>Verzió:</span><span id="srvVersion">-</span></div>
                        <div class="flex justify-between"><span>Bejegyzések:</span><span id="srvEntryCount">-</span></div>
                        <div class="flex justify-between"><span>Határidők:</span><span id="srvReminderCount">-</span></div>
                        <div class="flex justify-between"><span>Munkák:</span><span id="srvWorkCount">-</span></div>
                        <div class="flex justify-between"><span>Adatbázis:</span><span id="srvDbStatus">-</span></div>
                        <div class="flex justify-between"><span>SW:</span><span id="srvSWStatus">-</span></div>
                        <div class="flex justify-between"><span>Memória:</span><span id="srvMemory">-</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    _injectStyles() {
        if (document.getElementById('service-dev-styles')) return;
        const style = document.createElement('style');
        style.id = 'service-dev-styles';
        style.textContent = `
            #serviceMenu { animation: slideInRight 0.3s ease forwards; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
            @keyframes slideInRight { from { opacity: 0; transform: translateX(20px) scale(0.95); } to { opacity: 1; transform: translateX(0) scale(1); } }
            .btn-service { transition: all 0.2s ease; position: relative; overflow: hidden; }
            .btn-service:active { transform: scale(0.95); }
            .btn-service .spinner { display: none; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
            .btn-service.loading .spinner { display: inline-block; }
            .btn-service.loading .btn-text { opacity: 0.7; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .log-entry { padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .log-entry:last-child { border-bottom: none; }
            .log-time { color: #6b7280; }
            .log-level-info { color: #60a5fa; }
            .log-level-warn { color: #fbbf24; }
            .log-level-error { color: #f87171; }
            .log-level-success { color: #34d399; }
            #logContainer::-webkit-scrollbar { width: 4px; }
            #logContainer::-webkit-scrollbar-track { background: #1f2937; }
            #logContainer::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 2px; }
            #serviceMenu::-webkit-scrollbar { width: 6px; }
            #serviceMenu::-webkit-scrollbar-track { background: transparent; }
            #serviceMenu::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            #serviceMenu::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            @media (max-width: 768px) { #serviceMenu { max-width: calc(100vw - 32px); right: 16px; top: 16px; max-height: 85vh; } }
        `;
        document.head.appendChild(style);
    }

     // ================================================================
    // === ESEMÉNYKEZELŐK ===
    // ================================================================

    _bindEvents() {
        if (this._isDestroyed) return;
        document.getElementById('btnCloseServiceMenu')?.addEventListener('click', () => this.hideMenu());
        document.getElementById('btnExitDevMode')?.addEventListener('click', () => this._exitDevMode());

        document.getElementById('btnUndoGeneration')?.addEventListener('click', () => this._undoLastGeneration());

        document.getElementById('btnGenerateEntries')?.addEventListener('click', async () => {
            await this._withLoading('btnGenerateEntries', async () => {
                await this._withSyncMuted(async () => {
                    const start = performance.now();
                    const res = await this.app.generateTestData(35);
                    const duration = Math.round(performance.now() - start);
                    const count = typeof res === 'object' ? res.count : res;
                    const ids = typeof res === 'object' ? (res.ids || []) : [];

                    this.generationHistory.push({
                        type: 'entries',
                        summary: `${count} táblázat bejegyzés`,
                        entries: ids,
                        reminders: [],
                        works: [],
                        duration
                    });

                    const timeStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
                    this._updateGenerationStatus(
                        'success',
                        `Generálás sikeres: ${count} bejegyzés létrehozva!`,
                        `<i class="fas fa-clock mr-1"></i>Futási idő: <strong>${timeStr}</strong> (${duration} ms) | 🧪 Törlési tesztre kész`
                    );
                    this._showToast(`✅ ${count} teszt bejegyzés generálva! (${timeStr})`, 'success');
                    this._addLog('success', `Adatgenerálás: ${count} bejegyzés, ${timeStr}`);
                    this._updateInfo();
                    this._refreshUI();
                });
            });
        });
        document.getElementById('btnGenerateReminders')?.addEventListener('click', async () => {
            await this._withLoading('btnGenerateReminders', async () => {
                await this._withSyncMuted(async () => {
                    const start = performance.now();
                    const res = await this.app.generateTestReminders(10);
                    const duration = Math.round(performance.now() - start);
                    const count = typeof res === 'object' ? res.count : res;
                    const ids = typeof res === 'object' ? (res.ids || []) : [];

                    this.generationHistory.push({
                        type: 'reminders',
                        summary: `${count} határidő`,
                        entries: [],
                        reminders: ids,
                        works: [],
                        duration
                    });

                    const timeStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
                    this._updateGenerationStatus(
                        'success',
                        `Generálás sikeres: ${count} határidő létrehozva!`,
                        `<i class="fas fa-clock mr-1"></i>Futási idő: <strong>${timeStr}</strong> (${duration} ms) | 🧪 Törlési tesztre kész`
                    );
                    this._showToast(`✅ ${count} teszt határidő generálva! (${timeStr})`, 'success');
                    this._addLog('success', `Adatgenerálás: ${count} határidő, ${timeStr}`);
                    this._updateInfo();
                    this._refreshUI();
                });
            });
        });
        document.getElementById('btnGenerateWorks')?.addEventListener('click', async () => {
            await this._withLoading('btnGenerateWorks', async () => {
                await this._withSyncMuted(async () => {
                    const start = performance.now();
                    const res = await this.app.generateTestWorks(10);
                    const duration = Math.round(performance.now() - start);
                    const count = typeof res === 'object' ? res.count : res;
                    const ids = typeof res === 'object' ? (res.ids || []) : [];

                    this.generationHistory.push({
                        type: 'works',
                        summary: `${count} munka bejegyzés`,
                        entries: [],
                        reminders: [],
                        works: ids,
                        duration
                    });

                    const timeStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
                    this._updateGenerationStatus(
                        'success',
                        `Generálás sikeres: ${count} munka bejegyzés létrehozva!`,
                        `<i class="fas fa-clock mr-1"></i>Futási idő: <strong>${timeStr}</strong> (${duration} ms) | 🧪 Törlési tesztre kész`
                    );
                    this._showToast(`✅ ${count} teszt munka generálva! (${timeStr})`, 'success');
                    this._addLog('success', `Adatgenerálás: ${count} munka, ${timeStr}`);
                    this._updateInfo();
                    this._refreshUI();
                });
            });
        });
        document.getElementById('btnGenerateMassive')?.addEventListener('click', async () => {
            await this._withLoading('btnGenerateMassive', async () => {
                await this._withSyncMuted(async () => {
                    const start = performance.now();
                    const res = await this.app.generateTestData(500);
                    const duration = Math.round(performance.now() - start);
                    const count = typeof res === 'object' ? res.count : res;
                    const ids = typeof res === 'object' ? (res.ids || []) : [];

                    this.generationHistory.push({
                        type: 'massive',
                        summary: `${count} tömeges bejegyzés`,
                        entries: ids,
                        reminders: [],
                        works: [],
                        duration
                    });

                    const timeStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
                    this._updateGenerationStatus(
                        'success',
                        `Generálás sikeres: ${count} bejegyzés tömegesen generálva!`,
                        `<i class="fas fa-clock mr-1"></i>Futási idő: <strong>${timeStr}</strong> (${duration} ms) | 🧪 Törlési tesztre kész`
                    );
                    this._showToast(`✅ ${count} bejegyzés generálva! (${timeStr})`, 'success');
                    this._addLog('success', `Tömeges generálás: ${count} bejegyzés, ${timeStr}`);
                    this._updateInfo();
                    this._refreshUI();
                });
            });
        });
        document.getElementById('btnGenerateMixed')?.addEventListener('click', async () => {
            await this._withLoading('btnGenerateMixed', async () => {
                await this._withSyncMuted(async () => {
                    const start = performance.now();
                    const eRes = await this.app.generateTestData(30);
                    const rRes = await this.app.generateTestReminders(8);
                    const wRes = await this.app.generateTestWorks(5);
                    const duration = Math.round(performance.now() - start);

                    const eCount = typeof eRes === 'object' ? eRes.count : eRes;
                    const eIds = typeof eRes === 'object' ? (eRes.ids || []) : [];
                    const rCount = typeof rRes === 'object' ? rRes.count : rRes;
                    const rIds = typeof rRes === 'object' ? (rRes.ids || []) : [];
                    const wCount = typeof wRes === 'object' ? wRes.count : wRes;
                    const wIds = typeof wRes === 'object' ? (wRes.ids || []) : [];

                    this.generationHistory.push({
                        type: 'mixed',
                        summary: `${eCount} bej + ${rCount} hat + ${wCount} munka`,
                        entries: eIds,
                        reminders: rIds,
                        works: wIds,
                        duration
                    });

                    const timeStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
                    this._updateGenerationStatus(
                        'success',
                        `Vegyes generálás sikeres: ${eCount} bej + ${rCount} hat + ${wCount} munka!`,
                        `<i class="fas fa-clock mr-1"></i>Futási idő: <strong>${timeStr}</strong> (${duration} ms) | 🧪 Törlési tesztre kész`
                    );
                    this._showToast(`✅ Vegyes adatok generálva! (${timeStr})`, 'success');
                    this._addLog('success', `Vegyes generálás: ${eCount} bej, ${rCount} hat, ${wCount} munka, ${timeStr}`);
                    this._updateInfo();
                    this._refreshUI();
                });
            });
        });

        document.getElementById('btnPerfSmall')?.addEventListener('click', () => this._runPerformanceTest(100));
        document.getElementById('btnPerfMedium')?.addEventListener('click', () => this._runPerformanceTest(500));
        document.getElementById('btnPerfLarge')?.addEventListener('click', () => this._runPerformanceTest(1000));

        document.getElementById('btnToggleLogging')?.addEventListener('click', () => {
            this.isLoggingEnabled = !this.isLoggingEnabled;
            const btn = document.getElementById('btnToggleLogging');
            if (this.isLoggingEnabled) {
                btn.className = 'flex-1 px-3 py-1.5 bg-emerald-200 hover:bg-emerald-300 text-emerald-700 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1.5';
                btn.innerHTML = '<i class="fas fa-play"></i> <span class="btn-text">Folytat</span>';
                this._showToast('📝 Logging folytatva', 'info');
            } else {
                btn.className = 'flex-1 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-700 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1.5';
                btn.innerHTML = '<i class="fas fa-pause"></i> <span class="btn-text">Szünet</span>';
                this._showToast('⏸️ Logging szüneteltetve', 'warning');
            }
        });
        document.getElementById('btnClearLogs')?.addEventListener('click', () => {
            this.logs = [];
            this._updateLogDisplay();
            this._updateLogCount();
            this._showToast('🗑️ Logok törölve', 'info');
        });
        document.getElementById('btnExportLogs')?.addEventListener('click', () => this._exportLogs());

        document.getElementById('btnSWStatus')?.addEventListener('click', async () => {
            await this._withLoading('btnSWStatus', async () => {
                const status = await this._getSWStatus();
                const el = document.getElementById('swStatusResult');
                el.classList.remove('hidden');
                el.innerHTML = `
                    <div class="bg-gray-50 p-2 rounded-lg space-y-0.5 text-[10px]">
                        <div>Státusz: <span class="font-bold ${status.registered ? 'text-emerald-600' : 'text-gray-400'}">${status.registered ? '✅ Regisztrálva' : '❌ Nincs'}</span></div>
                        ${status.version ? `<div>Verzió: <span class="font-bold">${status.version}</span></div>` : ''}
                        ${status.buildDate ? `<div>Build: <span class="font-bold">${status.buildDate}</span></div>` : ''}
                        ${status.controller ? '<div>Controller: <span class="font-bold text-emerald-600">✅ Aktív</span></div>' : '<div>Controller: <span class="font-bold text-gray-400">❌ Nincs</span></div>'}
                    </div>
                `;
                this._addLog('info', `SW státusz: ${status.registered ? 'regisztrálva' : 'nincs'}`);
            });
        });
        document.getElementById('btnSWRefresh')?.addEventListener('click', async () => {
            await this._withLoading('btnSWRefresh', async () => {
                const result = await this._refreshSW();
                this._showToast(result.message, result.success ? 'success' : 'error');
                this._addLog('info', `SW frissítés: ${result.message}`);
                document.getElementById('swStatusResult')?.classList.add('hidden');
                setTimeout(() => this._updateInfo(), 1000);
            });
        });
        document.getElementById('btnSWOfflinePage')?.addEventListener('click', () => {
            this._addLog('info', 'Offline tesztoldal megnyitása');
            window.location.href = 'offline.html';
        });
        document.getElementById('btnSWClearCache')?.addEventListener('click', async () => {
            const confirmed = await this.app.hmiNotif.showConfirm({
                title: '🗑️ Cache törlés',
                message: 'Biztosan törölni szeretnéd az összes cache-elt fájlt? (az app újratöltődik)',
                type: 'warning',
                confirmText: 'Törlés'
            });
            if (confirmed) {
                await this._clearSWCache();
                this._showToast('🗑️ Cache törölve, újratöltés...', 'warning');
                setTimeout(() => location.reload(), 1500);
            }
        });

        document.getElementById('btnExportServiceData')?.addEventListener('click', () => {
            this.app.exportController?.exportJson?.();
            this._addLog('info', 'Adatok exportálva');
        });
        document.getElementById('btnClearServiceData')?.addEventListener('click', async () => {
            const confirmed = await this.app.hmiNotif.showConfirm({
                title: '⚠️ Adatok törlése',
                message: 'Biztosan törölni szeretnéd az ÖSSZES adatot? (nem visszavonható)',
                type: 'danger',
                confirmText: 'ÖSSZES TÖRLÉSE'
            });
            if (confirmed) {
                await this.app.clearAllData();
                this._showToast('✅ Összes adat törölve!', 'success');
                this._updateInfo();
                this._refreshUI();
                this._addLog('warn', 'Összes adat törölve');
            }
        });

        // ==================== GOOGLE DRIVE TESZT GOMBOK ====================

        // Client ID mentése az inputból
        const gdriveInput = document.getElementById('gdriveClientIdInput');
        if (gdriveInput) {
            gdriveInput.value = this.app.gdriveBackup?.getClientId() || '';
            gdriveInput.addEventListener('change', () => {
                const val = gdriveInput.value.trim();
                if (val && this.app.gdriveBackup) {
                    this.app.gdriveBackup.setClientId(val);
                    this._showToast('✅ Google Drive Client ID mentve', 'success');
                    this._addLog('info', `GDrive Client ID beállítva: ${val.substring(0, 20)}...`);
                }
            });
        }

        document.getElementById('btnGDriveStatus')?.addEventListener('click', async () => {
            await this._withLoading('btnGDriveStatus', async () => {
                const status = this.app.gdriveBackup?.getStatus();
                const el = document.getElementById('gdriveResult');
                el.classList.remove('hidden');
                el.innerHTML = `
                    <div class="bg-gray-50 p-2 rounded-lg space-y-0.5 text-[10px]">
                        <div>Konfigurálva: <span class="font-bold ${status?.isConfigured ? 'text-emerald-600' : 'text-red-500'}">${status?.isConfigured ? '✅ Igen' : '❌ Nem'}</span></div>
                        <div>Hitelesítve: <span class="font-bold ${status?.isAuthorized ? 'text-emerald-600' : 'text-gray-400'}">${status?.isAuthorized ? '✅ Igen' : '❌ Nem'}</span></div>
                        ${status?.clientId ? `<div>Client ID: <span class="font-bold">${status.clientId}</span></div>` : ''}
                        ${status?.tokenExpiry ? `<div>Token lejárat: <span class="font-bold">${status.tokenExpiry}</span></div>` : ''}
                        ${status?.lastAuth ? `<div>Utolsó auth: <span class="font-bold">${status.lastAuth}</span></div>` : ''}
                        ${status?.folderId ? `<div>Mappa ID: <span class="font-bold">${status.folderId}</span></div>` : ''}
                    </div>
                `;
                this._addLog('info', `GDrive státusz: ${status?.isAuthorized ? 'hitelesítve' : 'nincs'}`);
            });
        });

        document.getElementById('btnGDriveAuth')?.addEventListener('click', async () => {
            await this._withLoading('btnGDriveAuth', async () => {
                if (!this.app.gdriveBackup?.isConfigured()) {
                    this._showToast('❌ Először adja meg a Client ID-t!', 'error');
                    return;
                }
                await this.app.gdriveBackup.authorize();
                this._showToast('✅ Google Drive csatlakoztatva!', 'success');
                this._addLog('success', 'GDrive hitelesítés sikeres');
            });
        });

        document.getElementById('btnGDriveList')?.addEventListener('click', async () => {
            await this._withLoading('btnGDriveList', async () => {
                const backups = await this.app.gdriveBackup.listBackups();
                const el = document.getElementById('gdriveResult');
                el.classList.remove('hidden');
                if (backups.length === 0) {
                    el.innerHTML = '<div class="bg-gray-50 p-2 rounded-lg text-[10px] text-gray-400">Nincs mentett backup a Drive-on.</div>';
                } else {
                    el.innerHTML = `
                        <div class="bg-gray-50 p-2 rounded-lg text-[10px] space-y-1 max-h-[150px] overflow-y-auto">
                            <div class="font-bold text-gray-700">${backups.length} backup:</div>
                            ${backups.map(f => `
                                <div class="flex justify-between items-center py-0.5 border-b border-gray-100">
                                    <span class="text-gray-600">${f.name}</span>
                                    <span class="text-gray-400">${f.size ? Math.round(parseInt(f.size) / 1024) + ' KB' : ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }
                this._addLog('info', `GDrive backups: ${backups.length} fájl`);
            });
        });

        document.getElementById('btnGDriveUpload')?.addEventListener('click', async () => {
            await this._withLoading('btnGDriveUpload', async () => {
                const backupData = this.app.backupManager._buildBackupData();
                const result = await this.app.gdriveBackup.uploadBackup(backupData);
                this._showToast(`✅ Backup feltöltve: ${result.name}`, 'success');
                this._addLog('success', `GDrive upload: ${result.name} (${result.id})`);
            });
        });

        document.getElementById('btnGDriveDiagnostic')?.addEventListener('click', async () => {
            await this._withLoading('btnGDriveDiagnostic', async () => {
                const results = await this.app.gdriveBackup.runDiagnostic();
                const el = document.getElementById('gdriveResult');
                el.classList.remove('hidden');
                el.innerHTML = `
                    <div class="bg-gray-50 p-2 rounded-lg text-[10px] space-y-1">
                        <div class="font-bold ${results.overallSuccess ? 'text-emerald-600' : 'text-red-500'}">
                            ${results.overallSuccess ? '✅ Minden teszt sikeres!' : '⚠️ Hibák találhatók'}
                        </div>
                        ${results.steps.map(s => `
                            <div class="flex items-center gap-1 py-0.5">
                                <span>${s.success ? '✅' : '❌'}</span>
                                <span class="font-bold">${s.name}:</span>
                                <span class="text-gray-500 truncate">${s.detail}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                results.steps.forEach(s => {
                    this._addLog(s.success ? 'success' : 'error', `GDrive ${s.name}: ${s.detail}`);
                });
            });
        });

        document.getElementById('btnGDriveDisconnect')?.addEventListener('click', async () => {
            this.app.gdriveBackup?.disconnect();
            this._showToast('🔌 Google Drive lecsatlakoztatva', 'warning');
            this._addLog('warn', 'GDrive lecsatlakoztatva');
            document.getElementById('gdriveResult')?.classList.add('hidden');
        });

        // ==================== PUSH ÉRTESÍTÉS TESZT GOMBOK ====================

        document.getElementById('btnPushStatus')?.addEventListener('click', async () => {
            await this._withLoading('btnPushStatus', async () => {
                const pushMgr = this.app.pwaManager?.pushManager;
                const status = pushMgr?.getStatus() || {};
                const el = document.getElementById('pushResult');
                el.classList.remove('hidden');

                // Szerver oldali státusz is
                let serverStatus = null;
                try {
                    const resp = await fetch('/api/push/status');
                    if (resp.ok) serverStatus = await resp.json();
                } catch (e) {}

                el.innerHTML = `
                    <div class="bg-gray-50 p-2 rounded-lg space-y-0.5 text-[10px]">
                        <div>Támogatott: <span class="font-bold ${status.supported ? 'text-emerald-600' : 'text-red-500'}">${status.supported ? '✅ Igen' : '❌ Nem'}</span></div>
                        <div>Engedély: <span class="font-bold">${status.permission || 'ismeretlen'}</span></div>
                        <div>Feliratkozva: <span class="font-bold ${status.isSubscribed ? 'text-emerald-600' : 'text-gray-400'}">${status.isSubscribed ? '✅ Igen' : '❌ Nem'}</span></div>
                        ${status.endpoint ? `<div>Endpoint: <span class="font-bold">${status.endpoint}</span></div>` : ''}
                        ${serverStatus ? `
                            <div class="border-t border-gray-200 pt-1 mt-1">
                                <div class="font-bold text-gray-700">Szerver:</div>
                                <div>VAPID: <span class="font-bold ${serverStatus.configured ? 'text-emerald-600' : 'text-red-500'}">${serverStatus.configured ? '✅' : '❌'}</span></div>
                                <div>Feliratkozások: <span class="font-bold">${serverStatus.subscriptionCount}</span></div>
                            </div>
                        ` : ''}
                    </div>
                `;
                this._addLog('info', `Push státusz: ${status.isSubscribed ? 'feliratkozva' : 'nincs'}`);
            });
        });

        document.getElementById('btnPushSubscribe')?.addEventListener('click', async () => {
            await this._withLoading('btnPushSubscribe', async () => {
                const pushMgr = this.app.pwaManager?.pushManager;
                if (!pushMgr) {
                    this._showToast('❌ Push Manager nem elérhető!', 'error');
                    return;
                }
                await pushMgr.subscribe();
                this._showToast('✅ Push értesítésekre feliratkozva!', 'success');
                this._addLog('success', 'Push feliratkozás sikeres');
            });
        });

        document.getElementById('btnPushTest')?.addEventListener('click', async () => {
            await this._withLoading('btnPushTest', async () => {
                const pushMgr = this.app.pwaManager?.pushManager;
                if (!pushMgr) {
                    this._showToast('❌ Push Manager nem elérhető!', 'error');
                    return;
                }
                await pushMgr.sendTestNotification();
                this._showToast('📨 Teszt értesítés elküldve!', 'success');
                this._addLog('success', 'Teszt push notification elküldve');
            });
        });

        document.getElementById('btnPushUnsubscribe')?.addEventListener('click', async () => {
            await this._withLoading('btnPushUnsubscribe', async () => {
                const pushMgr = this.app.pwaManager?.pushManager;
                if (!pushMgr) return;
                await pushMgr.unsubscribe();
                this._showToast('🔕 Leiratkozva a push értesítésekről', 'warning');
                this._addLog('warn', 'Push leiratkozás');
                document.getElementById('pushResult')?.classList.add('hidden');
            });
        });
    }
    
    // ================================================================
    // === SEGÉDFÜGGVÉNYEK ===
    // ================================================================

    _showToast(message, type = 'info') {
        this.app.hmiNotif?.showToast?.(message, type);
    }

    _refreshUI() {
        this.app.refreshAllTabs?.();
        this.app.workLogRenderer?.render?.();
        this.app.renderStats?.();
        this.app.updateReminderStatus?.();
    }

    _triggerUnlock(method) {
        console.log(`%c🔓 ${method}`, 'color: #10b981; font-weight:bold;');
        this._addLog('success', `🔓 Feloldva: ${method}`);
        this._flashElement(document.body, 'rgba(16, 185, 129, 0.1)', 300);
    }

    _flashElement(element, color, duration = 200) {
        if (!element) return;
        const original = element.style.backgroundColor;
        element.style.transition = `background-color ${duration}ms ease`;
        element.style.backgroundColor = color;
        setTimeout(() => {
            element.style.backgroundColor = original || 'transparent';
        }, duration);
        setTimeout(() => { element.style.transition = ''; }, duration + 50);
    }

    _showUnlockHints() {
        if (this.isMobile) {
            console.log('%c📱 Mobil tippek:', 'font-weight:bold;');
            console.log('  👆 3 ujjas lefelé húzás');
            console.log('  👆 5x koppintás a címsorra');
            console.log('  📅 3x kattintás a verziószámra');
        } else {
            console.log('%c💻 Desktop tippek:', 'font-weight:bold;');
            console.log('  🎮 Konami kód: ↑ ↑ ↓ ↓ ← → ← → B A');
            console.log('  💻 Konzol: devMode()');
            console.log('  📅 3x kattintás a verziószámra');
        }
        console.log('  🔗 URL paraméter: ?service=true');
    }

    _showConsoleHelp() {
        console.log('%c🛠️ FEJLESZTŐI/SZERVIZ MÓD AKTÍV', 'font-size:16px; font-weight:bold; color:#2563eb;');
        console.log('%c📌 Elérhető parancsok:', 'font-weight:bold;');
        console.log('  service.showMenu() - Menü megjelenítése');
        console.log('  service.hideMenu() - Menü elrejtése');
        console.log('  service.toggleMenu() - Menü váltás');
        console.log('  exitDev() - Visszalépés a sima módba');
    }

    _exitDevMode() {
        this.hideMenu();
        this._addLog('info', '👋 Visszalépés a sima módba');
        this._showToast('👋 Visszalépés a sima módba', 'info');
        if (window.location.search.includes('service=true') || window.location.search.includes('dev=true')) {
            const url = new URL(window.location);
            url.searchParams.delete('service');
            url.searchParams.delete('dev');
            window.history.replaceState({}, '', url.toString());
        }
    }
    
   // ================================================================
    // === LOGGING RENDSZER ===
    // ================================================================

    _addLog(level, message, data = null) {
        if (!this.isLoggingEnabled) return;
        this.logs.push({ timestamp: new Date().toISOString(), level, message, data });
        if (this.logs.length > this.maxLogs) this.logs.shift();
        this._updateLogDisplay();
        this._updateLogCount();
        const prefix = `[${new Date().toISOString().split('T')[1].slice(0, 8)}]`;
        switch (level) {
            case 'error': console.error(prefix, message, data || ''); break;
            case 'warn': console.warn(prefix, message, data || ''); break;
            case 'success': console.log(`%c${prefix} ✅ ${message}`, 'color: #34d399', data || ''); break;
            default: console.log(prefix, message, data || '');
        }
    }

    _updateLogDisplay() {
        const container = document.getElementById('logContainer');
        if (!container || container.classList.contains('hidden')) return;
        const recent = this.logs.slice(-50);
        if (recent.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-2">Nincs log</div>';
            return;
        }
        container.innerHTML = recent.map(log => `
            <div class="log-entry flex items-start gap-2 text-[10px] leading-relaxed">
                <span class="log-time text-gray-500 flex-shrink-0">${log.timestamp.split('T')[1].slice(0, 8)}</span>
                <span class="${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : log.level === 'success' ? 'text-emerald-400' : 'text-blue-400'} flex-shrink-0">[${(log.level || 'info').toUpperCase()}]</span>
                <span class="text-gray-300 break-all">${log.message}</span>
            </div>
        `).join('');
        container.scrollTop = container.scrollHeight;
    }

    _updateLogCount() {
        const el = document.getElementById('logCount');
        if (el) el.textContent = this.logs.length;
    }

    _exportLogs() {
        if (this.logs.length === 0) { this._showToast('Nincs log', 'warning'); return; }
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this._showToast(`📥 ${this.logs.length} log exportálva`, 'success');
    }

    async _withSyncMuted(fn) {
        const sync = this.app.syncService || this.app.syncManager;
        const wasMuted = sync ? (sync.isMuted || sync.service?.isMuted) : false;
        if (sync) {
            if (typeof sync.setMuted === 'function') sync.setMuted(true);
            else if (sync.service && typeof sync.service.setMuted === 'function') sync.service.setMuted(true);
            else sync.isMuted = true;
        }
        try {
            return await fn();
        } finally {
            if (sync) {
                if (typeof sync.setMuted === 'function') sync.setMuted(wasMuted);
                else if (sync.service && typeof sync.service.setMuted === 'function') sync.service.setMuted(wasMuted);
                else sync.isMuted = wasMuted;
            }
        }
    }

    // ================================================================
    // === TELJESÍTMÉNY TESZT ÉS VISSZAVONÁS ===
    // ================================================================

    _updateUndoButtonState() {
        const btn = document.getElementById('btnUndoGeneration');
        if (!btn) return;
        const hasHistory = this.generationHistory.length > 0;
        btn.disabled = !hasHistory;
        const textEl = btn.querySelector('.btn-text');
        if (textEl) {
            if (hasHistory) {
                const lastBatch = this.generationHistory[this.generationHistory.length - 1];
                textEl.textContent = `Visszavonás: ${lastBatch.summary} (${this.generationHistory.length})`;
            } else {
                textEl.textContent = 'Utolsó generálás visszavonása';
            }
        }
    }

    _updateGenerationStatus(type, message, details = '') {
        const el = document.getElementById('generationStatusResult');
        if (!el) return;
        el.classList.remove('hidden');

        let bgClass = 'bg-slate-50 border-slate-200 text-slate-700';
        let icon = 'ℹ️';

        if (type === 'success') {
            bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-800';
            icon = '🟢';
        } else if (type === 'undo') {
            bgClass = 'bg-amber-50 border-amber-200 text-amber-800';
            icon = '↩️';
        } else if (type === 'error') {
            bgClass = 'bg-rose-50 border-rose-200 text-rose-800';
            icon = '🔴';
        }

        el.className = `text-[10px] mt-2 p-2 rounded-xl border font-mono ${bgClass}`;
        el.innerHTML = `
            <div class="flex items-start gap-1.5">
                <span class="text-xs flex-shrink-0">${icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="font-bold leading-tight break-words">${message}</div>
                    ${details ? `<div class="text-[9px] opacity-85 mt-1 leading-snug break-words">${details}</div>` : ''}
                </div>
            </div>
        `;
        this._updateUndoButtonState();
    }

    async _undoLastGeneration() {
        if (this.generationHistory.length === 0) {
            this._updateGenerationStatus('error', 'Nincs visszavonható generálás!');
            return;
        }

        await this._withLoading('btnUndoGeneration', async () => {
            await this._withSyncMuted(async () => {
                const batch = this.generationHistory.pop();
                const start = performance.now();

                let deletedEntries = 0;
                let deletedReminders = 0;
                let deletedWorks = 0;

                // Törlési funkció tesztelése a törlési metódusok meghívásával
                if (batch.entries && batch.entries.length > 0) {
                    for (const id of batch.entries) {
                        try {
                            await this.app.entries.deleteEntry(id);
                            deletedEntries++;
                        } catch (e) {
                            console.warn('[DEV] Hiba bejegyzés törlésekor:', id, e);
                        }
                    }
                }

                if (batch.reminders && batch.reminders.length > 0) {
                    for (const id of batch.reminders) {
                        try {
                            await this.app.reminderManager.delete(id);
                            deletedReminders++;
                        } catch (e) {
                            console.warn('[DEV] Hiba határidő törlésekor:', id, e);
                        }
                    }
                }

                if (batch.works && batch.works.length > 0) {
                    for (const id of batch.works) {
                        try {
                            await this.app.workLogManager.delete(id);
                            deletedWorks++;
                        } catch (e) {
                            console.warn('[DEV] Hiba munka törlésekor:', id, e);
                        }
                    }
                }

                const duration = Math.round(performance.now() - start);
                const timeStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
                const totalDeleted = deletedEntries + deletedReminders + deletedWorks;

                const detailParts = [];
                if (deletedEntries > 0) detailParts.push(`${deletedEntries} bejegyzés`);
                if (deletedReminders > 0) detailParts.push(`${deletedReminders} határidő`);
                if (deletedWorks > 0) detailParts.push(`${deletedWorks} munka`);
                const detailStr = detailParts.join(', ') || `${totalDeleted} tétel`;

                this._updateGenerationStatus(
                    'undo',
                    `Visszavonás lezajlott: ${totalDeleted} tétel sikeresen törölve!`,
                    `<i class="fas fa-trash-alt mr-1"></i>Törlési idő: <strong>${timeStr}</strong> (${detailStr}) | 🧪 Törlés funkció tesztelve! | Várakozó visszavonások: ${this.generationHistory.length}`
                );

                this._showToast(`↩️ Visszavonva: ${detailStr} törölve (${timeStr})`, 'info');
                this._addLog('info', `Visszavonás (Törlés teszt): ${totalDeleted} tétel törölve, ${timeStr}`);

                this._updateInfo();
                this._refreshUI();
            });
        });
    }

    async _runPerformanceTest(targetCount) {
        const resultEl = document.getElementById('perfResult');
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = '⏳ Teszt folyamatban...';
        try {
            let res;
            let genDuration;
            await this._withSyncMuted(async () => {
                const startGen = performance.now();
                res = await this.app.generateTestData(targetCount);
                genDuration = Math.round(performance.now() - startGen);
            });
            const generated = typeof res === 'object' ? res.count : res;
            const ids = typeof res === 'object' ? (res.ids || []) : [];

            this.generationHistory.push({
                type: 'perf',
                summary: `${generated} teszt bejegyzés`,
                entries: ids,
                reminders: [],
                works: [],
                duration: genDuration
            });

            const genTime = (genDuration / 1000).toFixed(2);
            const renderStart = performance.now();
            this.app.renderer.renderTable();
            const renderTime = ((performance.now() - renderStart)).toFixed(1);
            const allTabsRefreshStart = performance.now();
            this.app.refreshAllTabs?.();
            const allTabsRefreshTime = ((performance.now() - allTabsRefreshStart)).toFixed(1);
            const memory = performance.memory ? (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + ' MB' : 'N/A';
            resultEl.innerHTML = `
                <div class="bg-gray-50 p-2 rounded-lg text-[9px] grid grid-cols-3 gap-1">
                    <div>📊 Generálás: <span class="font-bold">${genTime}s</span></div>
                    <div>📋 Render: <span class="font-bold">${renderTime}ms</span></div>
                    <div>📈 Minden tab frissítése: <span class="font-bold">${allTabsRefreshTime}ms</span></div>
                    <div>💾 Memória: <span class="font-bold">${memory}</span></div>
                    <div>📝 Bejegyzések: <span class="font-bold">${generated}</span></div>
                    <div>🏷️ Kategóriák: <span class="font-bold">${this.app.items.items.length}</span></div>
                </div>
            `;
            this._updateGenerationStatus(
                'success',
                `Teljesítmény teszt generálás kész: ${generated} bejegyzés!`,
                `<i class="fas fa-clock mr-1"></i>Futási idő: <strong>${genDuration}ms</strong> | 🧪 Törlési tesztre kész`
            );
            this._addLog('success', `Teljesítmény teszt: ${generated} bejegyzés, ${genTime}s`);
            this._showToast(`✅ Teszt kész: ${generated} bejegyzés (${genTime}s)`, 'success');
            this._updateInfo();
        } catch (e) {
            resultEl.innerHTML = `<div class="text-red-500">❌ Hiba: ${e.message}</div>`;
            this._addLog('error', `Teljesítmény teszt hiba: ${e.message}`);
        }
    }
    
    // ================================================================
    // === SERVICE WORKER KEZELÉS ===
    // ================================================================

    async _getSWStatus() {
        const status = { registered: false, version: null, buildDate: null, controller: !!navigator.serviceWorker?.controller };
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                if (registrations.length > 0) {
                    status.registered = true;
                    if (registrations[0].active) {
                        return new Promise((resolve) => {
                            const channel = new MessageChannel();
                            channel.port1.onmessage = (e) => {
                                if (e.data) {
                                    status.version = e.data.version || null;
                                    status.buildDate = e.data.buildDate || null;
                                }
                                resolve(status);
                            };
                            registrations[0].active.postMessage('getVersion', [channel.port2]);
                            setTimeout(() => resolve(status), 1000);
                        });
                    }
                }
            }
        } catch (e) { console.warn('[SERVICE] SW status hiba:', e); }
        return status;
    }

    async _refreshSW() {
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                if (registrations.length === 0) return { success: false, message: 'Nincs regisztrált SW' };
                for (const reg of registrations) await reg.update();
                return { success: true, message: '✅ SW frissítve' };
            }
            return { success: false, message: '❌ SW nem támogatott' };
        } catch (e) { return { success: false, message: `❌ Hiba: ${e.message}` }; }
    }

    async _clearSWCache() {
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    if (reg.active) reg.active.postMessage('refreshCache');
                    await reg.unregister();
                }
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (const key of keys) await caches.delete(key);
            }
            this._addLog('warn', 'SW cache törölve');
        } catch (e) {
            console.warn('[SERVICE] SW cache törlési hiba:', e);
            this._addLog('error', `SW cache törlési hiba: ${e.message}`);
        }
    }

    // ================================================================
    // === INFO FRISSÍTÉS ===
    // ================================================================

    async _updateInfo() {
        const app = this.app;
        document.getElementById('srvVersion').textContent = app.version?.toString() || 'v5.2.0';
        document.getElementById('srvEntryCount').textContent = app.entries?.entries?.length || 0;
        document.getElementById('srvReminderCount').textContent = app.reminderManager?.reminders?.length || 0;
        const srvWorkCount = document.getElementById('srvWorkCount');
        if (srvWorkCount) {
            srvWorkCount.textContent = app.workLogManager?.works?.length || 0;
        }
        document.getElementById('srvDbStatus').textContent = app.db?.db ? '✅ Csatlakozva' : '❌ Nincs kapcsolat';
        const sw = await this._getSWStatus();
        document.getElementById('srvSWStatus').textContent = sw.registered ? '✅ Aktív' : '❌ Nincs';
        if (performance.memory) {
            document.getElementById('srvMemory').textContent = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + ' MB';
        } else {
            document.getElementById('srvMemory').textContent = 'N/A';
        }
    }
    
   // ================================================================
    // === WITH LOADING ===
    // ================================================================

    async _withLoading(btnId, callback) {
        const btn = document.getElementById(btnId);
        if (!btn || btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        try { await callback(); }
        catch (e) { console.error('[SERVICE] Hiba:', e); this._showToast('❌ Hiba történt!', 'error'); this._addLog('error', e.message); }
        finally { btn.classList.remove('loading'); }
    }

    // ================================================================
    // === DESTROY ===
    // ================================================================

    destroy() {
        if (this._isDestroyed) return;
        if (this.menuElement) {
            this.menuElement.remove();
            this.menuElement = null;
        }
        this.logs = [];
        this.app = null;
        // Remove any global helpers
        try { if (window.service === this) delete window.service; } catch (e) {}
        try { if (window.devMode) delete window.devMode; } catch (e) {}
        try { if (window.unlockDev) delete window.unlockDev; } catch (e) {}
        try { if (window.exitDev) delete window.exitDev; } catch (e) {}

        // Remove bound event handlers
        if (this._boundHandlers) {
            const b = this._boundHandlers;
            if (b.konami && b.konami.onKey) window.removeEventListener('keydown', b.konami.onKey);
            if (b.threeFinger) {
                document.removeEventListener('touchstart', b.threeFinger.handler);
                document.removeEventListener('touchmove', b.threeFinger.move);
                document.removeEventListener('touchend', b.threeFinger.end);
            }
            if (b.logoTap && b.logoTap.el && b.logoTap.onTap) b.logoTap.el.removeEventListener('touchend', b.logoTap.onTap);
        }

        this._isDestroyed = true;
        console.log('[SERVICE] ✅ Takarítás kész');
    }
}
