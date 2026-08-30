import React, { useEffect, useState, useRef } from 'react';

export default function ChartsTab() {
    const [stats, setStats] = useState(null);
    const [filterMonth, setFilterMonth] = useState('all');

    const barRef = useRef(null);
    const doughnutRef = useRef(null);
    const currencyRef = useRef(null);
    const incomingRef = useRef(null);

    const odoRef = useRef(null);
    const consRef = useRef(null);
    const priceRef = useRef(null);

    const instancesRef = useRef({
        bar: null,
        doughnut: null,
        currency: null,
        incomingTrend: null,
        fuelOdo: null,
        fuelCons: null,
        fuelPrice: null
    });

    useEffect(() => {
        const loadData = () => {
            if (!window.app || typeof window.app.getAppSnapshot !== 'function') {
                return;
            }

            const snapshot = window.app.getAppSnapshot();
            const entries = snapshot.entries.filter(e => !e.isStorno);
            const items = snapshot.items;
            const incomings = snapshot.incomings.filter(e => !e.isStorno);
            const eurRate = snapshot.eurRate || 400;
            const months = snapshot.months;

            // Fuel mod
            let fuelLogs = [];
            let fuelEnabled = false;
            if (window.app.moduleManager && typeof window.app.moduleManager.modules?.get === 'function') {
                const fuelMod = window.app.moduleManager.modules.get('plugin_fuel_log') || window.app.moduleManager.modules.get('plugin_fuel');
                if (fuelMod && fuelMod.enabled !== false) fuelEnabled = true;
                if (!fuelMod) fuelEnabled = true; // ha nincs modul, feltételezzük, hogy lehetnek adatok
            } else {
                fuelEnabled = true;
            }

            if (fuelEnabled) {
                const raw = localStorage.getItem('plugin_fuel_logs');
                if (raw) {
                    try { fuelLogs = JSON.parse(raw); } catch(e){}
                }
            }

            setStats({
                entries,
                items,
                incomings,
                eurRate,
                months,
                fuelLogs
            });
        };

        const handleAppUpdate = () => {
            loadData();
        };

        if (window.app && window.app.isBooted) {
             loadData();
        }

        if (window.app && typeof window.app.subscribeAppData === 'function') {
            return window.app.subscribeAppData(handleAppUpdate);
        } else {
            window.addEventListener('app-data-updated', handleAppUpdate);
            return () => window.removeEventListener('app-data-updated', handleAppUpdate);
        }
    }, []);

    useEffect(() => {
        // Render charts
        if (!stats) return;
        if (!window.Chart) return;

        const destroyOld = () => {
            Object.keys(instancesRef.current).forEach(k => {
                if (instancesRef.current[k]) {
                    instancesRef.current[k].destroy();
                    instancesRef.current[k] = null;
                }
            });
        };

        destroyOld();

        const { entries, items, incomings, eurRate, fuelLogs } = stats;

        const filteredEntries = filterMonth === 'all'
            ? entries
            : entries.filter(e => e.cellKey && e.cellKey.endsWith(`_${filterMonth}`));

        const filteredIncomings = filterMonth === 'all'
            ? incomings
            : incomings.filter(e => e.date && e.date.startsWith(filterMonth));

        let filteredFuelLogs = fuelLogs;
        if (filterMonth !== 'all' && Array.isArray(fuelLogs)) {
            filteredFuelLogs = fuelLogs.filter(l => {
                const ts = Number(l.timestamp);
                if (ts && !isNaN(ts)) {
                    try {
                        const d = new Date(ts);
                        const yyyyMm = d.toISOString().slice(0, 7);
                        return yyyyMm === filterMonth;
                    } catch (e) {}
                }
                if (l.date && typeof l.date === 'string') {
                    const normDate = l.date.replace(/\s+/g, '').replace(/\./g, '-');
                    return normDate.includes(filterMonth);
                }
                return true;
            });
        }

        // 1. Bar chart
        if (barRef.current && items.length > 0) {
            const ctx = barRef.current.getContext('2d');
            const itemMap = {};
            items.forEach(it => itemMap[it.id] = { name: it.name, total: 0 });

            filteredEntries.forEach(e => {
                const itemId = e.cellKey?.split('_')[0];
                if (itemMap[itemId]) {
                    const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                    itemMap[itemId].total += amount;
                }
            });

            const labels = Object.values(itemMap).map(i => i.name);
            const data = Object.values(itemMap).map(i => i.total);

            instancesRef.current.bar = new window.Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Kiadások (Ft)',
                        data: data,
                        backgroundColor: 'rgba(59, 130, 246, 0.85)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // 2. Doughnut chart
        if (doughnutRef.current) {
            const ctx = doughnutRef.current.getContext('2d');
            let cash = 0, card = 0, transfer = 0;
            filteredEntries.forEach(e => {
                const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                if (e.paymentMethod === 'Kártya') card += amount;
                else if (e.paymentMethod === 'Utalás') transfer += amount;
                else cash += amount;
            });

            instancesRef.current.doughnut = new window.Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Készpénz', 'Kártya', 'Utalás'],
                    datasets: [{
                        data: [cash, card, transfer],
                        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } }
                }
            });
        }

        // 3. Currency chart
        if (currencyRef.current) {
            const ctx = currencyRef.current.getContext('2d');
            let huf = 0, eur = 0;
            filteredEntries.forEach(e => {
                const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                if (e.currency === 'EUR') eur += amount;
                else huf += amount;
            });

            instancesRef.current.currency = new window.Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['HUF', 'EUR (HUF érték)'],
                    datasets: [{
                        data: [huf, eur],
                        backgroundColor: ['#6366f1', '#ec4899'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } }
                }
            });
        }

        // 4. Incoming Trend
        if (incomingRef.current) {
            const ctx = incomingRef.current.getContext('2d');
            const dateTotals = {};
            filteredIncomings.forEach(e => {
                const date = e.date || 'ismeretlen';
                if (!dateTotals[date]) dateTotals[date] = 0;
                dateTotals[date] += e.amount || 0;
            });

            const sortedDates = Object.keys(dateTotals).sort();
            const labels = sortedDates.map(d => {
                if (d === 'ismeretlen') return d;
                const parts = d.split('-');
                if (parts.length >= 3) return `${parts[2]}.${parts[1]}`;
                return d;
            });
            const data = sortedDates.map(d => dateTotals[d]);

            if (data.length === 0) {
                ctx.clearRect(0, 0, incomingRef.current.width, incomingRef.current.height);
                ctx.fillStyle = '#9ca3af';
                ctx.font = '14px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText('Nincs bejövő utalás', incomingRef.current.width/2, incomingRef.current.height/2);
            } else {
                instancesRef.current.incomingTrend = new window.Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Bejövő utalások (Ft)',
                            data: data,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#10b981',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true, position: 'top', labels: { font: { size: 11 } } },
                            tooltip: { callbacks: { label: (ctx) => ctx.parsed.y.toLocaleString('hu-HU') + ' Ft' } }
                        },
                        scales: { y: { beginAtZero: true, ticks: { callback: (value) => (value / 1000).toFixed(0) + 'k' } } }
                    }
                });
            }
        }

        // 5. Fuel charts
        if (Array.isArray(filteredFuelLogs) && filteredFuelLogs.length > 0) {
            const logs = [...filteredFuelLogs].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

            // Odo
            const validOdos = logs.filter(l => l.odo > 0);
            if (odoRef.current && validOdos.length > 0) {
                const ctx = odoRef.current.getContext('2d');
                const labels = validOdos.map(l => (l.date || '').split(' ')[0]);
                const data = validOdos.map(l => l.odo);
                instancesRef.current.fuelOdo = new window.Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Km állás (km)',
                            data,
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                            pointBackgroundColor: '#3b82f6'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toLocaleString('hu-HU')} km` } } }
                    }
                });
            }

            // Cons
            if (consRef.current) {
                const ctx = consRef.current.getContext('2d');
                const consLabels = [];
                const consData = [];
                if (validOdos.length >= 2) {
                    for (let i = 1; i < validOdos.length; i++) {
                        const prev = validOdos[i - 1];
                        const curr = validOdos[i];
                        const dist = curr.odo - prev.odo;
                        if (dist > 0 && curr.liters > 0) {
                            const avg = Math.round((curr.liters * 100 / dist) * 10) / 10;
                            consLabels.push((curr.date || '').split(' ')[0]);
                            consData.push(avg);
                        }
                    }
                }

                if (consData.length > 0) {
                    instancesRef.current.fuelCons = new window.Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: consLabels,
                            datasets: [{
                                label: 'Átlagfogyasztás (l/100km)',
                                data: consData,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                fill: true,
                                tension: 0.3,
                                pointRadius: 4,
                                pointBackgroundColor: '#10b981'
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} l/100km` } } }
                        }
                    });
                } else {
                    ctx.clearRect(0, 0, consRef.current.width, consRef.current.height);
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = '12px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText('Legalább 2 tankolási rekord szükséges', consRef.current.width / 2, consRef.current.height / 2);
                }
            }

            // Price
            const validPrices = logs.filter(l => l.price > 0);
            if (priceRef.current && validPrices.length > 0) {
                const ctx = priceRef.current.getContext('2d');
                const labels = validPrices.map(l => (l.date || '').split(' ')[0]);
                const data = validPrices.map(l => l.price);
                instancesRef.current.fuelPrice = new window.Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Üzemanyagár (Ft/l)',
                            data,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                            pointBackgroundColor: '#f59e0b'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toLocaleString('hu-HU')} Ft/l` } } }
                    }
                });
            }
        }

        return () => {
             destroyOld();
        };

    }, [stats, filterMonth]);

    if (!stats) return <div className="p-4 text-gray-500">Adatok betöltése...</div>;

    const showFuelCharts = Array.isArray(stats.fuelLogs) && stats.fuelLogs.length > 0;

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 md:col-span-2">
                    <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fas fa-chart-column text-blue-500"></i> Kiadások tételenként (Ft)
                    </h3>
                    <div className="relative h-[300px]">
                        <canvas ref={barRef} id="barChart"></canvas>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                    <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fas fa-chart-pie text-purple-500"></i> Fizetési módok aránya
                    </h3>
                    <div className="relative h-[250px] flex justify-center">
                        <canvas ref={doughnutRef} id="doughnutChart"></canvas>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                    <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fas fa-wallet text-emerald-500"></i> Valuta szerinti megoszlás
                    </h3>
                    <div className="relative h-[250px] flex justify-center">
                        <canvas ref={currencyRef} id="currencyChart"></canvas>
                    </div>
                </div>
            </div>

            {/* ===== ÚJ: BEJÖVŐ UTALÁSOK TREND ===== */}
            <div className="mt-6 grid grid-cols-1 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                    <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fas fa-arrow-down text-emerald-500"></i> Bejövő utalások trendje
                    </h3>
                    <div className="relative h-[250px]">
                        <canvas ref={incomingRef} id="incomingTrendChart"></canvas>
                    </div>
                </div>
            </div>

            {/* ===== ÚJ: TANKOLÁSI MODUL GRAFIKONOK ===== */}
            {showFuelCharts && (
                <div id="fuelChartsSection" className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-tachometer-alt text-blue-500"></i> Km-óra állás alakulása
                        </h3>
                        <div className="relative h-[220px]">
                            <canvas ref={odoRef} id="fuelOdoChart"></canvas>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-gas-pump text-emerald-500"></i> Átlagfogyasztás (l/100km)
                        </h3>
                        <div className="relative h-[220px]">
                            <canvas ref={consRef} id="fuelConsumptionChart"></canvas>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-tags text-amber-500"></i> Üzemanyagár (Ft/l)
                        </h3>
                        <div className="relative h-[220px]">
                            <canvas ref={priceRef} id="fuelPriceChart"></canvas>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-4 flex justify-end">
                <select id="monthFilter"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-2xl shadow-sm text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="all">Összes hónap</option>
                    {stats.months.map(m => {
                        const mid = m.id || m;
                        return (
                            <option key={mid} value={mid}>{m.name || mid}</option>
                        );
                    })}
                </select>
            </div>
        </div>
    );
}
