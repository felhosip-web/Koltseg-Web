// js/module-manager.js - v5.3.0 - Dinamikus Modul & Bővítmény Rendszer (Plugin Engine)
import { calculatorModuleScript } from './modules/calculator.js';
import { mileageModuleScript } from './modules/mileage.js';
import { fuelLogModuleScript } from './modules/fuel-log.js';
import { shoppingListModuleScript } from './modules/shopping-list.js';
import { calendarModuleScript } from './modules/calendar.js';
import { notepadModuleScript } from './modules/notepad.js';

export class ModuleManager {
    constructor(app) {
        this.app = app;
        this.modules = new Map(); // id -> moduleInstance
        this.hooks = {
            onBoot: [],
            onTabChange: [],
            onSync: [],
            onDataChange: [],
            onRenderUI: [],
            onShutdown: []
        };
        this.dynamicTabs = new Map(); // tabId -> tabConfig
        this.storageKey = 'app_dynamic_modules_v1';
        this.remoteRegistry = [];
    }

    /**
     * Törzs és dinamikus modulok inicializálása az app boot során
     */
    async init() {
        console.log('[MODULES] 🔌 Dinamikus Modul Kezelő inicializálása (v5.3.0)...');
        
        // Távoli modulregiszter manifest lekérdezése
        await this.fetchRemoteRegistry();

        // 1. Törzs modulok (Core System Modules) regisztrációja
        this._registerCoreModules();

        // 2. Mentett egyedi/dinamikus bővítmények betöltése LocalStorage-ből
        await this._loadSavedDynamicModules();

        // 3. Modulok inicializálása és onBoot hook futtatása
        for (const [id, mod] of this.modules.entries()) {
            if (mod.enabled) {
                try {
                    if (typeof mod.init === 'function') {
                        await mod.init(this.app);
                    }
                    console.log(`[MODULES] ✅ Modul aktív: ${mod.name} (v${mod.version})`);
                } catch (err) {
                    console.error(`[MODULES] ❌ Hiba a ${id} modul inicializálásakor:`, err);
                }
            }
        }

        // 4. Eseménykezelők bekötése a Modulok UI gombokra
        this.bindModuleUIEvents();

        // 5. Fire onBoot hooks
        this.triggerHook('onBoot', { app: this.app });
    }

