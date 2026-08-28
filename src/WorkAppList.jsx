import React, { useEffect, useRef, useState } from 'react';

export default function WorkAppList() {
    const listRef = useRef(null);
    const [snapshot, setSnapshot] = useState(null);

    useEffect(() => {
        const handleDataUpdate = () => {
            if (window.app && typeof window.app.getAppSnapshot === 'function') {
                setSnapshot(window.app.getAppSnapshot());
            }
        };

        handleDataUpdate();

        let unsubscribe = null;
        if (window.app && typeof window.app.subscribeAppData === 'function') {
            unsubscribe = window.app.subscribeAppData(handleDataUpdate);
        } else {
            window.addEventListener('app-data-updated', handleDataUpdate);
            unsubscribe = () => window.removeEventListener('app-data-updated', handleDataUpdate);
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const works = snapshot?.works || [];

    // KPI Calculation
    const active = works.filter(w => w.status === 'folyamatban').length;
    const done = works.filter(w => w.status === 'elvégzett').length;
    const failed = works.filter(w => w.status === 'meghiúsult').length;

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
                            {works.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center text-gray-400 italic">
                                        <div className="flex flex-col items-center gap-2">
                                            <i className="fas fa-briefcase text-4xl text-gray-200 animate-pulse"></i>
                                            <span className="text-sm font-semibold text-gray-500">Nincsenek rögzített munkák</span>
                                            <span className="text-xs">Kattintson az "Új munka felvitele" gombra új tétel rögzítéséhez!</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                works.map((work, index) => {
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
        </div>
    );
}
