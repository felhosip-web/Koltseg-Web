import React, { useState } from 'react';

export default function WorkAppHeader() {
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    const handleNewWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.app?.workLogRenderer?.openModal?.();
    };

    const handleWorkToMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const workApp = document.getElementById('workAppView');
        const landing = document.getElementById('appLandingScreenRoot')?.parentElement;
        if (workApp) workApp.classList.add('hidden');
        if (landing) landing.classList.remove('hidden');
        localStorage.removeItem('hmi_selected_module');
    };

    const handleModulesToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.app?.moduleManager?.openChooserModal?.();
    };

    const handleHelpWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.app?.hmiNotif?.openHelp?.('work_log');
    };

    const handleSettingsWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app?.ui) {
            window.app.ui.populateSettingsForm();
            window.app.ui.togglePanel('settingsPanel');
        }
    };

    const handleDataControlWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExportMenuOpen(!exportMenuOpen);
    };

    const handleExportExcelWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExportMenuOpen(false);
        window.app?.ui?.exportController?.exportWorkExcel?.();
    };

    const handleExportPdfWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExportMenuOpen(false);
        window.app?.ui?.exportController?.exportWorkPdf?.();
    };

    const handleExportJsonWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExportMenuOpen(false);
        window.app?.ui?.exportController?.exportWorkJson?.();
    };

    const handleImportJsonWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExportMenuOpen(false);
        window.app?.ui?.exportController?.importWorkJson?.();
    };

    const handleForceSyncWork = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExportMenuOpen(false);
        window.app?.ui?.openSyncModal?.();
    };

    return (
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 pb-5">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 app-title" id="workMainTitle">
                    <i className="fas fa-briefcase text-emerald-600"></i>
                    Munka Nyilvántartás
                </h1>

                <div className="flex items-center gap-1.5 ml-2">
                    <span className="global-network-badge text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium flex items-center gap-1 transition-colors">
                        <i className="fas fa-network-wired"></i> <span className="global-status-text">Offline</span>
                    </span>
                    <span className="supabase-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 border border-transparent transition-all" title="Supabase (Inaktív)">
                        <i className="fas fa-database text-[10px]"></i>
                    </span>
                    <span className="gdrive-status-icon w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 border border-transparent transition-all" title="Google Drive (Inaktív)">
                        <i className="fab fa-google-drive text-[10px]"></i>
                    </span>
                    <span
                        className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold flex items-center gap-1 ml-1">
                        v7.0.5
                    </span>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                <button type="button" id="btnNewWork" onClick={handleNewWork}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition shadow-sm">
                    <i className="fas fa-plus-circle"></i> Új munka felvitele
                </button>
                <button type="button" id="btnWorkToMenu" onClick={handleWorkToMenu}
                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-gray-200 transition shadow-sm border border-gray-200">
                    <i className="fas fa-th-large text-gray-500"></i> Főmenü
                </button>
                <button type="button" onClick={handleModulesToggle}
                    className="btn-modules-toggle px-4 py-2.5 bg-purple-50 text-purple-700 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-purple-100 transition shadow-sm border border-purple-200"
                    title="Modulok és Bővítmények">
                    <i className="fas fa-puzzle-piece text-purple-600"></i> Modulok
                </button>

                <div className="flex gap-2 relative">
                    <button type="button" id="btnHelpWork" onClick={handleHelpWork}
                        className="p-3 bg-white border border-gray-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 transition font-semibold w-11 h-11 flex items-center justify-center shadow-sm"
                        title="Súgó / Útmutató">
                        <i className="fas fa-question text-lg"></i>
                    </button>

                    <button type="button" id="btnSettingsWork" onClick={handleSettingsWork}
                        className="p-3 bg-white border border-gray-200 rounded-2xl text-gray-600 hover:bg-gray-50 transition w-11 h-11 flex items-center justify-center shadow-sm"
                        title="Belépés & Beállítások">
                        <i className="fas fa-sliders-h"></i>
                    </button>

                    <button type="button" id="btnDataControlWork" onClick={handleDataControlWork}
                        className="p-3 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 transition w-11 h-11 flex items-center justify-center shadow-sm"
                        title="Adatbázis & Export">
                        <i className="fas fa-database"></i>
                    </button>

                    {/* ===== ADATKEZELÉS MENÜ WORK ===== */}
                    <div id="exportMenuWork"
                        className={`${exportMenuOpen ? '' : 'hidden'} absolute right-[-2rem] sm:right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 text-sm overflow-y-auto max-h-[calc(100vh-10rem)] text-left`}>
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Riportok
                        </div>
                        <button type="button" id="btnExportExcelWork" onClick={handleExportExcelWork}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-file-excel text-emerald-600"></i> Excel export
                        </button>
                        <button type="button" id="btnExportPdfWork" onClick={handleExportPdfWork}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-file-pdf text-rose-600"></i> PDF export
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Adatbázis
                        </div>
                        <button type="button" id="btnExportJsonWork" onClick={handleExportJsonWork}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-save text-blue-500"></i> JSON mentés
                        </button>
                        <button type="button" id="btnImportJsonWork" onClick={handleImportJsonWork}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-upload text-amber-500"></i> JSON betöltés
                        </button>
                        <button type="button" id="btnForceSyncWork" onClick={handleForceSyncWork}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-indigo-600 font-bold border-t border-gray-100">
                            <i className="fas fa-sync-alt"></i> Szinkronizáció
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
