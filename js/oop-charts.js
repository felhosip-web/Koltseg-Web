// js/oop-charts.js - Optimalizált ChartsRenderer
export class ChartsRenderer {
    constructor(app) {
        this.app = app;
        this.instances = { 
            bar: null, 
            doughnut: null, 
            currency: null,
            incomingTrend: null  // ← ÚJ
        };
        this.lastFilter = null;
    }

renderAll(filterMonth = 'all') {
    this.lastFilter = filterMonth;

    const entries = (this.app.entries.entries || []).filter(e => !e.isStorno);
    const items = this.app.items.items || [];
    const incomings = (this.app.incomingManager?.incomings || []).filter(e => !e.isStorno);
    const eurRate = this.app.config?.eurRate || 400;

    const filteredEntries = filterMonth === 'all' 
        ? entries 
        : entries.filter(e => e.cellKey && e.cellKey.endsWith(`_${filterMonth}`));

    const filteredIncomings = filterMonth === 'all'
        ? incomings
        : incomings.filter(e => e.date && e.date.startsWith(filterMonth));

    this._destroyOldCharts();

    this._drawBarChart(items, filteredEntries, eurRate);
    this._drawDoughnutChart(filteredEntries, eurRate);
    this._drawCurrencyChart(filteredEntries);
    
    // Csak akkor hívjuk, ha létezik a metódus
    if (typeof this._drawIncomingTrendChart === 'function') {
        this._drawIncomingTrendChart(filteredIncomings);
    }

    console.log(`[Charts] Renderelve ${filteredEntries.length} tranzakcióval, ${filteredIncomings.length} bejövővel`);
}

    _destroyOldCharts() {
        Object.keys(this.instances).forEach(key => {
            if (this.instances[key]) {
                this.instances[key].destroy();
                this.instances[key] = null;
            }
        });
    }

    destroy() {
        this._destroyOldCharts();
        this.lastFilter = null;
        console.log('[ChartsRenderer] Teljesen takarítva');
    }

    _drawBarChart(items, entries, eurRate) {
        const ctx = document.getElementById('barChart')?.getContext('2d');
        if (!ctx) return;

        const itemMap = {};
        items.forEach(it => itemMap[it.id] = { name: it.name, total: 0 });

        entries.forEach(e => {
            const itemId = e.cellKey?.split('_')[0];
            if (itemMap[itemId]) {
                const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                itemMap[itemId].total += amount;
            }
        });

        const labels = Object.values(itemMap).map(i => i.name);
        const data = Object.values(itemMap).map(i => i.total);

        this.instances.bar = new Chart(ctx, {
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

    _drawDoughnutChart(entries, eurRate) {
        const ctx = document.getElementById('doughnutChart')?.getContext('2d');
        if (!ctx) return;

        let cash = 0, card = 0, transfer = 0;
        entries.forEach(e => {
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            if (e.paymentMethod === 'Kártya') card += amount;
            else if (e.paymentMethod === 'Utalás') transfer += amount;
            else cash += amount;
        });

        this.instances.doughnut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Készpénz', 'Kártya', 'Utalás'],
                datasets: [{
                    data: [cash, card, transfer],
                    backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    _drawCurrencyChart(entries) {
        const ctx = document.getElementById('currencyChart')?.getContext('2d');
        if (!ctx) return;

        let totalHuf = 0, totalEur = 0;
        entries.forEach(e => {
            if (e.currency === 'EUR') totalEur += e.amount;
            else totalHuf += e.amount;
        });

        const eurRate = this.app.config?.eurRate || 400;
        const convertedHuf = Math.round(totalEur * eurRate);

        this.instances.currency = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [
                    `HUF (${totalHuf.toLocaleString('hu-HU')} Ft)`,
                    `EUR (${totalEur.toLocaleString('hu-HU')} EUR / ~${convertedHuf.toLocaleString('hu-HU')} Ft)`
                ],
                datasets: [{
                    data: [totalHuf, convertedHuf],
                    backgroundColor: ['#3b82f6', '#f59e0b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const index = context.dataIndex;
                                if (index === 0) {
                                    return ` HUF: ${totalHuf.toLocaleString('hu-HU')} Ft`;
                                } else {
                                    return ` EUR: ${totalEur.toLocaleString('hu-HU')} EUR (${convertedHuf.toLocaleString('hu-HU')} Ft)`;
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    
    // ===== ÚJ: BEJÖVŐ UTALÁSOK TREND CHART =====
    _drawIncomingTrendChart(incomings) {
        const ctx = document.getElementById('incomingTrendChart')?.getContext('2d');
        if (!ctx) return;

        // Összesítés dátumonként
        const dateTotals = {};
        incomings.forEach(e => {
            const date = e.date || 'ismeretlen';
            if (!dateTotals[date]) dateTotals[date] = 0;
            dateTotals[date] += e.amount || 0;
        });

        const sortedDates = Object.keys(dateTotals).sort();
        const labels = sortedDates.map(d => {
            const parts = d.split('-');
            return `${parts[2]}.${parts[1]}`;
        });
        const data = sortedDates.map(d => dateTotals[d]);

        if (data.length === 0) {
            // Üres állapot
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Nincs bejövő utalás', ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        this.instances.incomingTrend = new Chart(ctx, {
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
                    legend: { 
                        display: true,
                        position: 'top',
                        labels: { font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.parsed.y.toLocaleString('hu-HU') + ' Ft'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => (value / 1000).toFixed(0) + 'k'
                        }
                    }
                }
            }
        });
    }

    populateFilter(months) {
        const filter = document.getElementById('monthFilter');
        if (!filter) return;
        
        filter.innerHTML = '<option value="all">Összes hónap</option>';
        months.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            filter.appendChild(opt);
        });
    }
}