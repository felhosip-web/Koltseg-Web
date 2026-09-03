import React, { useEffect, useRef } from 'react';

/**
 * Settings panel component providing configuration options for authentication, cloud sync,
 * appearance, security, AI settings, and module management.
 * Features multiple tabs for organizing different settings categories.
 * @returns {JSX.Element} The settings panel modal component
 */
export default function SettingsPanel() {
    /**
     * Closes the settings panel by toggling its visibility.
     * @param {Event} e - The event object
     */
    const handleClose = (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        window.app?.uiController?.togglePanel('settingsPanel');
    };

    /**
     * Saves the Google OAuth client ID settings.
     */
    const handleGoogleClientSave = () => {
        window.app?.uiController?._handleGoogleClientSave();
    };

    /**
     * Tests the Supabase database connection with current settings.
     */
    const handleTestSupabaseConn = () => {
        window.app?.uiController?._testSupabaseConnection();
    };

    /**
     * Opens the inline help documentation.
     */
    const handleHelpInline = () => {
        window.app?.hmiNotif?.openHelp?.();
    };

    /**
     * Saves general application settings including EUR rate, intervals, and weather location.
     */
    const handleSaveSettings = () => {
        window.app?.uiController?._handleSettingsSave();
    };

    /**
     * Resets appearance settings to default values (light mode, white background).
     */
    const handleResetAppearance = () => {
        window.app?.uiController?.applyDarkMode(false);
        window.app?.uiController?.applyBgTheme('white');
        localStorage.setItem('appearance_dark_mode', 'false');
        localStorage.setItem('appearance_bg_theme', 'white');
        localStorage.setItem('settings_updated_at', new Date().toISOString());
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) darkModeToggle.checked = false;
        window.app?.uiController?.updateBgThemeSelectorUI('white');
        window.app?.hmiNotif?.showToast('Megjelenés visszaállítva alapértelmezettre!', 'info');
        window.app?.logger?.log('Megjelenés', 'info', 'Visszaállítás alapértelmezett beállításokra');
    };

    /**
     * Exports and downloads the event log as a text file.
     */
    const handleSaveLogs = () => {
        if (window.app?.logger) {
            const text = window.app.logger.exportToText();
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hmi_event_logs_${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.app?.logger?.log('system', 'info', 'Eseménynapló exportálva/letöltve.');
        }
    };

    /**
     * Clears the event log after user confirmation.
     */
    const handleClearLogs = async () => {
        if (window.app?.logger) {
            const confirmed = await window.app.hmiNotif?.showConfirm?.({
                title: 'Eseménynapló törlése',
                message: 'Biztosan törölni szeretnéd az eseménynaplót?',
                type: 'danger',
                confirmText: 'Törlés',
                cancelText: 'Mégse'
            });
            if (confirmed) {
                window.app.logger.clear();
                window.app.uiController?.renderLogs();
                window.app.hmiNotif?.showToast('Eseménynapló sikeresen törölve!', 'success');
            }
        }
    };

    /**
     * Verifies the root password and upgrades current user to owner privileges.
     */
    const handleUpgradeToOwner = () => {
        const rootInput = document.getElementById('securityRootPasswordInput');
        if (rootInput) {
            window.app?.securityGuard?._verifyAndUpgradeToOwner(rootInput.value);
        }
    };

    /**
     * Toggles visibility of the root password input field.
     */
    const handleToggleShowRootPassword = () => {
        const rootInput = document.getElementById('securityRootPasswordInput');
        const toggleRootPassBtn = document.getElementById('btnToggleShowRootPassword');
        if (rootInput && toggleRootPassBtn) {
            const icon = toggleRootPassBtn.querySelector('i');
            if (rootInput.type === 'password') {
                rootInput.type = 'text';
                icon?.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                rootInput.type = 'password';
                icon?.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }
    };

    /**
     * Manually locks the application immediately.
     */
    const handleLockAppNow = () => {
        window.app?.securityGuard?.lock();
    };

    /**
     * Saves security settings including lock status, auto-lock timeout, and access PINs.
     */
    const handleSaveSecuritySettings = () => {
        window.app?.securityGuard?.saveSettingsFromUI();
    };

    /**
     * Saves AI assistant settings including API key and model selection.
     */
    const handleSaveAiSettings = () => {
        const aiApiKey = document.getElementById('aiApiKey').value.trim();
        const aiModel = document.getElementById('aiModel').value;
        if (window.app?.config) {
            window.app.config.aiConfig = {
                apiKey: aiApiKey,
                model: aiModel
            };
        }
        localStorage.setItem('ai_api_key', aiApiKey);
        localStorage.setItem('ai_model', aiModel);
        localStorage.setItem('settings_updated_at', new Date().toISOString());
        window.app?.hmiNotif?.showToast('AI beállítások mentve!', 'success');
    };

    /**
     * Handles switching between different settings tabs.
     * @param {Event} e - The click event from the tab button
     */
    const handleTabClick = (e) => {
        const targetTab = e.currentTarget.getAttribute('data-settings-tab');

        const settingsTabButtons = document.querySelectorAll('.settings-tab-btn');
        const settingsTabContents = document.querySelectorAll('.settings-tab-content');

        settingsTabButtons.forEach(b => {
            b.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
            b.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
        });
        e.currentTarget.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
        e.currentTarget.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');

        settingsTabContents.forEach(content => {
            content.classList.add('hidden');
            content.classList.remove('block');
        });

        let contentId = '';
        if (targetTab === 'general') contentId = 'settingsContentGeneral';
        else if (targetTab === 'templates') contentId = 'settingsContentTemplates';
        else if (targetTab === 'appearance') contentId = 'settingsContentAppearance';
        else if (targetTab === 'logs') {
            contentId = 'settingsContentLogs';
            window.app?.uiController?.renderLogs();
        } else if (targetTab === 'ai') {
            contentId = 'settingsContentAi';
        } else if (targetTab === 'security') {
            contentId = 'settingsContentSecurity';
            if (window.app?.securityGuard) {
                window.app.securityGuard.populateForm();
            }
        } else if (targetTab === 'modules') {
            contentId = 'settingsContentModules';
            if (window.app?.moduleManager) {
                window.app.moduleManager.renderModuleSettingsUI();
            }
        }

        const targetContent = document.getElementById(contentId);
        if (targetContent) {
            targetContent.classList.remove('hidden');
            targetContent.classList.add('block');
        }
    };

    /**
     * Handles background theme selection and application.
     * @param {Event} e - The click event from the theme button
     */
    const handleThemeClick = (e) => {
        const theme = e.currentTarget.getAttribute('data-bg-theme');
        window.app?.uiController?.applyBgTheme(theme);
        localStorage.setItem('appearance_bg_theme', theme);
        localStorage.setItem('settings_updated_at', new Date().toISOString());
        window.app?.uiController?.updateBgThemeSelectorUI(theme);
        window.app?.logger?.log('Megjelenés', 'info', `Háttér téma módosítva: ${theme}`);
    };

    /**
     * Toggles dark mode on or off based on checkbox state.
     * @param {Event} e - The change event from the dark mode toggle
     */
    const handleDarkModeToggle = (e) => {
        const isDark = e.target.checked;
        window.app?.uiController?.applyDarkMode(isDark);
        localStorage.setItem('appearance_dark_mode', String(isDark));
        localStorage.setItem('settings_updated_at', new Date().toISOString());
        window.app?.logger?.log('Megjelenés', 'info', `Sötét mód ${isDark ? 'bekapcsolva' : 'kikapcsolva'}`);
    };

    return (
        <div id="settingsPanel" onClick={(e) => { if (e.target.id === 'settingsPanel') handleClose(e); }}
            className="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[1450] modal select-none">
            <div
                className="bg-white rounded-[32px] p-6 border border-gray-200 shadow-2xl transition-all max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
                <h3
                    className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                    <span className="flex items-center gap-2"><i className="fas fa-user-shield text-indigo-600"></i> Belépés,
                        Felhő & Beállítások</span>
                    <div className="flex items-center gap-3">
                        <span id="dbVersionBadge"
                            className="text-[10px] font-mono bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-md border border-indigo-100 font-bold app-version-label">v7.0.18</span>
                        <button type="button" id="btnCloseSettingsModal" onClick={(e) => handleClose(e)}
                            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 transition"
                            title="Bezárás">
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </h3>

                {/* ===== BEÁLLÍTÁSOK BELSŐ TABS ===== */}
                <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-3">
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm"
                        data-settings-tab="general">
                        <i className="fas fa-sliders-h mr-1.5"></i> Alapbeállítások & Szinkronizáció
                    </button>
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                        data-settings-tab="templates">
                        <i className="fas fa-arrows-rotate mr-1.5"></i> Állandó Költségek
                    </button>
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                        data-settings-tab="appearance">
                        <i className="fas fa-paint-brush mr-1.5"></i> Megjelenés & Téma
                    </button>
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                        data-settings-tab="logs">
                        <i className="fas fa-history mr-1.5"></i> Eseménynapló
                    </button>
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                        data-settings-tab="security">
                        <i className="fas fa-shield-alt mr-1.5"></i> Biztonság & Zár
                    </button>
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                        data-settings-tab="ai">
                        <i className="fas fa-robot mr-1.5"></i> AI Asszisztens
                    </button>
                    <button type="button" onClick={handleTabClick}
                        className="settings-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                        data-settings-tab="modules">
                        <i className="fas fa-puzzle-piece mr-1.5 text-purple-500"></i> Modulok & Bővítmények
                    </button>
                </div>

                {/* 1. Alapbeállítások tartalom */}
                <div id="settingsContentGeneral" className="settings-tab-content block space-y-6">


                    {/* FŐ GRID: Beléptetés (Google & Supabase) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        {/* 1. Google Fiók Kapcsolat kártya */}
                        <div
                            className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h4
                                        className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <i className="fab fa-google text-red-500 text-sm"></i> Google Fiók Szinkronizáció
                                    </h4>
                                    <span id="googleStatusBadge"
                                        className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 uppercase">Nincs
                                        belépve</span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                    Kapcsold össze a rendszert Google-fiókoddal! Így mobiltelefonodon (Chrome, Safari,
                                    PWA) és asztali böngésződben is automatikusan elérheted és mentheted az összes
                                    adatodat.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="relative">
                                    <form onSubmit={(e) => e.preventDefault()}>
                                        <input type="text" id="gdriveClientIdGeneral"
                                            className="w-full pl-4 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-xs font-mono focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition"
                                            placeholder="Google OAuth Client ID (GOCSPX-...)" />
                                    </form>
                                </div>
                                <button id="btnSaveGDriveClientGeneral" onClick={handleGoogleClientSave}
                                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow">
                                    <i className="fas fa-save"></i> Client ID Mentése
                                </button>
                            </div>
                        </div>

                        {/* 2. Supabase Beállítás kártya */}
                        <div
                            className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h4
                                        className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <i className="fas fa-cloud text-indigo-600 text-sm"></i> Supabase Felhő Adatbázis
                                        (Fejlett)
                                    </h4>
                                    <div
                                        className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200">
                                        <span className="text-[10px] font-bold text-slate-500 px-1.5">Felhő aktív:</span>
                                        <input type="checkbox" id="supabaseToggle"
                                            className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                    <div>
                                        <label
                                            className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Supabase
                                            URL</label>
                                        <input type="text" id="supabaseUrlInput"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                                            placeholder="https://xyz.supabase.co" />
                                    </div>
                                    <div>
                                        <label
                                            className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Anon
                                            Public API Key</label>
                                        <form onSubmit={(e) => e.preventDefault()}><input type="password"
                                                id="supabaseKeyInput"
                                                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-xs" />
                                        </form>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2">
                                <button id="btnTestSupabaseConnSettings" onClick={handleTestSupabaseConn}
                                    className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2">
                                    <i className="fas fa-plug"></i> Kapcsolat Tesztelése
                                </button>
                                <button id="btnHelpInline" onClick={handleHelpInline}
                                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center justify-center"
                                    title="Hogyan kell beállítani?">
                                    <i className="fas fa-question-circle text-sm"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ÁLTALÁNOS ÉS HÁTTÉRFOLYAMATOK SZEKCIÓ */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 mb-6">
                        <h4
                            className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider">
                            <i className="fas fa-cogs text-indigo-500"></i> Általános & Háttérfolyamatok Beállításai
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label
                                    className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Biztonsági
                                    EUR árfolyam (Ft)</label>
                                <input type="number" id="eurRateInput"
                                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-xs font-bold text-gray-700" />
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <input type="checkbox" id="useLiveEurToggle" defaultChecked
                                        className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
                                    <label htmlFor="useLiveEurToggle"
                                        className="text-[10px] text-slate-500 font-semibold cursor-pointer select-none">Automata
                                        online követés</label>
                                </div>
                            </div>
                            <div>
                                <label
                                    className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Emlékeztetők
                                    (perc)</label>
                                <input type="number" id="bgReminderInterval" defaultValue="5"
                                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-xs font-bold text-gray-700" />
                            </div>
                            <div>
                                <label
                                    className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Auto-szinkron
                                    (perc)</label>
                                <input type="number" id="bgSyncInterval" defaultValue="10"
                                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-xs font-bold text-gray-700" />
                            </div>
                            <div>
                                <div
                                    className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-gray-200 w-full justify-between h-[42px]">
                                    <span className="text-xs font-bold text-slate-600">Műveletek aktívak:</span>
                                    <input type="checkbox" id="bgTasksEnabled" defaultChecked
                                        className="w-5 h-5 accent-indigo-600 cursor-pointer" />
                                </div>
                            </div>
                        </div>

                        {/* Rejtett paraméterek az oop-core kompatibilitáshoz */}
                        <input type="number" id="bgBackupInterval" defaultValue="25" className="hidden" />

                        {/* Időjárás és Helyszín Beállítása */}
                        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                                    <i className="fas fa-cloud-sun text-indigo-500"></i> Időjárás helyszíne (Település)
                                </label>
                                <input type="text" id="weatherCityInput" defaultValue="Budapest" placeholder="Pl. Budapest, Debrecen, Szeged..."
                                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-xs font-bold text-gray-700" />
                                <span className="text-[9px] text-slate-400 mt-1 block">
                                    Adja meg a várost az áttekintő oldali automatikus időjárás-előrejelzéshez (Open-Meteo API).
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 border-b border-gray-100 pb-5 mb-5">
                        <button id="btnSaveSettings" onClick={handleSaveSettings}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-md">
                            <i className="fas fa-save"></i> Változtatások Mentése és Alkalmazása
                        </button>
                    </div>

                </div> {/* /settingsContentGeneral */}

                {/* 2. Állandó Költségek Sablonjai tartalom */}
                <div id="settingsContentTemplates" className="settings-tab-content hidden">
                    {/* Sablonok szekció */}
                    <div className="mt-4">
                        <h4
                            className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
                            <i className="fas fa-arrows-rotate text-emerald-500"></i> Állandó (Fix) Költségek Sablonjai
                        </h4>
                        <div id="templateCloudWarning"
                            className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 mb-4">
                            <i className="fas fa-exclamation-triangle text-amber-500 text-lg mt-0.5"></i>
                            <div>
                                <h5 className="text-sm font-bold text-amber-800">A sablonkezelés nem elérhető</h5>
                                <p className="text-xs text-amber-700 mt-0.5">A fix költségek automatikus havi generálásához
                                    aktív, működő Supabase felhőkapcsolat szükséges!</p>
                            </div>
                        </div>
                        <div id="templateManagerContainer" className="hidden">
                            <div
                                className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-200 mb-4 items-end">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tétel</label>
                                    <select id="tplItemSelect"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-emerald-500"></select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Összeg</label>
                                    <input type="number" id="tplAmountInput"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                                        placeholder="0" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Pénznem</label>
                                    <select id="tplCurrencySelect"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-emerald-500 font-medium">
                                        <option value="HUF">HUF</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fizetési mód</label>
                                    <select id="tplMethodSelect"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-emerald-500">
                                        <option value="Utalás">Utalás</option>
                                        <option value="Bankkártya">Bankkártya</option>
                                        <option value="Készpénz">Készpénz</option>
                                        <option value="Egyéb">Egyéb</option>
                                    </select>
                                </div>
                                <button id="btnTemplateAdd"
                                    className="w-full py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 shadow-sm">
                                    <i className="fas fa-plus"></i> Sablon hozzáadása
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left text-gray-600">
                                    <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[10px]">
                                        <tr>
                                            <th className="p-3 rounded-l-xl">Tétel</th>
                                            <th className="p-3">Fix Összeg</th>
                                            <th className="p-3">Fizetési mód</th>
                                            <th className="p-3 text-right rounded-r-xl">Művelet</th>
                                        </tr>
                                    </thead>
                                    <tbody id="templatesTableBody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div> {/* /settingsContentTemplates */}

                {/* 3. Megjelenés & Téma tartalom */}
                <div id="settingsContentAppearance" className="settings-tab-content hidden space-y-6 animate-fade-in">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                        <h4
                            className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider">
                            <i className="fas fa-paint-brush text-indigo-500"></i> Megjelenés & Testreszabás
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed mb-6">
                            Szabd testre az alkalmazás felületét a saját igényeid szerint! Választhatsz szemkímélő sötét
                            módot, vagy finom, nem teljesen fehér háttérárnyalatokat a jobb olvashatóságért.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Sötét Mód Kártya */}
                            <div
                                className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <i className="fas fa-moon text-indigo-500"></i> Sötét Mód (Dark Mode)
                                        </span>
                                        {/* iOS-style Switch Toggle */}
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" id="darkModeToggle" className="sr-only peer" onChange={handleDarkModeToggle} />
                                            <div
                                                className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600">
                                            </div>
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        Szemkímélő sötét színvilág (kozmikus pala és mélykék tónusok) esti vagy éjszakai
                                        használathoz.
                                    </p>
                                </div>
                                <div id="darkModeStatusText" className="text-[10px] font-mono text-slate-400 mt-4">
                                    Aktív állapot: Kikapcsolva
                                </div>
                            </div>

                            {/* Háttérszín Választó Kártya */}
                            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                                    <i className="fas fa-palette text-indigo-500"></i> Háttér Árnyalata
                                </span>
                                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                    Ha a tiszta fehér háttér túl vakító, válassz egy lágy, meleg vagy hűvös háttérszínt
                                    (világos módban érvényes):
                                </p>

                                {/* Szín gombok */}
                                <div className="flex flex-wrap gap-3" id="themeBgSelectorContainer">
                                    {/* White */}
                                    <button type="button" data-bg-theme="white" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-white border-2 border-indigo-600 shadow-sm focus:outline-none relative transition-all hover:scale-105"
                                        title="Pure White">
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-indigo-600 check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                    {/* Cream */}
                                    <button type="button" data-bg-theme="cream" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-[#faf7f0] border-2 border-gray-200 shadow-sm focus:outline-none relative transition-all hover:scale-105"
                                        title="Warm Cream">
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-indigo-600 hidden check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                    {/* Sage */}
                                    <button type="button" data-bg-theme="sage" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-[#f4f6f4] border-2 border-gray-200 shadow-sm focus:outline-none relative transition-all hover:scale-105"
                                        title="Pastel Sage">
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-indigo-600 hidden check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                    {/* Ice Blue */}
                                    <button type="button" data-bg-theme="ice" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-[#f0f4f8] border-2 border-gray-200 shadow-sm focus:outline-none relative transition-all hover:scale-105"
                                        title="Ice Blue">
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-indigo-600 hidden check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                    {/* Lavender */}
                                    <button type="button" data-bg-theme="lavender" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-[#f5f3f7] border-2 border-gray-200 shadow-sm focus:outline-none relative transition-all hover:scale-105"
                                        title="Soft Lavender">
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-indigo-600 hidden check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                    {/* Slate */}
                                    <button type="button" data-bg-theme="slate" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-[#f1f5f9] border-2 border-gray-200 shadow-sm focus:outline-none relative transition-all hover:scale-105"
                                        title="Slate Gray">
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-indigo-600 hidden check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                    {/* Emerald Slate */}
                                    <button type="button" data-bg-theme="emerald-slate" onClick={handleThemeClick}
                                        className="w-10 h-10 rounded-xl bg-[#0c1524] border-2 border-gray-200 shadow-sm focus:outline-none relative overflow-hidden transition-all hover:scale-105"
                                        title="Modern Emerald Slate (Sötét)">
                                        <div className="absolute inset-y-0 right-0 w-1/2 bg-[#10b981]"></div>
                                        <span
                                            className="absolute inset-0 flex items-center justify-center text-white hidden check-icon"><i
                                                className="fas fa-check text-xs"></i></span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div
                            className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
                            <span>💡 A beállítások azonnal érvénybe lépnek és automatikusan elmentésre kerülnek a helyi
                                tárolóba.</span>
                            <button id="btnResetAppearance" onClick={handleResetAppearance}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-lg transition">Visszaállítás
                                alapértelmezettre</button>
                        </div>
                    </div>
                </div>

                {/* 3. Eseménynapló tartalom */}
                <div id="settingsContentLogs" className="settings-tab-content hidden space-y-4">
                    <div
                        className="flex flex-col md:flex-row md:items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100 gap-3">
                        <div>
                            <h4
                                className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <i className="fas fa-history text-indigo-500"></i> Fontosabb Rendszeresemények
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Az alkalmazás és a háttérfolyamatok legfontosabb műveletei és szinkronizációs ütközései
                                időbélyeggel ellátva.
                            </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button id="btnSaveLogs" onClick={handleSaveLogs}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                                <i className="fas fa-download"></i> Letöltés
                            </button>
                            <button id="btnClearLogs" onClick={handleClearLogs}
                                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                <i className="fas fa-trash-alt"></i> Törlés
                            </button>
                        </div>
                    </div>

                    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/50">
                        <div className="max-h-[350px] overflow-y-auto p-3 space-y-2 text-xs font-mono"
                            id="settingsLogsList">
                            <div className="text-center py-8 text-gray-400 italic">Nincsenek események rögzítve</div>
                        </div>
                    </div>
                </div>

                {/* 4. Biztonság & Hozzáférés tartalom */}
                <div id="settingsContentSecurity" className="settings-tab-content hidden space-y-6 animate-fade-in">
                    {/* 👑 TULAJDONOSI JOGOK FELOLDÁSA (GUEST ESETÉN) */}
                    <div id="securityGuestUpgradePanel"
                        className="hidden bg-white p-6 rounded-3xl border border-slate-200 shadow-sm max-w-md mx-auto space-y-5 my-4">
                        <div className="text-center space-y-2">
                            <div
                                className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mx-auto border border-indigo-100 shadow-sm">
                                <i className="fas fa-user-shield"></i>
                            </div>
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Tulajdonosi jogok
                                feloldása</h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                Ezen az eszközön jelenleg <strong>Vendég (User 2)</strong> módban vagy. A biztonsági zár
                                módosításához és a beállítások mentéséhez add meg a szerver-oldali <strong>Fejlesztői
                                    Mester Jelszót</strong>!
                            </p>
                        </div>

                        <div className="space-y-4 pt-2">
                            <div>
                                <label
                                    className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                                    <i className="fas fa-terminal text-indigo-500"></i> Fejlesztői Mester Jelszó:
                                </label>
                                <div className="relative">
                                    <form onSubmit={(e) => e.preventDefault()}><input type="password"
                                            id="securityRootPasswordInput"
                                            className="w-full pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-mono tracking-widest focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                            placeholder="Mester Jelszó" /></form>
                                    <button type="button" id="btnToggleShowRootPassword" onClick={handleToggleShowRootPassword}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-indigo-500 transition">
                                        <i className="fas fa-eye text-xs"></i>
                                    </button>
                                </div>
                            </div>
                            <button type="button" id="btnUpgradeToOwner" onClick={handleUpgradeToOwner}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md">
                                <i className="fas fa-unlock-keyhole"></i> Tulajdonosként Bejelentkezés
                            </button>
                        </div>
                    </div>

                    {/* 🔒 VALÓDI BIZTONSÁGI BEÁLLÍTÁSOK (TULAJDONOS ESETÉN) */}
                    <div id="securityOwnerSettingsPanel" className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                        <h4
                            className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider">
                            <i className="fas fa-shield-alt text-indigo-500"></i> Alkalmazás Hozzáférés-zár (Access Guard)
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed mb-6">
                            Védd meg az adataidat az illetéktelen betekintőktől a nyilvános helyeken futó szervereken!
                            Aktiválj egy PIN vagy jelszó alapú zárat, amely letiltja a teljes felületet a helyes kód
                            megadásáig. Kétféle kódot is beállíthatsz: egyet magadnak (Tulajdonos) és egyet másoknak
                            (Vendég / User 2).
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Zár Aktiválása Kártya */}
                            <div
                                className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <i className="fas fa-power-off text-indigo-500"></i> Hozzáférés-zár Aktív
                                        </span>
                                        {/* Switch Toggle */}
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" id="securityLockToggle" className="sr-only peer" />
                                            <div
                                                className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600">
                                            </div>
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                        Ha bekapcsolod, az alkalmazás betöltésekor vagy inaktivitás esetén egy
                                        záróképernyő jelenik meg.
                                    </p>
                                </div>

                                <div>
                                    <label
                                        className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                        <i className="fas fa-hourglass-half text-indigo-500"></i> Automatikus lezárás
                                        inaktivitás esetén:
                                    </label>
                                    <select id="securityAutolockSelect"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs font-medium focus:outline-none focus:border-indigo-500" defaultValue="5">
                                        <option value="1">1 perc inaktivitás</option>
                                        <option value="3">3 perc inaktivitás</option>
                                        <option value="5">5 perc inaktivitás</option>
                                        <option value="15">15 perc inaktivitás</option>
                                        <option value="30">30 perc inaktivitás</option>
                                        <option value="0">Soha (csak kézzel/frissítéskor)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Jelszavak Beállítása Kártya */}
                            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <i className="fas fa-key text-indigo-500"></i> Feloldó kódok (PIN vagy jelszó)
                                </span>

                                <div>
                                    <label
                                        className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                                        <span>👑 1. Tulajdonos (Owner) kódja:</span>
                                        <span
                                            className="text-[9px] text-indigo-600 font-semibold uppercase tracking-wider">Teljes
                                            hozzáférés</span>
                                    </label>
                                    <form onSubmit={(e) => e.preventDefault()}><input type="password"
                                            id="securityOwnerPinInput"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-mono tracking-widest focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                            placeholder="PIN vagy Jelszó" /></form>
                                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">Kezelheti a beállításokat,
                                        hozzáfér az összes funkcióhoz és a teljes törléshez (RESET).</p>
                                </div>

                                <div className="pt-2 border-t border-slate-100">
                                    <label
                                        className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                                        <span>👥 2. Vendég / User 2 kódja (Opcionális):</span>
                                        <span
                                            className="text-[9px] text-amber-600 font-semibold uppercase tracking-wider">Csak
                                            megtekintés & adatbevitel</span>
                                    </label>
                                    <form onSubmit={(e) => e.preventDefault()}><input type="password"
                                            id="securityGuestPinInput"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-mono tracking-widest focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                            placeholder="Vendég PIN vagy Jelszó" /></form>
                                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">Láthatja az adatokat és
                                        rögzíthet újakat, de a Beállítások, a törlési funkciók és a Fejlesztői Panel
                                        zárolva lesznek számára.</p>
                                </div>
                            </div>
                        </div>

                        {/* Audit & Action footer */}
                        <div
                            className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center text-[11px] text-slate-400">
                            <span className="flex items-center gap-1.5 leading-normal">
                                <i className="fas fa-info-circle text-indigo-500 shrink-0"></i>
                                <span>A bejelentkezési kísérletek (tulajdonos, vendég vagy hibás próbálkozások)
                                    bekerülnek az <strong>Eseménynaplóba</strong>!</span>
                            </span>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button type="button" id="btnLockAppNow" onClick={handleLockAppNow}
                                    className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm">
                                    <i className="fas fa-lock"></i> Kézi lezárás most
                                </button>
                                <button type="button" id="btnSaveSecuritySettings" onClick={handleSaveSecuritySettings}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm ml-auto">
                                    <i className="fas fa-check"></i> Biztonsági Beállítások Mentése
                                </button>
                            </div>
                        </div>
                    </div> {/* /securityOwnerSettingsPanel */}
                </div> {/* /settingsContentSecurity */}

                {/* AI Asszisztens tartalom */}
                <div id="settingsContentAi" className="settings-tab-content hidden space-y-6 animate-fade-in">
                    <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100/60 mb-6">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm shrink-0">
                                <i className="fas fa-robot"></i>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-indigo-900 uppercase tracking-wider mb-1">AI Gyorsfelvitel (Gemini)</h4>
                                <p className="text-[11px] text-indigo-700/80 leading-relaxed max-w-xl">
                                    Az AI modell segítségével a mondatként beírt kiadásokat és bevételeket a rendszer automatikusan szétszedi (összeg, dátum, kategória, megjegyzés). A funkció használatához <strong>Google Gemini API kulcs</strong> szükséges!
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100/80 space-y-5">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                            <i className="fas fa-key text-indigo-500"></i> API Kulcs & Modell beállítás
                        </h4>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="aiApiKey" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">
                                    Gemini API Kulcs
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <i className="fas fa-key text-gray-400"></i>
                                    </div>
                                    <input type="password" id="aiApiKey" placeholder="AI Studio (Google) API kulcs"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all shadow-inner" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5 ml-1">Ha üresen hagyod, az alapértelmezett, szerveren konfigurált kulcsot használja (ha van).</p>
                            </div>

                            <div>
                                <label htmlFor="aiModel" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">
                                    Gemini Modell
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <i className="fas fa-brain text-gray-400"></i>
                                    </div>
                                    <select id="aiModel" className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all appearance-none" defaultValue="gemini-3.5-flash">
                                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Gyors, Alapértelmezett)</option>
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Okosabb)</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">
                                        <i className="fas fa-chevron-down text-xs"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-5 border-t border-slate-100 flex justify-end">
                            <button type="button" id="btnSaveAiSettings" onClick={handleSaveAiSettings}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-200 active:scale-95">
                                <i className="fas fa-save"></i> AI Beállítások Mentése
                            </button>
                        </div>
                    </div>
                </div>

                {/* Modulok & Bővítmények tartalom */}
                <div id="settingsContentModules" className="settings-tab-content hidden space-y-6 animate-fade-in">
                    <div id="settingsContentModulesList"></div>
                </div>
            </div>
        </div>
    );
}
