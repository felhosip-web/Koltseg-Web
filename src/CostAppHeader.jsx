import React from 'react';

export default function CostAppHeader() {
    return (
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 pb-5">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 app-title">
                    <i className="fas fa-receipt text-blue-600"></i>
                    Költség Nyilvántartó
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
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex flex-wrap gap-2">
                    <button id="btnNewItem"
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition shadow-sm">
                        <i className="fas fa-plus-circle"></i> Tétel
                    </button>
                    <button id="btnNewMonth"
                        className="px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition shadow-sm">
                        <i className="fas fa-calendar-plus"></i> Hónap
                    </button>
                    <button id="btnAiMagic"
                        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:from-purple-700 hover:to-indigo-700 transition shadow-sm"
                        title="AI Gyorsfelvitel">
                        <i className="fas fa-magic"></i> AI
                    </button>
                    <button id="btnCostToMenu"
                        className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-gray-200 transition shadow-sm border border-gray-200"
                        title="Vissza a Főmenübe">
                        <i className="fas fa-th-large text-gray-500"></i> Főmenü
                    </button>
                    <button type="button"
                        className="btn-modules-toggle px-4 py-2.5 bg-purple-50 text-purple-700 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-purple-100 transition shadow-sm border border-purple-200"
                        title="Modulok és Bővítmények">
                        <i className="fas fa-puzzle-piece text-purple-600"></i> Modulok
                    </button>
                </div>

                <div className="flex gap-2 relative">
                    <button id="btnHelp"
                        className="p-3 bg-white border border-gray-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 transition font-semibold w-11 h-11 flex items-center justify-center shadow-sm"
                        title="Súgó / Útmutató">
                        <i className="fas fa-question text-lg"></i>
                    </button>

                    <button id="btnSettings"
                        className="p-3 bg-white border border-gray-200 rounded-2xl text-gray-600 hover:bg-gray-50 transition w-11 h-11 flex items-center justify-center shadow-sm"
                        title="Belépés & Beállítások">
                        <i className="fas fa-sliders-h"></i>
                    </button>

                    <button id="btnDataControl"
                        className="p-3 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 transition w-11 h-11 flex items-center justify-center shadow-sm"
                        title="Adatbázis & Export">
                        <i className="fas fa-database"></i>
                    </button>

                    <button id="btnInstallApp"
                        className="hidden px-4 py-2 bg-slate-900 text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition shadow-sm">
                        <i className="fas fa-arrow-to-bottom"></i> Telepítés
                    </button>

                    <div id="exportMenu"
                        className="hidden absolute right-[-2rem] sm:right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 text-sm overflow-y-auto max-h-[calc(100vh-10rem)]">
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Riportok
                        </div>
                        <button id="btnExportExcel"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-file-excel text-emerald-600"></i> Excel
                        </button>
                        <button id="btnExportPdf"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-file-pdf text-rose-600"></i> PDF
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Adatbázis
                        </div>
                        <button id="btnExportJson"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-save text-blue-500"></i> JSON mentés
                        </button>
                        <button id="btnImportJson"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-folder-open text-amber-500"></i> JSON betöltés
                        </button>
                        <button id="btnDbAudit"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-database text-amber-600"></i> IndexedDB Audit
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button id="btnForceSync"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-indigo-600">
                            <i className="fas fa-arrows-rotate"></i> Szinkronizálás
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Backup</div>
                        <button id="btnRestoreBackup"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-undo-alt text-purple-500"></i> Visszaállítás backupból
                        </button>
                        <button id="btnForceBackup"
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                            <i className="fas fa-database text-blue-500"></i> Manuális backup mentés
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button id="btnWipeDatabase"
                            className="w-full text-left px-3 py-2.5 hover:bg-red-50 flex items-center gap-2 text-red-600 font-semibold">
                            <i className="fas fa-trash-can"></i> Adatbázis törlése
                        </button>
                    </div>
                </div>

                <div id="syncQueueContainer" className="relative inline-block ml-2 cursor-pointer group"
                    title="Függőben lévő szinkronizációs műveletek">
                    <i className="fas fa-cloud-upload-alt text-gray-400 text-lg hover:text-amber-500 transition"></i>
                    <span id="syncQueueBadge"
                        className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center hidden">0</span>

                    <div
                        className="sync-queue-tooltip hidden group-hover:block absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl p-4 min-w-[220px] z-50 border border-gray-100">
                        <div className="text-xs font-bold text-gray-700 mb-2">🔄 Függő műveletek</div>
                        <div id="tooltipContent" className="text-xs text-gray-500">Nincs adat</div>
                    </div>
                </div>

                <div
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-medium">
                    <span id="eurLed" className="w-3 h-3 rounded-full bg-gray-400"></span>
                    <span id="eurStatusText" className="text-gray-700">EUR: ...</span>
                </div>

                <div id="reminderGlobalStatus"
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm font-medium cursor-pointer hover:shadow transition">
                    <span id="reminderLed" className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span id="reminderStatusText">Határidők OK</span>
                    <span id="reminderCount"
                        className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono text-xs">0</span>
                </div>
            </div>
        </header>
    );
}
