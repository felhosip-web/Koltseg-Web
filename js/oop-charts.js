// js/oop-charts.js - Charts Renderer (csak renderelés, nincs saját boot)
export class ChartsRenderer {
    constructor(app) {
        this.app = app;
        this.instances = { bar: null, doughnut: null, currency: null };
    }

    renderAll(filterMonth = 'all') {
        const entries = this.app.entries.entries;
        const items = this.app.items.items;
        const eurRate = this.app.config.eurRate || 400;

        const filteredEntries = filterMonth === 'all' 
            ? entries 
            : entries.filter(e => e.cellKey && e.cellKey.endsWith(filterMonth));

        // 1. Oszlopdiagram (tételek szerint)
        const itemMap = {};
        items.forEach(it => itemMap[it.id] = { name: it.name, total: 0 });
        filteredEntries.forEach(e => {
            const itemId = e.cellKey?.split('_')[0];
            if (itemMap[itemId]) {
                const amountInHuf = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                itemMap[itemId].total += amountInHuf;
            }
        });
        const barLabels = Object.values(itemMap).map(i => i.name);
        const barData = Object.values(itemMap).map(i => i.total);
        this._drawBarChart(barLabels, barData);

        // 2. Fizetési módok (doughnut)
        this._drawDoughnutChart(filteredEntries, eurRate);

        // 3. Valuta megoszlás
        this._drawCurrencyChart(filteredEntries);
    }

    _drawBarChart(labels, data) {
        const ctx = document.getElementById('barChart')?.getContext('2d');
        if (!ctx) return;
        if (this.instances.bar) this.instances.bar.destroy();
        if (data.every(v => v === 0)) {
            const parent = ctx.canvas.parentElement;
            parent.innerHTML = '<p class="text-gray-400 text-sm text-center">Nincs adat</p>';
            return;
        }
        this.instances.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Kiadások (Ft)',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderRadius: 12
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
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
        if (this.instances.doughnut) this.instances.doughnut.destroy();
        if (cash === 0 && card === 0 && transfer === 0) {
            const parent = ctx.canvas.parentElement;
            parent.innerHTML = '<p class="text-gray-400 text-sm text-center">Nincs adat</p>';
            return;
        }
        this.instances.doughnut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Készpénz', 'Kártya', 'Utalás'],
                datasets: [{ data: [cash, card, transfer], backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
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
        if (this.instances.currency) this.instances.currency.destroy();
        if (totalHuf === 0 && totalEur === 0) {
            const parent = ctx.canvas.parentElement;
            parent.innerHTML = '<p class="text-gray-400 text-sm text-center">Nincs deviza adat</p>';
            return;
        }
        this.instances.currency = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['HUF', 'EUR'],
                datasets: [{ data: [totalHuf, totalEur], backgroundColor: ['#3b82f6', '#f59e0b'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
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