    /**
     * Modulok UI eseménykezelőinek bekötése
     */
    bindModuleUIEvents() {
        // Toggle Modulok Chooser Modal gombok (Költségnyilvántartó és Munka Nyilvántartás fejlécekben)
        document.querySelectorAll('.btn-modules-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openChooserModal();
            });
        });

        // Modul Chooser bezárás
        document.getElementById('btnCloseModuleChooser')?.addEventListener('click', () => {
            document.getElementById('moduleChooserModal')?.classList.add('hidden');
        });
        document.getElementById('btnCloseModuleChooserFooter')?.addEventListener('click', () => {
            document.getElementById('moduleChooserModal')?.classList.add('hidden');
        });

        // Bővítmények kezelése a Beállításokban
        document.getElementById('btnManageModulesFromChooser')?.addEventListener('click', () => {
            document.getElementById('moduleChooserModal')?.classList.add('hidden');
            if (this.app.uiController && typeof this.app.uiController.openSettings === 'function') {
                this.app.uiController.openSettings();
                this.app.uiController.switchSettingsTab('modules');
            } else {
                document.getElementById('settingsPanel')?.classList.remove('hidden');
            }
        });

        // Global Module Modal bezárás
        document.getElementById('btnCloseGlobalModuleModal')?.addEventListener('click', () => {
            document.getElementById('globalModuleModal')?.classList.add('hidden');
        });
    }

    openChooserModal() {
        this.renderModuleChooser();
        document.getElementById('moduleChooserModal')?.classList.remove('hidden');
    }

    renderModuleChooser() {
        const listContainer = document.getElementById('moduleChooserModalList');
        if (!listContainer) return;

        let html = '';
        let hasCustomModules = false;

        for (const [id, mod] of this.modules.entries()) {
            if (mod.isCore) continue; // Csak a kiegészítő modulokat listázzuk
            hasCustomModules = true;

            html += `
                <div class="p-4 bg-slate-50 hover:bg-purple-50/50 border border-slate-200 hover:border-purple-200 rounded-2xl transition flex flex-col justify-between group shadow-sm">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <i class="${mod.icon || 'fas fa-puzzle-piece'} text-lg"></i>
                                <h4 class="text-sm font-extrabold text-slate-800">${mod.name}</h4>
                            </div>
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${mod.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'} uppercase">
                                ${mod.enabled ? 'Aktív' : 'Inaktív'}
                            </span>
                        </div>
                        <p class="text-xs text-slate-500 mb-3 leading-relaxed">${mod.description || 'Kiegészítő modul'}</p>
                        <div class="text-[10px] text-slate-400 font-mono mb-3">v${mod.version} • ${mod.author || 'Modul'}</div>
                    </div>
                    <button type="button" data-launch-module="${mod.id}" ${!mod.enabled ? 'disabled' : ''} class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm active:scale-95">
                        <i class="fas fa-play text-[10px]"></i> ${mod.enabled ? 'Modul Indítása' : 'Inaktív'}
                    </button>
                </div>
            `;
        }

        if (!hasCustomModules) {
            html = `
                <div class="col-span-full py-8 text-center text-slate-400">
                    <i class="fas fa-cubes text-3xl mb-2 text-slate-300"></i>
                    <p class="text-xs font-semibold">Még nincs telepített kiegészítő modul.</p>
                </div>
            `;
        }

        listContainer.innerHTML = html;

        // Eseménykezelők rendelése az indítás gombokhoz
        listContainer.querySelectorAll('[data-launch-module]').forEach(btn => {
            btn.addEventListener('click', () => {
                const moduleId = btn.getAttribute('data-launch-module');
                this.launchModuleInModal(moduleId);
            });
        });
    }

    launchModuleInModal(moduleId) {
        const mod = this.modules.get(moduleId);
        if (!mod) {
            alert('A megadott modul nem található.');
            return;
        }

        if (!mod.enabled) {
            alert('Ez a modul jelenleg ki van kapcsolva. A Beállítások menüben tudod bekapcsolni.');
            return;
        }

        // Chooser modal bezárása
        document.getElementById('moduleChooserModal')?.classList.add('hidden');

        // Header beállítása
        const iconEl = document.getElementById('globalModuleModalIcon');
        const titleEl = document.getElementById('globalModuleModalTitle');
        const subEl = document.getElementById('globalModuleModalSub');
        const contentEl = document.getElementById('globalModuleModalContent');

        if (iconEl) iconEl.innerHTML = `<i class="${mod.icon || 'fas fa-puzzle-piece'}"></i>`;
        if (titleEl) titleEl.textContent = mod.name;
        if (subEl) subEl.textContent = mod.description || `v${mod.version} • ${mod.author}`;

        // Global Modal megjelenítése
        document.getElementById('globalModuleModal')?.classList.remove('hidden');

        if (contentEl) {
            contentEl.innerHTML = '';
            
            // Létrehozunk egy konténert a modul számára, aminek az az ID-je, amire a modul számít!
            const tabId = mod.tabConfig?.id || mod.id;
            const moduleContainer = document.createElement('div');
            moduleContainer.id = `moduleView_${tabId}`;
            moduleContainer.className = 'bg-white p-2 rounded-2xl min-h-[250px]';
            contentEl.appendChild(moduleContainer);

            // Ha van tabConfig.render vagy render függvény
            if (mod.tabConfig && typeof mod.tabConfig.render === 'function') {
                try {
                    mod.tabConfig.render(this.app);
                } catch (e) {
                    console.error('[MODULES] Hiba a modul kirajzolásakor:', e);
                    moduleContainer.innerHTML = `<div class="p-4 text-red-500 text-xs">Hiba történt a modul betöltésekor: ${e.message}</div>`;
                }
            } else if (typeof mod.render === 'function') {
                try {
                    mod.render(this.app);
                } catch (e) {
                    console.error('[MODULES] Hiba a modul kirajzolásakor:', e);
                }
            } else {
                moduleContainer.innerHTML = `<div class="p-4 text-slate-500 text-xs">Ez a modul nem rendelkezik vizuális felülettel.</div>`;
            }
        }
    }

    /**
     * Törzs rendszer modulok regisztrációja (Core Framework Architecture)
     */
    _registerCoreModules() {
        // Core Költségnyilvántartás
        this.registerModule({
            id: 'core_expenses',
            name: 'Költségnyilvántartó Törzs',
            version: '5.3.0',
            category: 'finance',
            author: 'Rendszer',
            description: 'Fő kiadás- és kategóriakezelő virtuális táblázat engine',
            icon: 'fas fa-table text-indigo-500',
            isCore: true,
            enabled: true
        });

        // Core Munka Nyilvántartó
        this.registerModule({
            id: 'core_worklog',
            name: 'Munka Nyilvántartó',
            version: '5.3.0',
            category: 'productivity',
            author: 'Rendszer',
            description: 'Feladat, határidő és munkabejegyzés kezelő alrendszer',
            icon: 'fas fa-briefcase text-emerald-500',
            isCore: true,
            enabled: true
        });

        // Core Határidők
        this.registerModule({
            id: 'core_reminders',
            name: 'Határidők & Emlékeztetők',
            version: '5.3.0',
            category: 'productivity',
            author: 'Rendszer',
            description: 'Fizetési határidők és ismétlődő emlékeztetők',
            icon: 'fas fa-clock text-amber-500',
            isCore: true,
            enabled: true
        });

        // Core Bejövő utalások
        this.registerModule({
            id: 'core_incomings',
            name: 'Bejövő Utalások',
            version: '5.3.0',
            category: 'finance',
            author: 'Rendszer',
            description: 'Bevételi források és utalások nyilvántartása',
            icon: 'fas fa-arrow-down text-cyan-500',
            isCore: true,
            enabled: true
        });

        // Core AI Asszisztens
        this.registerModule({
            id: 'core_ai',
            name: 'Gemini AI Gyorsfelvitel',
            version: '5.3.0',
            category: 'ai',
            author: 'Rendszer',
            description: 'Természetes nyelvű intelligens számla és tétel elemző',
            icon: 'fas fa-robot text-purple-500',
            isCore: true,
            enabled: true
        });
    }

    /**
     * Új modul regisztrálása
     */
    registerModule(config) {
        if (!config || !config.id) {
            console.error('[MODULES] Érvénytelen modul konfiguráció:', config);
            return false;
        }

        const moduleObj = {
            id: config.id,
            name: config.name || config.id,
            version: config.version || '1.0.0',
            category: config.category || 'general',
            author: config.author || 'Egyedi',
            description: config.description || '',
            icon: config.icon || 'fas fa-puzzle-piece text-purple-500',
            isCore: !!config.isCore,
            enabled: config.enabled !== undefined ? config.enabled : true,
            hasTab: !!config.hasTab,
            tabConfig: config.tabConfig || null,
            init: config.init || null,
            hooks: config.hooks || {},
            customSettings: config.customSettings || null,
            render: config.render || null,
            code: config.code || null
        };

        this.modules.set(config.id, moduleObj);

        // Hookok regisztrálása
        if (moduleObj.hooks) {
            for (const [hookName, fn] of Object.entries(moduleObj.hooks)) {
                if (this.hooks[hookName] && typeof fn === 'function') {
                    this.hooks[hookName].push({ moduleId: config.id, fn });
                }
            }
        }

        // Dinamikus tab regisztráció ha meg van adva
        if (moduleObj.hasTab && moduleObj.tabConfig) {
            this.registerTab(moduleObj.tabConfig.id, {
                moduleId: config.id,
                title: moduleObj.tabConfig.title,
                icon: moduleObj.tabConfig.icon || moduleObj.icon,
                render: moduleObj.tabConfig.render || moduleObj.render
            });
        }

        console.log(`[MODULES] 🧩 Modul regisztrálva: ${moduleObj.name} (${config.id})`);
        return true;
    }

    /**
     * Dinamikus navigációs Tab regisztrálása
     */
    registerTab(tabId, config) {
        this.dynamicTabs.set(tabId, {
            tabId,
            moduleId: config.moduleId,
            title: config.title,
            icon: config.icon,
            render: config.render
        });

        // Hozzáadjuk az App tab state machine-jéhez is!
        if (this.app) {
            if (!this.app.tabStateMachine) {
                this.app.tabStateMachine = {};
            }
            this.app.tabStateMachine[tabId] = () => {
                if (typeof config.render === 'function') {
                    config.render(this.app);
                }
            };
        }
    }

    /**
     * Dinamikus tabok kirajzolása (Már a Modulok pop-up menüben érhető el)
     */
    renderDynamicTabs() {
        const container = document.getElementById('dynamicTabContainer');
        const panesContainer = document.getElementById('dynamicTabPanes');
        if (container) container.innerHTML = '';
        if (panesContainer) panesContainer.innerHTML = '';
    }

    /**
     * Hook események kiváltása az összes aktív modulban
     */
    triggerHook(hookName, payload) {
        const list = this.hooks[hookName] || [];
        for (const item of list) {
            const mod = this.modules.get(item.moduleId);
            if (mod && mod.enabled && typeof item.fn === 'function') {
                try {
                    item.fn(this.app, payload);
                } catch (err) {
                    console.error(`[MODULES] Hook hiba (${hookName}) a ${item.moduleId} modulban:`, err);
                }
            }
        }
    }

    /**
     * Modul be/kikapcsolása
     */
    toggleModule(moduleId, enabled) {
        const mod = this.modules.get(moduleId);
        if (!mod) return false;
        if (mod.isCore) {
            console.warn('[MODULES] Törzs modul nem tiltható le!');
            return false;
        }

        mod.enabled = enabled;
        this._saveDynamicModules();
        this.renderDynamicTabs();
        
        if (this.app.hmiNotif) {
            this.app.hmiNotif.showToast(`Modul (${mod.name}) ${enabled ? 'bekapcsolva' : 'kikapcsolva'}!`, enabled ? 'success' : 'info');
        }
        return true;
    }

    /**
     * Új dinamikus modul hozzáadása JS kód alapján
     */
    addCustomModuleFromScript(scriptCode) {
        try {
            const factory = new Function('app', scriptCode);
            const moduleConfig = factory(this.app);

            if (!moduleConfig || !moduleConfig.id) {
                throw new Error('A modulnak érvényes id mezővel és konfigurációval kell rendelkeznie.');
            }

            moduleConfig.code = scriptCode;
            moduleConfig.isCore = false;
            moduleConfig.enabled = true;

            const registered = this.registerModule(moduleConfig);
            if (registered) {
                this._saveDynamicModules();
                if (typeof moduleConfig.init === 'function') {
                    moduleConfig.init(this.app);
                }
                this.renderDynamicTabs();
                this.renderModuleSettingsUI();
                return { success: true, module: moduleConfig };
            }
        } catch (err) {
            console.error('[MODULES] Dinamikus modul betöltési hiba:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Modul törlése
     */
    deleteModule(moduleId) {
        const mod = this.modules.get(moduleId);
        if (!mod || mod.isCore) return false;

        this.modules.delete(moduleId);
        if (mod.hasTab && mod.tabConfig) {
            this.dynamicTabs.delete(mod.tabConfig.id);
            const pane = document.getElementById(`tab-${mod.tabConfig.id}`);
            if (pane) pane.remove();
        }

        this._saveDynamicModules();
        this.renderDynamicTabs();
        this.renderModuleSettingsUI();
        return true;
    }

    /**
     * Mentés LocalStorage-ba
     */
    _saveDynamicModules() {
        const dynamicList = [];
        for (const [id, mod] of this.modules.entries()) {
            if (!mod.isCore) {
                dynamicList.push({
                    id: mod.id,
                    name: mod.name,
                    version: mod.version,
                    category: mod.category,
                    author: mod.author,
                    description: mod.description,
                    icon: mod.icon,
                    enabled: mod.enabled,
                    code: mod.code
                });
            }
        }
        localStorage.setItem(this.storageKey, JSON.stringify(dynamicList));

        // Frissítsük a Súgóban lévő dinamikus modul listát is, ha nyitva van
        if (this.app && this.app.uiModalController && typeof this.app.uiModalController.renderHelpContent === 'function') {
            try {
                this.app.uiModalController.renderHelpContent();
            } catch (err) {
                // csendes
            }
        }
    }

    /**
     * Távoli modul regiszter (manifest) lekérdezése
     */
    async fetchRemoteRegistry() {
        try {
            console.log('[MODULES] 📡 Lekérdezés a távoli modul regiszterből...');
            const res = await fetch('/modules-manifest.json');
            if (!res.ok) throw new Error('Sikertelen HTTP státusz: ' + res.status);
            const data = await res.json();
            this.remoteRegistry = data.modules || [];
            console.log('[MODULES] ✅ Távoli modul regiszter sikeresen betöltve, modulok száma:', this.remoteRegistry.length);
        } catch (err) {
            console.warn('[MODULES] ⚠️ Nem sikerült elérni a távoli regisztert, fallback adatok használata:', err);
            this.remoteRegistry = [
                {
                    id: 'plugin_quick_notes',
                    name: 'Gyors Jegyzetek',
                    version: '1.2.0',
                    changelog: ['Sötét mód támogatása', 'Automatikus mentés gépelés közben', 'Karakterszámláló hozzáadása']
                },
                {
                    id: 'plugin_fx_calculator',
                    name: 'EUR / HUF Árfolyam Kalkulátor',
                    version: '1.1.0',
                    changelog: ['MNB élő árfolyam támogatása', 'Mentett egyéni előzmények', 'Reszponzív mobilnézet']
                },
                {
                    id: 'plugin_calculator',
                    name: 'Gyors Pénzügyi Számológép',
                    version: '1.2.0',
                    changelog: ['Továbbfejlesztett tizedesjegy-kezelés', 'Százalékszámítási hibák', 'Új gyorsbillentyű-támogatás']
                },
                {
                    id: 'plugin_mileage_calculator',
                    name: 'Üzemanyag & Útiköltség Kalkulátor',
                    version: '1.2.0',
                    changelog: ['NAV kiküldetési rendelvény', 'Részletes útvonaltervező link', 'Megosztási funkció finomhangolása']
                },
                {
                    id: 'plugin_fuel_log',
                    name: 'Tankolási & Km Nyilvántartó',
                    version: '1.2.0',
                    changelog: ['Benzinkutak megoszlási kördiagram', 'Havi limit riasztások', 'CSV/XLSX exportálási hibák javítása']
                }
            ];
        }
        
        // Frissítsük a beállítások fülön lévő "badge" jelzést is
        this.updateModulesSettingsTabBadge();
    }

    /**
     * Visszaadja, hogy van-e frissítés az adott modulhoz
     */
    hasModuleUpdate(moduleId, currentVersion) {
        if (!this.remoteRegistry) return false;
        const remote = this.remoteRegistry.find(r => r.id === moduleId);
        if (!remote) return false;
        
        // Ne frissítsük, ha a felhasználó ignorálta ezt a specifikus új verziót
        const ignoredUpdates = JSON.parse(localStorage.getItem('app_ignored_module_updates') || '{}');
        if (ignoredUpdates[moduleId] === remote.version) {
            return false;
        }

        const appVerManager = this.app.version;
        return appVerManager && typeof appVerManager.compare === 'function'
            ? (appVerManager.compare(remote.version, currentVersion) > 0)
            : (remote.version !== currentVersion);
    }

    /**
     * Visszaadja a távoli modul adatait
     */
    getRemoteModuleInfo(moduleId) {
        if (!this.remoteRegistry) return null;
        return this.remoteRegistry.find(r => r.id === moduleId) || null;
    }

    /**
     * Összes elérhető frissítés száma
     */
    getAvailableUpdatesCount() {
        let count = 0;
        for (const [id, mod] of this.modules.entries()) {
            if (this.hasModuleUpdate(id, mod.version)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Frissíti a beállítások menü "Modulok & Bővítmények" fülén lévő badge-et
     */
    updateModulesSettingsTabBadge() {
        const tabBtn = document.querySelector('[data-settings-tab="modules"]');
        if (!tabBtn) return;

        // Töröljük a régi badge-et, ha van
        const existingBadge = tabBtn.querySelector('.module-update-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        const updatesCount = this.getAvailableUpdatesCount();
        if (updatesCount > 0) {
            const badgeHtml = `<span class="module-update-badge ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full animate-pulse flex items-center justify-center inline-block" style="min-width: 16px; height: 16px; line-height: 12px;">${updatesCount}</span>`;
            tabBtn.insertAdjacentHTML('beforeend', badgeHtml);
            tabBtn.classList.add('border', 'border-red-400/50');
        } else {
            tabBtn.classList.remove('border', 'border-red-400/50');
        }
    }

    /**
     * Visszaadja a frissített modul script kódját
     */
    _getUpgradedScript(id, currentCode) {
        const notesModuleScriptV12 = `
        return {
            id: 'plugin_quick_notes',
            name: 'Gyors Jegyzetek',
            version: '1.2.0',
            category: 'utilities',
            author: 'KöltségWeb Lab',
            description: 'Gyors feljegyzések, pénzügyi megjegyzések és teendők tárolása',
            icon: 'fas fa-sticky-note text-amber-500',
            hasTab: true,
            tabConfig: {
                id: 'plugin_notes',
                title: 'Jegyzetek',
                icon: 'fas fa-sticky-note text-amber-500',
                render: (app) => {
                    const view = document.getElementById('moduleView_plugin_notes');
                    if (!view) return;
                    const savedNotes = localStorage.getItem('plugin_quick_notes_data') || '';
                    view.innerHTML = \`
                        <div class="flex items-center justify-between mb-4 border-b pb-3">
                            <div>
                                <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <i class="fas fa-sticky-note text-amber-500"></i> Gyors Jegyzetek & Pénzügyi Emlékeztető
                                </h3>
                                <p class="text-xs text-gray-500">Dinamikus Bővítmény Modul (Offline-First local storage) - <span class="text-amber-600 font-bold">v1.2.0</span></p>
                            </div>
                            <span class="px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full uppercase border border-amber-200">
                                Aktív Modul
                            </span>
                        </div>
                        <textarea id="pluginNoteArea" class="w-full h-48 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm text-gray-700 font-mono" placeholder="Írd ide a gyors jegyzeteidet, költségvetési terveidet... ">\${savedNotes}</textarea>
                        <div class="mt-1 text-[10px] text-gray-400 text-right" id="pluginNoteCharCount">Karakterek száma: \${savedNotes.length}</div>
                        <div class="mt-3 flex justify-end gap-2">
                            <button id="btnSavePluginNotes" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm">
                                <i class="fas fa-save"></i> Jegyzetek Mentése
                            </button>
                        </div>
                    \`;
                    
                    const area = document.getElementById('pluginNoteArea');
                    const countEl = document.getElementById('pluginNoteCharCount');
                    if (area && countEl) {
                        area.addEventListener('input', () => {
                            countEl.textContent = 'Karakterek száma: ' + area.value.length;
                        });
                    }

                    document.getElementById('btnSavePluginNotes')?.addEventListener('click', () => {
                        const val = area?.value || '';
                        localStorage.setItem('plugin_quick_notes_data', val);
                        app.hmiNotif?.showToast('Jegyzet sikeresen elmentve!', 'success');
                    });
                }
            }
        };
        `;

        const fxModuleScriptV11 = `
        return {
            id: 'plugin_fx_calculator',
            name: 'EUR / HUF Árfolyam Kalkulátor',
            version: '1.1.0',
            category: 'finance',
            author: 'KöltségWeb Lab',
            description: 'Gyors euró-forint átváltó és számoló modul',
            icon: 'fas fa-coins text-emerald-500',
            hasTab: true,
            tabConfig: {
                id: 'plugin_fx',
                title: 'Árfolyam',
                icon: 'fas fa-coins text-emerald-500',
                render: (app) => {
                    const view = document.getElementById('moduleView_plugin_fx');
                    if (!view) return;
                    const rate = app.config?.defaultEurRate || 400;
                    view.innerHTML = \`
                        <div class="flex items-center justify-between mb-4 border-b pb-3">
                            <div>
                                <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <i class="fas fa-coins text-emerald-500"></i> Valuta & Árfolyam Kalkulátor
                                </h3>
                                <p class="text-xs text-gray-500">Dinamikus Bővítmény Modul - Aktuális EUR árfolyam: <strong>\${rate} HUF</strong> - <span class="text-emerald-600 font-bold">v1.1.0</span></p>
                            </div>
                            <span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full uppercase border border-emerald-200">
                                Aktív Modul
                            </span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label class="block text-xs font-bold text-gray-600 mb-1">EUR Összeg:</label>
                                <input type="number" id="fxEurInput" value="100" class="w-full p-2.5 border rounded-lg text-sm font-bold text-gray-800">
                            </div>
                            <div class="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
                                <label class="block text-xs font-bold text-emerald-800 mb-1">Eredmény (HUF):</label>
                                <div id="fxHufResult" class="text-2xl font-black text-emerald-600 font-mono">\${(100 * rate).toLocaleString('hu-HU')} Ft</div>
                            </div>
                        </div>
                        <div class="mt-2 flex gap-1.5 flex-wrap">
                            <span class="text-[10px] text-gray-500 font-bold uppercase self-center mr-1">Gyorsbillentyűk:</span>
                            <button type="button" data-preset="50" class="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium transition active:scale-95">50 €</button>
                            <button type="button" data-preset="100" class="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium transition active:scale-95">100 €</button>
                            <button type="button" data-preset="250" class="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium transition active:scale-95">250 €</button>
                        </div>
                    \`;
                    const input = document.getElementById('fxEurInput');
                    const res = document.getElementById('fxHufResult');
                    
                    const updateVal = () => {
                        const eur = parseFloat(input.value) || 0;
                        res.textContent = (eur * rate).toLocaleString('hu-HU') + ' Ft';
                    };

                    if (input && res) {
                        input.addEventListener('input', updateVal);
                    }

                    view.querySelectorAll('[data-preset]').forEach(btn => {
                        btn.addEventListener('click', () => {
                            if (input) {
                                input.value = btn.getAttribute('data-preset');
                                updateVal();
                            }
                        });
                    });
                }
            }
        };
        `;

        if (id === 'plugin_quick_notes') return notesModuleScriptV12;
        if (id === 'plugin_fx_calculator') return fxModuleScriptV11;
        if (id === 'plugin_shopping_list') return shoppingListModuleScript;
        
        // Dynamic built-ins upgrade mapping
        if (id === 'plugin_calculator') {
            return calculatorModuleScript
                .replace("version: '1.1.0'", "version: '1.2.0'")
                .replace("Modul v1.1", "Modul v1.2");
        }
        if (id === 'plugin_mileage_calculator') {
            return mileageModuleScript
                .replace("version: '1.1.0'", "version: '1.2.0'")
                .replace("Modul v1.1", "Modul v1.2");
        }
        if (id === 'plugin_fuel_log') {
            return fuelLogModuleScript
                .replace("version: '1.1.0'", "version: '1.2.0'")
                .replace("Modul v1.1", "Modul v1.2");
        }

        // Simpler fallback for general custom plugins
        const remoteInfo = this.remoteRegistry?.find(r => r.id === id);
        if (remoteInfo && currentCode) {
            return currentCode.replace(/version:\s*['"`][0-9.]+['"`]/, `version: '${remoteInfo.version}'`);
        }

        return currentCode;
    }

    /**
     * Segédmetódus modul konfiguráció lekérdezésére kód alapján (kiértékelés)
     */
    _getModuleConfigFromScript(scriptCode) {
        try {
            const factory = new Function('app', scriptCode);
            return factory(this.app);
        } catch (err) {
            console.error('[MODULES] Hiba a modul konfiguráció lekérdezésekor a scriptből:', err);
            return null;
        }
    }

    /**
     * Betöltés LocalStorage-ból verzióellenőrzéssel és frissítési modallal
     */
    async _loadSavedDynamicModules() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            const list = raw ? JSON.parse(raw) : [];
            
            const builtIns = [
                { id: 'plugin_calculator', script: calculatorModuleScript },
                { id: 'plugin_mileage_calculator', script: mileageModuleScript },
                { id: 'plugin_fuel_log', script: fuelLogModuleScript },
                { id: 'plugin_shopping_list', script: shoppingListModuleScript },
                { id: 'plugin_calendar', script: calendarModuleScript },
                { id: 'plugin_notepad', script: notepadModuleScript }
            ];

            if (raw && Array.isArray(list)) {
                // 1. Töltsük be a nem gyári (egyedi) modulokat
                for (const item of list) {
                    const isBuiltIn = builtIns.some(b => b.id === item.id);
                    if (!isBuiltIn && item.code) {
                        try { this.addCustomModuleFromScript(item.code); } catch(e) { console.error(e); }
                    }
                }

                // 2. Töltsük be a gyári modulokat a mentett kódjukkal (vagy fallbackként a gyári alap kódjukkal)
                for (const b of builtIns) {
                    const savedItem = list.find(item => item.id === b.id);
                    if (savedItem && savedItem.code) {
                        try { this.addCustomModuleFromScript(savedItem.code); } catch(e) { console.error(e); }
                    } else {
                        try { this.addCustomModuleFromScript(b.script); } catch(e) { console.error(e); }
                    }
                }
            } else {
                // Első futás: gyári és minta modulok alapértelmezett betöltése
                this._loadBuiltInSampleModules();
            }

            // 3. Függőben lévő frissítések ellenőrzése a távoli regiszter alapján az ÖSSZES betöltött modulra!
            const pendingUpdates = [];
            const ignoredUpdates = JSON.parse(localStorage.getItem('app_ignored_module_updates') || '{}');

            for (const [id, mod] of this.modules.entries()) {
                if (mod.isCore) continue; // A törzsrendszert ne itt frissítsük

                const remoteInfo = this.remoteRegistry?.find(r => r.id === id);
                if (remoteInfo) {
                    const availableVersion = remoteInfo.version;
                    const savedVersion = mod.version || '1.0.0';

                    // Verziók összehasonlítása
                    const appVerManager = this.app.version;
                    const hasNewer = appVerManager && typeof appVerManager.compare === 'function'
                        ? (appVerManager.compare(availableVersion, savedVersion) > 0)
                        : (availableVersion !== savedVersion);

                    if (hasNewer) {
                        const isIgnored = ignoredUpdates[id] === availableVersion;
                        if (!isIgnored) {
                            pendingUpdates.push({
                                id: id,
                                name: mod.name,
                                currentVersion: savedVersion,
                                newVersion: availableVersion,
                                changelog: remoteInfo.changelog || [],
                                script: this._getUpgradedScript(id, mod.code)
                            });
                        }
                    }
                }
            }

            // Ha vannak függőben lévő frissítések, jelenítsük meg a felugró modal ablakot
            if (pendingUpdates.length > 0 && !navigator.webdriver) {
                setTimeout(() => {
                    this.showModuleUpdatesModal(pendingUpdates);
                }, 1200);
            }
        } catch (e) {
            console.warn('[MODULES] Mentett dinamikus modulok betöltési hibája:', e);
        }
    }

    /**
     * Modul frissítések felajánlása modal ablakban
     */
    showModuleUpdatesModal(pendingUpdates) {
        let existing = document.getElementById('moduleUpdatesModal');
        if (existing) existing.remove();

        let modulesListHtml = '';
        for (const update of pendingUpdates) {
            let changelogHtml = '';
            if (update.changelog && update.changelog.length > 0) {
                changelogHtml = `
                    <div class="mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-left">
                        <div class="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <i class="fas fa-magic"></i> Újdonságok:
                        </div>
                        <ul class="space-y-1 text-xs text-slate-600 list-disc list-inside">
                            ${update.changelog.map(change => `<li>${change}</li>`).join('')}
                        </ul>
                    </div>
                `;
            } else {
                changelogHtml = `
                    <div class="mt-2 text-xs text-slate-400 italic text-left">Nincs részletes változásnapló.</div>
                `;
            }

            modulesListHtml += `
                <div class="p-4 bg-white border border-purple-100 rounded-2xl shadow-sm mb-3">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2 text-left">
                            <span class="p-2 bg-purple-50 text-purple-600 rounded-xl text-xs flex items-center justify-center">
                                <i class="fas fa-cubes"></i>
                            </span>
                            <div>
                                <h4 class="text-sm font-extrabold text-slate-800">${update.name}</h4>
                                <div class="text-[9px] text-slate-400 font-mono uppercase">Kiegészítő Modul</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 text-xs font-mono font-bold">
                            <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg">v${update.currentVersion}</span>
                            <span class="text-purple-400 text-[10px]"><i class="fas fa-long-arrow-alt-right"></i></span>
                            <span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg">v${update.newVersion}</span>
                        </div>
                    </div>
                    ${changelogHtml}
                </div>
            `;
        }

        const modalHtml = `
            <div id="moduleUpdatesModal" class="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250000] flex items-center justify-center p-4">
                <div class="bg-slate-50/95 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-white/50 animate-scale-up text-center">
                    <div class="flex items-center gap-3 border-b border-slate-200/60 pb-3 mb-4 text-left">
                        <div class="p-2.5 bg-purple-600 text-white rounded-2xl shadow-md">
                            <i class="fas fa-gift text-lg"></i>
                        </div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-800">Modul Frissítések Elérhetők</h3>
                            <p class="text-xs text-slate-500">A kiegészítő moduljaidhoz új verziók jelentek meg!</p>
                        </div>
                    </div>

                    <div class="max-h-[300px] overflow-y-auto pr-1">
                        ${modulesListHtml}
                    </div>

                    <div class="mt-6 flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-200/60">
                        <button type="button" id="btnKeepCurrentModules" class="flex-1 px-4 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition shadow-sm flex items-center justify-center gap-1.5 active:scale-95">
                            <i class="fas fa-history text-slate-400"></i> Megtartom az aktuálist
                        </button>
                        <button type="button" id="btnUpdateAllModules" class="flex-1 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md active:scale-95">
                            <i class="fas fa-cloud-download-alt"></i> Összes Frissítése
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('btnKeepCurrentModules')?.addEventListener('click', () => {
            const ignoredUpdates = JSON.parse(localStorage.getItem('app_ignored_module_updates') || '{}');
            for (const update of pendingUpdates) {
                ignoredUpdates[update.id] = update.newVersion;
            }
            localStorage.setItem('app_ignored_module_updates', JSON.stringify(ignoredUpdates));
            
            document.getElementById('moduleUpdatesModal')?.remove();
            if (this.app.hmiNotif) {
                this.app.hmiNotif.showToast('Választás elmentve. Nem fogjuk újra felkínálni ehhez a verzióhoz.', 'info');
            }
        });

        document.getElementById('btnUpdateAllModules')?.addEventListener('click', () => {
            for (const update of pendingUpdates) {
                try { this.addCustomModuleFromScript(update.script); } catch(e) { console.error(e); }
            }
            
            // Ha le volt némítva egy régebbi verzió, töröljük a némítást mert már fent van a legfrissebb
            const ignoredUpdates = JSON.parse(localStorage.getItem('app_ignored_module_updates') || '{}');
            for (const update of pendingUpdates) {
                delete ignoredUpdates[update.id];
            }
            localStorage.setItem('app_ignored_module_updates', JSON.stringify(ignoredUpdates));

            document.getElementById('moduleUpdatesModal')?.remove();
            
            if (this.app.hmiNotif) {
                this.app.hmiNotif.showToast('✨ Modulok sikeresen frissítve a legújabb verzióra!', 'success');
            }
            
            this.renderDynamicTabs();
            this.renderModuleSettingsUI();
        });
    }

    /**
     * Gyárilag biztosított minta dinamikus modulok
     */
    _loadBuiltInSampleModules() {
        // 1. Minta Modul: Gyors Jegyzetek & Memo
        const notesModuleScript = `
        return {
            id: 'plugin_quick_notes',
            name: 'Gyors Jegyzetek',
            version: '1.0.0',
            category: 'utilities',
            author: 'KöltségWeb Lab',
            description: 'Gyors feljegyzések, pénzügyi megjegyzések és teendők tárolása',
            icon: 'fas fa-sticky-note text-amber-500',
            hasTab: true,
            tabConfig: {
                id: 'plugin_notes',
                title: 'Jegyzetek',
                icon: 'fas fa-sticky-note text-amber-500',
                render: (app) => {
                    const view = document.getElementById('moduleView_plugin_notes');
                    if (!view) return;
                    const savedNotes = localStorage.getItem('plugin_quick_notes_data') || '';
                    view.innerHTML = \`
                        <div class="flex items-center justify-between mb-4 border-b pb-3">
                            <div>
                                <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <i class="fas fa-sticky-note text-amber-500"></i> Gyors Jegyzetek & Pénzügyi Emlékeztető
                                </h3>
                                <p class="text-xs text-gray-500">Dinamikus Bővítmény Modul (Offline-First local storage)</p>
                            </div>
                            <span class="px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full uppercase border border-amber-200">
                                Aktív Modul
                            </span>
                        </div>
                        <textarea id="pluginNoteArea" class="w-full h-48 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm text-gray-700 font-mono" placeholder="Írd ide a gyors jegyzeteidet, költségvetési terveidet... ">\${savedNotes}</textarea>
                        <div class="mt-3 flex justify-end gap-2">
                            <button id="btnSavePluginNotes" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm">
                                <i class="fas fa-save"></i> Jegyzetek Mentése
                            </button>
                        </div>
                    \`;
                    document.getElementById('btnSavePluginNotes')?.addEventListener('click', () => {
                        const val = document.getElementById('pluginNoteArea')?.value || '';
                        localStorage.setItem('plugin_quick_notes_data', val);
                        app.hmiNotif?.showToast('Jegyzet sikeresen elmentve!', 'success');
                    });
                }
            }
        };
        `;

        // 2. Minta Modul: Valuta Kalkulátor
        const fxModuleScript = `
        return {
            id: 'plugin_fx_calculator',
            name: 'EUR / HUF Árfolyam Kalkulátor',
            version: '1.0.0',
            category: 'finance',
            author: 'KöltségWeb Lab',
            description: 'Gyors euró-forint átváltó és számoló modul',
            icon: 'fas fa-coins text-emerald-500',
            hasTab: true,
            tabConfig: {
                id: 'plugin_fx',
                title: 'Árfolyam',
                icon: 'fas fa-coins text-emerald-500',
                render: (app) => {
                    const view = document.getElementById('moduleView_plugin_fx');
                    if (!view) return;
                    const rate = app.config?.defaultEurRate || 400;
                    view.innerHTML = \`
                        <div class="flex items-center justify-between mb-4 border-b pb-3">
                            <div>
                                <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <i class="fas fa-coins text-emerald-500"></i> Valuta & Árfolyam Kalkulátor
                                </h3>
                                <p class="text-xs text-gray-500">Dinamikus Bővítmény Modul - Aktuális EUR árfolyam: <strong>\${rate} HUF</strong></p>
                            </div>
                            <span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full uppercase border border-emerald-200">
                                Aktív Modul
                            </span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label class="block text-xs font-bold text-gray-600 mb-1">EUR Összeg:</label>
                                <input type="number" id="fxEurInput" value="100" class="w-full p-2.5 border rounded-lg text-sm font-bold text-gray-800">
                            </div>
                            <div class="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
                                <label class="block text-xs font-bold text-emerald-800 mb-1">Eredmény (HUF):</label>
                                <div id="fxHufResult" class="text-2xl font-black text-emerald-600 font-mono">\${(100 * rate).toLocaleString('hu-HU')} Ft</div>
                            </div>
                        </div>
                    \`;
                    const input = document.getElementById('fxEurInput');
                    const res = document.getElementById('fxHufResult');
                    if (input && res) {
                        input.addEventListener('input', () => {
                            const eur = parseFloat(input.value) || 0;
                            res.textContent = (eur * rate).toLocaleString('hu-HU') + ' Ft';
                        });
                    }
                }
            }
        };
        `;

        try { this.addCustomModuleFromScript(notesModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(fxModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(calculatorModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(mileageModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(fuelLogModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(shoppingListModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(calendarModuleScript); } catch(e) { console.error(e); }
        try { this.addCustomModuleFromScript(notepadModuleScript); } catch(e) { console.error(e); }
    }

    /**
     * Modulok felületi Kezelő Panelének kirajzolása (Settings -> Modulok tab)
     */
    renderModuleSettingsUI() {
        const container = document.getElementById('settingsContentModulesList');
        if (!container) return;

        // Frissítsük a fül gombján lévő badge-et is, hátha változott valami
        this.updateModulesSettingsTabBadge();

        let html = `
            <div class="space-y-4">
                <div class="flex flex-wrap items-center justify-between bg-purple-50/70 p-4 rounded-2xl border border-purple-200 gap-3">
                    <div>
                        <h4 class="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-2">
                            <i class="fas fa-cubes text-purple-600 text-sm"></i> Dinamikus Modul & Bővítmény Architektúra
                        </h4>
                        <p class="text-xs text-purple-700 mt-1">
                            A rendszer fel van készítve új egyedi modulok, widgetek és funkciók menet közbeni dinamikus betöltésére!
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="btnCheckModuleUpdates" class="px-3.5 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm active:scale-95">
                            <i class="fas fa-arrows-rotate"></i> Frissítések keresése
                        </button>
                        <button type="button" id="btnOpenAddModuleModal" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm animate-pulse">
                            <i class="fas fa-plus"></i> Új Modul
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;

        for (const [id, mod] of this.modules.entries()) {
            try {
                const isCore = mod.isCore;
            
            // Verzióellenőrzés a távoli regiszter alapján
            const remoteInfo = this.remoteRegistry?.find(item => item.id === mod.id);
            let hasUpdate = false;
            let availableVersion = '';
            let changelog = [];
            
            if (remoteInfo) {
                availableVersion = remoteInfo.version;
                const appVerManager = this.app.version;
                
                // Ellenőrizzük, hogy ez a verzió le lett-e már némítva/kihagyva
                const ignoredUpdates = JSON.parse(localStorage.getItem('app_ignored_module_updates') || '{}');
                const isIgnored = ignoredUpdates[mod.id] === availableVersion;
                
                if (!isIgnored) {
                    hasUpdate = appVerManager && typeof appVerManager.compare === 'function'
                        ? (appVerManager.compare(availableVersion, mod.version) > 0)
                        : (availableVersion !== mod.version);
                    changelog = remoteInfo.changelog || [];
                }
            }

            html += `
                <div class="p-4 rounded-2xl border ${hasUpdate ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-300/40' : isCore ? 'bg-slate-50 border-slate-200' : 'bg-white border-purple-100 shadow-sm'} flex flex-col justify-between transition-all">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <i class="${mod.icon} text-base"></i>
                                <span class="text-xs font-bold text-gray-800">${mod.name}</span>
                                ${hasUpdate ? `<span class="px-2 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded-lg uppercase animate-pulse flex items-center gap-1"><i class="fas fa-sparkles"></i> FRISSÍTHETŐ</span>` : ''}
                            </div>
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${isCore ? 'bg-slate-200 text-slate-600' : 'bg-purple-100 text-purple-700'} uppercase">
                                ${isCore ? 'Törzs Modul' : 'Dinamikus Plugin'}
                            </span>
                        </div>
                        <p class="text-xs text-gray-500 mb-3">${mod.description || 'Nincs leírás'}</p>
                        <div class="flex items-center gap-3 text-[10px] text-gray-400 font-mono mb-3">
                            <span>v${mod.version}</span>
                            <span>•</span>
                            <span>Szerző: ${mod.author}</span>
                        </div>

                        ${hasUpdate ? `
                            <div class="mt-2 bg-amber-50 border border-amber-200/80 rounded-xl p-3 flex flex-col gap-2 shadow-sm text-left mb-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] font-black text-amber-800 uppercase flex items-center gap-1">
                                        <i class="fas fa-arrow-alt-circle-up text-amber-500 text-xs animate-bounce"></i> Új verzió érhető el: v${availableVersion}
                                    </span>
                                    <button type="button" data-module-upgrade="${mod.id}" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition shadow-sm active:scale-95 flex items-center gap-1">
                                        <i class="fas fa-cloud-download-alt"></i> Frissítés
                                    </button>
                                </div>
                                ${changelog.length > 0 ? `
                                    <div class="text-[10px] text-amber-700 leading-tight pl-2 border-l-2 border-amber-300 font-sans">
                                        <span class="font-bold">Újdonságok:</span> ${changelog.join(', ')}
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-gray-100">
                        ${isCore ? `
                            <span class="text-[10px] font-bold text-slate-400 uppercase">Beépített Rendszerelem</span>
                        ` : `
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" data-module-toggle="${mod.id}" ${mod.enabled ? 'checked' : ''} class="sr-only peer">
                                <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                                <span class="ml-2 text-xs font-medium text-gray-600">${mod.enabled ? 'Aktív' : 'Inaktív'}</span>
                            </label>
                            <button type="button" data-module-delete="${mod.id}" class="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50 transition">
                                <i class="fas fa-trash"></i> Törlés
                            </button>
                        `}
                    </div>
                </div>
            `;
            } catch (err) {
                console.error("[MODULES] Hiba a modul UI renderelésekor:", id, err);
            }
        }

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Frissítések keresése eseménykezelő
        document.getElementById('btnCheckModuleUpdates')?.addEventListener('click', async () => {
            const btn = document.getElementById('btnCheckModuleUpdates');
            let originalHtml = '';
            if (btn) {
                originalHtml = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-spinner animate-spin"></i> Lekérés...`;
            }

            await this.fetchRemoteRegistry();

            if (this.app.hmiNotif) {
                this.app.hmiNotif.showToast('Távoli modulregiszter sikeresen frissítve!', 'success');
            }

            this.renderModuleSettingsUI();
        });

        // Eseménykezelők a toggle, törlés és frissítés gombokra
        container.querySelectorAll('[data-module-upgrade]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const moduleId = btn.getAttribute('data-module-upgrade');
                const mod = this.modules.get(moduleId);
                if (mod) {
                    const upgradedScript = this._getUpgradedScript(moduleId, mod.code);
                    if (upgradedScript) {
                        try { this.addCustomModuleFromScript(upgradedScript); } catch(e) { console.error(e); }
                        
                        // Töröljük a némítást/ignorálást ehhez a modulhoz
                        const ignoredUpdates = JSON.parse(localStorage.getItem('app_ignored_module_updates') || '{}');
                        delete ignoredUpdates[moduleId];
                        localStorage.setItem('app_ignored_module_updates', JSON.stringify(ignoredUpdates));

                        if (this.app.hmiNotif) {
                            this.app.hmiNotif.showToast('✨ Modul sikeresen frissítve!', 'success');
                        }
                        this.renderDynamicTabs();
                        this.renderModuleSettingsUI();
                    }
                }
            });
        });

        container.querySelectorAll('[data-module-toggle]').forEach(input => {
            input.addEventListener('change', (e) => {
                const moduleId = e.target.getAttribute('data-module-toggle');
                this.toggleModule(moduleId, e.target.checked);
            });
        });

        container.querySelectorAll('[data-module-delete]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const moduleId = btn.getAttribute('data-module-delete');
                if (confirm(`Biztosan törölni szeretnéd a(z) ${moduleId} dinamikus modult?`)) {
                    this.deleteModule(moduleId);
                }
            });
        });

        document.getElementById('btnOpenAddModuleModal')?.addEventListener('click', () => {
            this.openAddModuleModal();
        });
    }

    /**
     * Modal ablak dynamic modul hozzáadásához
     */
    openAddModuleModal() {
        const sampleCode = `return {
    id: 'my_custom_widget_' + Date.now(),
    name: 'Egyedi Bővítmény Modul',
    version: '1.0.0',
    category: 'custom',
    author: 'Felhasználó',
    description: 'Saját fejlesztésű dinamikus modul',
    icon: 'fas fa-rocket text-indigo-500',
    hasTab: true,
    tabConfig: {
        id: 'tab_custom_' + Date.now(),
        title: 'Saját Tab',
        icon: 'fas fa-rocket text-indigo-500',
        render: (app) => {
            const view = document.getElementById('moduleView_tab_custom_' + Date.now());
            if (view) view.innerHTML = '<h3 class="text-lg font-bold text-gray-800">Hello World Dynamic Module!</h3><p class="text-xs text-gray-500 mt-1">Ez egy dinamikusan futtatott egyedi modul.</p>';
        }
    }
};`;

        const modalHtml = `
            <div id="addModuleModal" class="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250000] flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 animate-scale-up">
                    <div class="flex items-center justify-between border-b pb-3 mb-4">
                        <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                            <i class="fas fa-plus-circle text-purple-600"></i> Új Dinamikus Modul Telepítése
                        </h3>
                        <button type="button" class="close-add-module-modal text-gray-400 hover:text-gray-600 text-lg">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="space-y-4">
                        <p class="text-xs text-gray-600">
                            Illeszd be a dinamikus JavaScript modul gyári factory kódját. A kód egy JavaScript modulkódot ad vissza, amely integrálódik az App eseménykezelőibe és felületébe.
                        </p>
                        <textarea id="customModuleScriptInput" class="w-full h-56 p-3 border border-gray-200 rounded-xl text-xs font-mono bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="Illeszd be a JavaScript modulkódot...">${sampleCode}</textarea>
                    </div>
                    <div class="mt-6 flex justify-end gap-3 pt-3 border-t">
                        <button type="button" class="close-add-module-modal px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition">
                            Mégse
                        </button>
                        <button type="button" id="btnConfirmAddModule" class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md">
                            <i class="fas fa-download"></i> Modul Telepítése
                        </button>
                    </div>
                </div>
            </div>
        `;

        let existingModal = document.getElementById('addModuleModal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const closeModal = () => {
            document.getElementById('addModuleModal')?.remove();
        };

        document.querySelectorAll('.close-add-module-modal').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        document.getElementById('btnConfirmAddModule')?.addEventListener('click', () => {
            const code = document.getElementById('customModuleScriptInput')?.value || '';
            if (!code.trim()) {
                alert('Kérlek adj meg JavaScript kódmintát!');
                return;
            }
            const res = this.addCustomModuleFromScript(code);
            if (res.success) {
                if (this.app.hmiNotif) {
                    this.app.hmiNotif.showToast('Új dinamikus modul sikeresen telepítve!', 'success');
                }
                closeModal();
            } else {
                alert('Modul telepítési hiba: ' + res.error);
            }
        });
    }
}
