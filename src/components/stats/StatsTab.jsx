import React, { useEffect, useState } from 'react';

/**
 * Statistics tab component displaying detailed financial analytics.
 * Shows expense breakdowns by payment method, income statistics, category counts,
 * balance information, and table completion percentage with drill-down details.
 * @returns {JSX.Element} The statistics view component
 */
export default function StatsTab() {
    const [stats, setStats] = useState(null);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const loadData = () => {
            if (!window.app || !window.app.entries || !window.app.items || !window.app.months) {
                return;
            }

            const app = window.app;
            const entries = (app.entries.entries || []).filter(e => !e.isStorno);
            const items = app.items.items || [];
            const months = app.months.months || [];
            const incomings = (app.incomingManager?.incomings || []).filter(e => !e.isStorno);
            const eurRate = app.config.eurRate || 400;

            // === KIADÁS STATISZTIKA ===
            let total = 0, card = 0, cash = 0, transfer = 0;
            entries.forEach(e => {
                const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                total += amount;
                if (e.paymentMethod === 'Kártya') card += amount;
                else if (e.paymentMethod === 'Utalás') transfer += amount;
                else cash += amount;
            });

            // === BEJÖVŐ STATISZTIKA ===
            let incomingTotal = 0;
            let incomingBySender = {};
            incomings.forEach(e => {
                const amount = e.amount || 0;
                incomingTotal += amount;
                if (!incomingBySender[e.sender]) incomingBySender[e.sender] = 0;
                incomingBySender[e.sender] += amount;
            });

            const topSenders = Object.entries(incomingBySender)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            const topSender = topSenders[0] ? `${topSenders[0][0]} (${topSenders[0][1].toLocaleString('hu-HU')} Ft)` : '-';

            const balance = incomingTotal - total;

            // === KITÖLTÖTTSÉG ===
            const totalCells = items.length * months.length;
            const entryBaseKeys = new Set();
            entries.forEach(e => {
                let itemId, month;
                if (e.cellKey) {
                    // Fallback to manual split if import parseCellKey is tricky
                    const parts = e.cellKey.split('_');
                    if (parts.length >= 2) {
                        itemId = parts[0];
                        month = parts[1];
                    }
                }
                if (itemId && month) {
                    entryBaseKeys.add(`${itemId}_${month}`);
                }
            });

            let filledCells = 0;
            items.forEach(item => {
                months.forEach(month => {
                    const baseKey = `${item.id}_${month}`;
                    if (entryBaseKeys.has(baseKey)) {
                        filledCells++;
                    }
                });
            });

            const fillPercent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
            const emptyCells = Math.max(0, totalCells - filledCells);
            const avgEntries = filledCells > 0 ? (entries.length / filledCells).toFixed(1) : '0';

            setStats({
                total,
                card,
                cash,
                transfer,
                itemsCount: items.length,
                monthsCount: months.length,
                entriesCount: entries.length,
                incomingTotal,
                incomingCount: incomings.length,
                topSender,
                balance,
                totalCells,
                filledCells,
                fillPercent: Math.min(fillPercent, 100),
                emptyCells,
                avgEntries
            });
        };

        const handleUpdate = () => {
            loadData();
        };

        if (window.app && window.app.isBooted) {
             loadData();
        }

        window.addEventListener('app-data-updated', handleUpdate);
        return () => window.removeEventListener('app-data-updated', handleUpdate);
    }, []);

    if (!stats) return <div className="p-4 text-gray-500">Adatok betöltése...</div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Összes kiadás</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{stats.total.toLocaleString('hu-HU')} Ft</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Kártya</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{stats.card.toLocaleString('hu-HU')} Ft</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Készpénz</p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.cash.toLocaleString('hu-HU')} Ft</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Utalás</p>
                    <p className="text-3xl font-bold text-amber-600 mt-2">{stats.transfer.toLocaleString('hu-HU')} Ft</p>
                </div>
            </div>

            {/* ===== BEJÖVŐ STATISZTIKA (ÚJ SOR) ===== */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                        <i className="fas fa-arrow-down text-emerald-500"></i> Összes bejövő
                    </p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.incomingTotal.toLocaleString('hu-HU')} Ft</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                        <i className="fas fa-user text-emerald-500"></i> Legtöbb utaló
                    </p>
                    <p className="text-xl font-bold text-gray-800 mt-2 truncate" title={stats.topSender}>{stats.topSender}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                        <i className="fas fa-receipt text-emerald-500"></i> Bejövő tételek
                    </p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{stats.incomingCount}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                        <i className="fas fa-scale-balanced text-blue-500"></i> Egyenleg
                    </p>
                    <p className={`text-2xl font-bold mt-2 ${stats.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {stats.balance.toLocaleString('hu-HU')} Ft
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Kategóriák száma</p>
                    <p className="text-3xl font-bold text-indigo-600 mt-2">{stats.itemsCount}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Hónapok száma</p>
                    <p className="text-3xl font-bold text-purple-600 mt-2">{stats.monthsCount}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow border border-gray-100">
                    <p className="text-gray-500 text-sm">Bejegyzések száma</p>
                    <p className="text-3xl font-bold text-rose-600 mt-2">{stats.entriesCount}</p>
                </div>
            </div>

            <div className="mt-6 bg-white p-6 rounded-3xl shadow border border-gray-100 relative">
                <div className="flex justify-between items-center">
                    <p className="text-gray-500 text-sm flex items-center gap-1.5">
                        <i className="fas fa-grip text-indigo-500"></i> Táblázat kitöltöttsége
                    </p>
                    {/* Részletek gomb */}
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="text-gray-400 hover:text-indigo-600 transition p-1.5 rounded-full hover:bg-gray-50 flex items-center justify-center"
                        title="Részletes kitöltöttségi mutatók">
                        <i className="fas fa-info-circle text-base"></i>
                    </button>
                </div>
                <div className="flex items-center gap-4 mt-3">
                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden border border-gray-100">
                        <div
                            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-4 rounded-full transition-all duration-500 shadow-sm"
                            style={{width: `${stats.fillPercent}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-gray-800">{stats.fillPercent}%</span>
                </div>

                {/* Részletek Buborék / Popover */}
                {showDetails && (
                    <div className="absolute right-6 top-16 bg-white border border-gray-100 rounded-2xl shadow-2xl p-5 min-w-[300px] z-50 text-xs text-gray-600 leading-relaxed transition-all">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-3">
                            <span className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                                <i className="fas fa-chart-bar text-indigo-500"></i> Kitöltési részletek
                            </span>
                            <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">Aktív (kitöltött) cellák:</span>
                                <span className="font-bold text-gray-800">{stats.filledCells} / {stats.totalCells} cella ({stats.fillPercent}%)</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">Üres cellák száma:</span>
                                <span className="font-bold text-gray-800">{stats.emptyCells} cella</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">Összes rögzített tétel:</span>
                                <span className="font-bold text-gray-800">{stats.entriesCount} db</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                <span className="text-gray-500">Átlagos tételszám:</span>
                                <span className="font-bold text-blue-600">{stats.avgEntries} db / aktív cella</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
