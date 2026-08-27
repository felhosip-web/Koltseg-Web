import React, { useEffect, useRef } from 'react';

export default function WorkAppList() {
    const listRef = useRef(null);

    useEffect(() => {
        const renderList = () => {
            if (window.app?.workLogRenderer && typeof window.app.workLogRenderer.render === 'function') {
                window.app.workLogRenderer.render();
            }
        };

        if (window.app?.isBooted) {
             renderList();
        }

        if (window.app && typeof window.app.subscribeAppData === 'function') {
            return window.app.subscribeAppData(renderList);
        } else {
            window.addEventListener('app-data-updated', renderList);
            return () => window.removeEventListener('app-data-updated', renderList);
        }
    }, []);

    return (
        <div ref={listRef}>
            {/* KPI summary for work */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" id="workKpis">
                <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fas fa-clock text-amber-500"></i> Folyamatban lévő munkák
                    </p>
                    <p id="workKpiActive" className="text-2xl font-bold text-gray-800 mt-1">0 db</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fas fa-check-circle text-emerald-500"></i> Elvégzett munkák
                    </p>
                    <p id="workKpiDone" className="text-2xl font-bold text-emerald-600 mt-1">0 db</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fas fa-times-circle text-rose-500"></i> Meghiúsult munkák
                    </p>
                    <p id="workKpiFailed" className="text-2xl font-bold text-rose-600 mt-1">0 db</p>
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
                            {/* Works loaded here dynamically */}
                            <tr>
                                <td colSpan="8" className="p-12 text-center text-gray-400 italic">
                                    <div className="flex flex-col items-center gap-2">
                                        <i className="fas fa-briefcase text-4xl text-gray-200"></i>
                                        <span>Nincsenek rögzített munkák. Kattintson az "Új munka felvitele" gombra!</span>
                                    </div>
                                </td>
                            </tr>
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
