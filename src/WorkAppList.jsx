import React, { useEffect, useRef, useState } from 'react';

import { useAppStore } from './store/useAppStore.js';

export default function WorkAppList() {
    const listRef = useRef(null);
    const snapshot = useAppStore();

    const works = snapshot?.works || [];

    // KPI Calculation
    const active = works.filter(w => w.status === 'folyamatban').length;
    const done = works.filter(w => w.status === 'elvégzett').length;
    const failed = works.filter(w => w.status === 'meghiúsult').length;

    const [nameSearch, setNameSearch] = useState('');
    const [dateSearch, setDateSearch] = useState('');
    const [viewMode, setViewMode] = useState(localStorage.getItem('work_view_mode') || 'table');

    useEffect(() => {
        const updateViewMode = () => {
            setViewMode(localStorage.getItem('work_view_mode') || 'table');
        };
        window.addEventListener('app-data-updated', updateViewMode);
        window.addEventListener('storage', updateViewMode);
        window.addEventListener('work-view-updated', updateViewMode);
        return () => { window.removeEventListener('app-data-updated', updateViewMode); window.removeEventListener('storage', updateViewMode); window.removeEventListener('work-view-updated', updateViewMode); }
    }, []);

    const filteredWorks = works.filter(w => {
        const matchName = !nameSearch || (w.name || '').toLowerCase().includes(nameSearch.toLowerCase());
        const matchDate = !dateSearch || (w.date || '').includes(dateSearch);
        return matchName && matchDate;
    });
    const hasActiveFilters = Boolean(nameSearch || dateSearch);
    const emptyStateTitle = hasActiveFilters ? 'Nincs a szűrésnek megfelelő munka' : 'Nincsenek rögzített munkák';
    const emptyStateGuidance = hasActiveFilters
        ? 'Módosítsa vagy törölje a szűrési feltételeket!'
        : 'Kattintson az "Új munka felvitele" gombra új tétel rögzítéséhez!';

    const handleRowClick = (id) => {
        if (window.app?.workLogRenderer?.openModal) {
            window.app.workLogRenderer.openModal(id);
        }
    };

    const handleEditClick = (e, id) => {
        e.stopPropagation();
        e.preventDefault();
        handleRowClick(id);
    };

    return (
        <div ref={listRef}>
            {/* KPI summary for work */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" id="workKpis">
                <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fas fa-clock text-amber-500"></i> Folyamatban lévő munkák
                    </p>
                    <p id="workKpiActive" className="text-2xl font-bold text-gray-800 mt-1">{active} db</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fas fa-check-circle text-emerald-500"></i> Elvégzett munkák
                    </p>
                    <p id="workKpiDone" className="text-2xl font-bold text-emerald-600 mt-1">{done} db</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fas fa-times-circle text-rose-500"></i> Meghiúsult munkák
                    </p>
                    <p id="workKpiFailed" className="text-2xl font-bold text-rose-600 mt-1">{failed} db</p>
                </div>
            </div>

            {/* Work Table Container */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 mb-6 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                    <label htmlFor="workNameSearch" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Keresés név alapján</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i className="fas fa-search text-gray-400"></i>
                        </div>
                        <input type="text" id="workNameSearch" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="Munka neve..." className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
                    </div>
                </div>
                <div className="flex-1">
                    <label htmlFor="workDateSearch" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Keresés dátum alapján</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i className="fas fa-calendar text-gray-400"></i>
                        </div>
                        <input type="date" id="workDateSearch" value={dateSearch} onChange={(e) => setDateSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
                    </div>
                </div>
                {(nameSearch || dateSearch) && (
                    <div className="flex items-end">
                        <button type="button" onClick={() => { setNameSearch(''); setDateSearch(''); }} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition h-[38px] flex items-center justify-center">
                            Szűrés törlése
                        </button>
                    </div>
                )}
            </div>

            {/* Works Listing */}
            {viewMode === 'card' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {filteredWorks.length === 0 ? (
                        <div className="col-span-full p-12 bg-white rounded-3xl shadow-xl border border-gray-100 text-center text-gray-400 italic">
                            <div className="flex flex-col items-center gap-2">
                                <i className="fas fa-briefcase text-4xl text-gray-200 animate-pulse"></i>
                                <span className="text-sm font-semibold text-gray-500">{emptyStateTitle}</span>
                                <span className="text-xs">{emptyStateGuidance}</span>
                            </div>
                        </div>
                    ) : (
                        filteredWorks.map((work) => {
                            let statusBadge = null;
                            let cardClass = 'bg-white';

                            switch (work.status) {
                                case 'elvégzett':
                                    statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 Elvégzett</span>;
                                    cardClass = 'bg-emerald-50/40 hover:bg-emerald-100/50 border-emerald-100 text-emerald-950';
                                    break;
                                case 'folyamatban':
                                    statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">🟡 Folyamatban</span>;
                                    cardClass = 'bg-amber-50/40 hover:bg-amber-100/50 border-amber-100 text-amber-950';
                                    break;
                                case 'meghiúsult':
                                    statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">🔴 Meghiúsult</span>;
                                    cardClass = 'bg-rose-50/40 hover:bg-rose-100/50 border-rose-100 text-rose-950';
                                    break;
                                default:
                                    statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">⚪ Ismeretlen</span>;
                                    cardClass = 'bg-white hover:bg-gray-50 border-gray-100 text-gray-900';
                            }

                            const cleanDescription = (work.description || '').replace(/\n/g, ' ');
                            const truncatedDesc = cleanDescription.length > 100 ? cleanDescription.substring(0, 97) + '...' : cleanDescription;

                            // Handlers for touch
                            let pressTimer = null;
                            const handleTouchStart = () => {
                                pressTimer = setTimeout(() => {
                                    handleRowClick(work.id);
                                }, 600);
                            };
                            const handleTouchEndOrMove = () => {
                                if (pressTimer) clearTimeout(pressTimer);
                            };

                            return (
                                <div
                                    key={work.id}
                                    className={`${cardClass} p-5 rounded-3xl shadow-sm border transition-colors cursor-pointer flex flex-col gap-3`}
                                    onDoubleClick={() => handleRowClick(work.id)}
                                    onTouchStart={handleTouchStart}
                                    onTouchEnd={handleTouchEndOrMove}
                                    onTouchMove={handleTouchEndOrMove}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <h3 className="font-bold text-lg leading-tight">{work.name || ''}</h3>
                                        <button type="button" className="text-gray-400 hover:text-emerald-600 p-2 rounded-lg hover:bg-white/80 transition-colors shrink-0" onClick={(e) => handleEditClick(e, work.id)}>
                                            <i className="fas fa-edit"></i>
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 font-medium" title={work.description || ''}>{truncatedDesc || 'Nincs leírás'}</p>
                                    <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-black/5">
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">Hol</p>
                                            <p className="text-sm font-semibold">{work.location || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">Mikor</p>
                                            <p className="text-sm font-bold font-mono">{work.date || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">Hány nap</p>
                                            <p className="text-sm font-bold font-mono">{work.duration || 1} nap</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">Státusz</p>
                                            <div>{statusBadge}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse" id="workTable">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider w-16 text-center">
                                        Sorszám</th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider">Munka neve</th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider">Leírás</th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider">Hol</th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider text-center">Mikor
                                    </th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider text-center">Hány
                                        nap</th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider text-center w-36">
                                        Státusz</th>
                                    <th className="p-4 font-bold text-gray-600 text-xs uppercase tracking-wider text-center w-20">
                                        Művelet</th>
                                </tr>
                            </thead>
                            <tbody id="workTableBody" className="divide-y divide-gray-100">
                                {filteredWorks.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="p-12 text-center text-gray-400 italic">
                                            <div className="flex flex-col items-center gap-2">
                                                <i className="fas fa-briefcase text-4xl text-gray-200 animate-pulse"></i>
                                                <span className="text-sm font-semibold text-gray-500">{emptyStateTitle}</span>
                                                <span className="text-xs">{emptyStateGuidance}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredWorks.map((work, index) => {
                                        let statusBadge = null;
                                        let rowClass = '';

                                        switch (work.status) {
                                            case 'elvégzett':
                                                statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 Elvégzett</span>;
                                                rowClass = 'bg-emerald-50/40 hover:bg-emerald-100/50 text-emerald-950';
                                                break;
                                            case 'folyamatban':
                                                statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">🟡 Folyamatban</span>;
                                                rowClass = 'bg-amber-50/40 hover:bg-amber-100/50 text-amber-950';
                                                break;
                                            case 'meghiúsult':
                                                statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">🔴 Meghiúsult</span>;
                                                rowClass = 'bg-rose-50/40 hover:bg-rose-100/50 text-rose-950';
                                                break;
                                            default:
                                                statusBadge = <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">⚪ Ismeretlen</span>;
                                                rowClass = 'hover:bg-gray-50 text-gray-900';
                                        }

                                        const cleanDescription = (work.description || '').replace(/\n/g, ' ');
                                        const truncatedDesc = cleanDescription.length > 50 ? cleanDescription.substring(0, 47) + '...' : cleanDescription;

                                        // Handlers for touch
                                        let pressTimer = null;
                                        const handleTouchStart = () => {
                                            pressTimer = setTimeout(() => {
                                                handleRowClick(work.id);
                                            }, 600);
                                        };
                                        const handleTouchEndOrMove = () => {
                                            if (pressTimer) clearTimeout(pressTimer);
                                        };

                                        return (
                                            <tr
                                                key={work.id}
                                                className={`${rowClass} cursor-pointer select-none transition-colors border-b border-gray-100`}
                                                data-id={work.id}
                                                onDoubleClick={() => handleRowClick(work.id)}
                                                onTouchStart={handleTouchStart}
                                                onTouchEnd={handleTouchEndOrMove}
                                                onTouchMove={handleTouchEndOrMove}
                                            >
                                                <td className="p-4 text-center font-bold font-mono text-xs text-gray-500">{index + 1}</td>
                                                <td className="p-4 font-bold text-sm">{work.name || ''}</td>
                                                <td className="p-4 text-xs text-gray-500 font-medium" title={work.description || ''}>{truncatedDesc || '-'}</td>
                                                <td className="p-4 text-xs font-semibold text-gray-600">{work.location || '-'}</td>
                                                <td className="p-4 text-xs text-center font-bold text-gray-500 font-mono">{work.date || '-'}</td>
                                                <td className="p-4 text-xs text-center font-bold text-gray-700 font-mono">{work.duration || 1} nap</td>
                                                <td className="p-4 text-center">{statusBadge}</td>
                                                <td className="p-4 text-center">
                                                    <button type="button" className="btn-edit-work text-gray-400 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-white/50 transition-colors" data-id={work.id} title="Szerkesztés" onClick={(e) => handleEditClick(e, work.id)}>
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 bg-gray-50 text-[11px] text-gray-400 flex items-center gap-1.5 border-t border-gray-100">
                        <i className="fas fa-info-circle text-emerald-500"></i>
                        <span>Tipp: Egy sorra való hosszú nyomással (mobil) vagy dupla kattintással (asztali) is megnyitható a
                            teljes bejegyzés szerkesztése!</span>
                    </div>
                </div>
            )}
        </div>
    );
}
