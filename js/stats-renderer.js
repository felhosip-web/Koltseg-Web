import { parseCellKey } from './utils/cell-key-utils.js';

export class StatsRenderer {
    constructor(app) {
        this.app = app;
    }

    renderStats() {
        const entries = (this.app.entries.entries || []).filter(e => !e.isStorno);
        const items = this.app.items.items || [];
        const months = this.app.months.months || [];
        const incomings = (this.app.incomingManager?.incomings || []).filter(e => !e.isStorno);
        const eurRate = this.app.config.eurRate || 400;

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

        const statElements = {
            total: document.getElementById('statTotal'),
            card: document.getElementById('statCard'),
            cash: document.getElementById('statCash'),
            transfer: document.getElementById('statTransfer'),
            items: document.getElementById('statItems'),
            months: document.getElementById('statMonths'),
            entries: document.getElementById('statEntries'),
            fillBar: document.getElementById('statFillBar'),
            fillPercent: document.getElementById('statFillPercent'),
            // === ÚJ ELEMEK ===
            incomingTotal: document.getElementById('statIncomingTotal'),
            incomingTopSender: document.getElementById('statIncomingTopSender'),
            incomingCount: document.getElementById('statIncomingCount'),
            balance: document.getElementById('statBalance'),
            fillActiveCells: document.getElementById('statFillActiveCells'),
            fillEmptyCells: document.getElementById('statFillEmptyCells'),
            fillTotalEntries: document.getElementById('statFillTotalEntries'),
            fillAvgEntries: document.getElementById('statFillAvgEntries')
        };

        // === KIADÁS FRISSÍTÉS ===
        if (statElements.total) statElements.total.textContent = total.toLocaleString('hu-HU') + ' Ft';
        if (statElements.card) statElements.card.textContent = card.toLocaleString('hu-HU') + ' Ft';
        if (statElements.cash) statElements.cash.textContent = cash.toLocaleString('hu-HU') + ' Ft';
        if (statElements.transfer) statElements.transfer.textContent = transfer.toLocaleString('hu-HU') + ' Ft';
        if (statElements.items) statElements.items.textContent = items.length;
        if (statElements.months) statElements.months.textContent = months.length;
        if (statElements.entries) statElements.entries.textContent = entries.length;

        // === KITÖLTÖTTSÉG ===
        const totalCells = items.length * months.length;
        const entryBaseKeys = new Set();
        entries.forEach(e => {
            const { itemId, month } = parseCellKey(e);
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
        if (statElements.fillBar) statElements.fillBar.style.width = Math.min(fillPercent, 100) + '%';
        if (statElements.fillPercent) statElements.fillPercent.textContent = fillPercent + '%';

        if (statElements.fillActiveCells) {
            statElements.fillActiveCells.textContent = `${filledCells} / ${totalCells} cella (${fillPercent}%)`;
        }
        if (statElements.fillEmptyCells) {
            statElements.fillEmptyCells.textContent = `${Math.max(0, totalCells - filledCells)} cella`;
        }
        if (statElements.fillTotalEntries) {
            statElements.fillTotalEntries.textContent = `${entries.length} db`;
        }
        if (statElements.fillAvgEntries) {
            const avg = filledCells > 0 ? (entries.length / filledCells).toFixed(1) : '0';
            statElements.fillAvgEntries.textContent = `${avg} db / aktív cella`;
        }

        // === BEJÖVŐ FRISSÍTÉS ===
        if (statElements.incomingTotal) {
            statElements.incomingTotal.textContent = incomingTotal.toLocaleString('hu-HU') + ' Ft';
        }
        if (statElements.incomingCount) {
            statElements.incomingCount.textContent = incomings.length;
        }
        if (statElements.incomingTopSender) {
            const top = topSenders[0];
            statElements.incomingTopSender.textContent = top
                ? `${top[0]} (${top[1].toLocaleString('hu-HU')} Ft)`
                : '-';
        }
        if (statElements.balance) {
            const balance = incomingTotal - total;
            statElements.balance.textContent = balance.toLocaleString('hu-HU') + ' Ft';
            statElements.balance.className = `text-2xl font-bold mt-2 ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
        }
    }

    updateReminderStatus() {
        const reminders = this.app.reminderManager.reminders || [];
        const today = dayjs();
        let overdue = 0, soon = 0;

        reminders.forEach(rem => {
            const due = dayjs(rem.due_date);
            const diff = due.diff(today, 'day');
            if (diff < 0) overdue++;
            else if (diff <= 7) soon++;
        });

        const led = document.getElementById('reminderLed');
        const text = document.getElementById('reminderStatusText');
        const count = document.getElementById('reminderCount');

        if (!led || !text || !count) return;

        count.textContent = reminders.length;

        if (overdue > 0) {
            led.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
            text.textContent = `${overdue} LEJÁRT`;
            text.className = 'text-red-600 font-bold';
        } else if (soon > 0) {
            led.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
            text.textContent = `${soon} esedékes`;
            text.className = 'text-amber-600 font-medium';
        } else {
            led.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
            text.textContent = 'Minden rendben';
            text.className = 'text-emerald-600';
        }
    }
}
