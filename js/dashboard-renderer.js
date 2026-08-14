export class DashboardRenderer {
    constructor(app) {
        this.app = app;
    }

    renderDashboard() {
        const entries = (this.app.entries.entries || []).filter(e => !e.isStorno);
        const items = this.app.items.items || [];
        const months = this.app.months.months || [];
        const incomings = (this.app.incomingManager?.incomings || []).filter(e => !e.isStorno);
        const eurRate = this.app.config.eurRate || 400;

        // === 1. KIADÁSOK ÖSSZESÍTÉSE ===
        let total = 0;
        let monthlyTotal = 0;
        let topCategory = { name: '-', amount: 0 };
        const categoryTotals = {};

        const now = dayjs();
        const currentMonth = now.format('YYYY-MM');

        entries.forEach(e => {
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            total += amount;

            const entryMonth = e.cellKey?.substring(0, 7);
            if (entryMonth === currentMonth) {
                monthlyTotal += amount;
            }

            const itemName = items.find(i => i.id === e.itemId)?.name || 'Ismeretlen';
            if (!categoryTotals[itemName]) categoryTotals[itemName] = 0;
            categoryTotals[itemName] += amount;
        });

        for (const [name, amount] of Object.entries(categoryTotals)) {
            if (amount > topCategory.amount) {
                topCategory = { name, amount };
            }
        }

        // === 2. BEJÖVŐ UTALÁSOK ÖSSZESÍTÉSE ===
        let incomingTotal = 0;
        let incomingMonthly = 0;
        let topSender = { name: '-', amount: 0 };
        const senderTotals = {};

        incomings.forEach(e => {
            const amount = e.amount || 0;
            incomingTotal += amount;

            const entryMonth = e.date?.substring(0, 7);
            if (entryMonth === currentMonth) {
                incomingMonthly += amount;
            }

            if (!senderTotals[e.sender]) senderTotals[e.sender] = 0;
            senderTotals[e.sender] += amount;
        });

        for (const [name, amount] of Object.entries(senderTotals)) {
            if (amount > topSender.amount) {
                topSender = { name, amount };
            }
        }

        // === 3. EGYENLEG ===
        const balance = incomingTotal - total;

        // === 4. NAPI ÁTLAG ===
        const daysInMonth = now.daysInMonth();
        const dailyAvg = daysInMonth > 0 ? Math.round(monthlyTotal / daysInMonth) : 0;

        // === 5. KÁRTYÁK FRISSÍTÉSE (KIADÁS) ===
        this._setElementText('dashTotal', total.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashMonthly', monthlyTotal.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashTopCategory', topCategory.name);
        this._setElementText('dashTopAmount', topCategory.amount.toLocaleString('hu-HU') + ' Ft');

        // === 6. KÁRTYÁK FRISSÍTÉSE (BEJÖVŐ) ===
        this._setElementText('dashIncomingTotal', incomingTotal.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashIncomingMonthly', incomingMonthly.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashTopSender', topSender.name);
        this._setElementText('dashTopSenderAmount', topSender.amount.toLocaleString('hu-HU') + ' Ft');

        // === 7. EGYENLEG KÁRTYA ===
        const balanceEl = document.getElementById('dashBalance');
        if (balanceEl) {
            balanceEl.textContent = balance.toLocaleString('hu-HU') + ' Ft';
            balanceEl.className = `text-2xl font-bold mt-1 ${balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`;
        }

        // === 8. NAPI ÁTLAG ===
        this._setElementText('dashDailyAvg', dailyAvg.toLocaleString('hu-HU') + ' Ft');

        // === 9. TREND SZÖVEG ===
        const monthlyAvg = this._calculateMonthlyAvg();
        const trendEl = document.getElementById('dashTotalTrend');
        if (trendEl && monthlyAvg > 0) {
            const diff = ((total - monthlyAvg * months.length) / (monthlyAvg * months.length) * 100);
            if (Math.abs(diff) > 1) {
                trendEl.textContent = `${diff > 0 ? '↗︎' : '↘︎'} ${Math.abs(diff).toFixed(1)}% az átlaghoz képest`;
                trendEl.className = `text-xs ${diff > 0 ? 'text-rose-500' : 'text-emerald-500'} mt-1`;
            } else {
                trendEl.textContent = '↔️ Az átlagos szinten';
                trendEl.className = 'text-xs text-gray-400 mt-1';
            }
        }

        // === 10. HAVI PROGRESS ===
        const progressEl = document.getElementById('dashMonthlyProgress');
        if (progressEl && monthlyAvg > 0) {
            const progress = Math.min(Math.round((monthlyTotal / monthlyAvg) * 100), 100);
            progressEl.textContent = `Havi átlag: ${progress}%`;
            progressEl.className = `text-xs ${progress > 80 ? 'text-amber-500' : progress > 60 ? 'text-blue-500' : 'text-gray-400'} mt-1`;
        }

        // === 11. HAVI TREND ===
        this._renderDashboardTrend();

        // === 12. TOP 5 LISTA ===
        this._renderDashboardTop5(categoryTotals);

        // === 13. ÉRTESÍTÉSEK ===
        this._renderDashboardNotifications();

        // === 14. GYORS INFORMÁCIÓK ===
        this._setElementText('dashEurRate', eurRate.toLocaleString('hu-HU') + ' Ft');
        this._setElementText('dashEntryCount', entries.length.toString());
        this._setElementText('dashMonthCount', months.length.toString());
        this._setElementText('dashItemCount', items.length.toString());
    }

    _setElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    _calculateMonthlyAvg() {
        const entries = (this.app.entries.entries || []).filter(e => !e.isStorno);
        const eurRate = this.app.config.eurRate || 400;
        const monthlyData = {};

        entries.forEach(e => {
            const month = e.cellKey?.substring(0, 7);
            if (!month) return;
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            if (!monthlyData[month]) monthlyData[month] = 0;
            monthlyData[month] += amount;
        });

        const months = Object.keys(monthlyData);
        if (months.length === 0) return 0;
        const total = Object.values(monthlyData).reduce((a, b) => a + b, 0);
        return Math.round(total / months.length);
    }

    _renderDashboardTrend() {
        const canvas = document.getElementById('dashboardTrendChart');
        if (!canvas) return;

        if (this.app._dashboardChart) {
            this.app._dashboardChart.destroy();
            this.app._dashboardChart = null;
        }

        const entries = (this.app.entries.entries || []).filter(e => !e.isStorno);
        const eurRate = this.app.config.eurRate || 400;
        const monthlyData = {};

        entries.forEach(e => {
            const month = e.cellKey?.substring(0, 7);
            if (!month) return;
            const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            if (!monthlyData[month]) monthlyData[month] = 0;
            monthlyData[month] += amount;
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        const last6Months = sortedMonths.slice(-6);
        const labels = last6Months.map(m => {
            const [year, month] = m.split('-');
            return `${month}.${year.slice(2)}`;
        });
        const data = last6Months.map(m => monthlyData[m] || 0);

        if (data.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Nincs elég adat a trend megjelenítéséhez', canvas.width / 2, canvas.height / 2);
            return;
        }

        const ctx = canvas.getContext('2d');
        this.app._dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Havi kiadás (Ft)',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
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
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    _renderDashboardTop5(categoryTotals) {
        const container = document.getElementById('dashTop5List');
        if (!container) return;

        const sorted = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Nincs elég adat</div>';
            return;
        }

        const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
        const icons = ['🏠', '🛒', '💡', '📱', '🚗'];

        container.innerHTML = sorted.map(([name, amount], index) => `
            <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-lg flex-shrink-0">${icons[index] || '📌'}</span>
                    <span class="text-sm font-medium text-gray-700 truncate">${name}</span>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                    <span class="text-sm font-bold text-gray-800">${amount.toLocaleString('hu-HU')} Ft</span>
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${colors[index]}"></span>
                </div>
            </div>
        `).join('');
    }

    _renderDashboardNotifications() {
        const container = document.getElementById('dashNotifications');
        if (!container) return;

        const notifications = [];
        const reminders = this.app.reminderManager.reminders || [];
        const now = dayjs();

        // 1. Lejárt határidők
        const overdue = reminders.filter(r => dayjs(r.due_date).isBefore(now, 'day'));
        if (overdue.length > 0) {
            notifications.push({
                type: 'danger',
                icon: '⚠️',
                text: `${overdue.length} határidő lejárt!`
            });
        }

        // 2. Közelgő határidők (7 napon belül)
        const soon = reminders.filter(r => {
            const diff = dayjs(r.due_date).diff(now, 'day');
            return diff > 0 && diff <= 7;
        });
        if (soon.length > 0) {
            notifications.push({
                type: 'warning',
                icon: '⏰',
                text: `${soon.length} határidő közeledik (7 napon belül)`
            });
        }

        // 3. Havi kiadás figyelmeztetés
        const entries = (this.app.entries.entries || []).filter(e => !e.isStorno);
        const eurRate = this.app.config.eurRate || 400;
        const currentMonth = now.format('YYYY-MM');
        let monthlyTotal = 0;
        entries.forEach(e => {
            const month = e.cellKey?.substring(0, 7);
            if (month === currentMonth) {
                monthlyTotal += e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            }
        });

        const monthlyAvg = this._calculateMonthlyAvg();
        if (monthlyAvg > 0 && monthlyTotal > monthlyAvg * 1.3) {
            notifications.push({
                type: 'warning',
                icon: '📈',
                text: `Havi kiadás ${Math.round((monthlyTotal / monthlyAvg - 1) * 100)}%-kal magasabb az átlagnál`
            });
        }

        // 4. EUR árfolyam változás
        const savedRate = parseFloat(localStorage.getItem('last_eur_rate')) || eurRate;
        if (savedRate !== eurRate && savedRate > 0) {
            const change = ((eurRate - savedRate) / savedRate * 100);
            if (Math.abs(change) > 2) {
                notifications.push({
                    type: 'info',
                    icon: '💶',
                    text: `EUR árfolyam ${change > 0 ? '↗︎' : '↘︎'} ${Math.abs(change).toFixed(1)}% (${savedRate} → ${eurRate} Ft)`
                });
            }
            localStorage.setItem('last_eur_rate', eurRate);
        }

        // Megjelenítés
        if (notifications.length === 0) {
            container.innerHTML = `<div class="flex items-center gap-2 text-emerald-600 text-sm">
                <span>✅</span> Minden rendben
            </div>`;
        } else {
            container.innerHTML = notifications.map(n => `
                <div class="flex items-center gap-3 text-sm p-2 rounded-xl ${n.type === 'danger' ? 'bg-red-50 text-red-700' : n.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}">
                    <span>${n.icon}</span>
                    <span>${n.text}</span>
                </div>
            `).join('');
        }
    }
}
