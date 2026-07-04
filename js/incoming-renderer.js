// js/incoming-renderer.js
// Bejövő utalások táblázat renderer

export class IncomingRenderer {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('incomingTableContainer');
        this.selectedCell = null;
    }

    /**
     * Táblázat renderelése
     */
    render() {
        if (!this.container) return;

        const incomings = this.app.incomingManager.incomings || [];
        const senders = this.app.incomingManager.getSenders() || [];

        // Dátumok összegyűjtése
        const dates = [...new Set(incomings.map(e => e.date))].sort();

        // Ha nincs adat
        if (senders.length === 0 || dates.length === 0) {
            this.container.innerHTML = `
                <div class="text-center py-12 text-gray-400">
                    <i class="fas fa-inbox text-4xl block mb-3"></i>
                    <p>Még nincs rögzített bejövő utalás</p>
                    <p class="text-sm mt-1">Kattints a "Bejövő tétel" gombra az első rögzítéséhez</p>
                </div>
            `;
            return;
        }

        // Táblázat generálás
        let html = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                    <thead>
                        <tr class="bg-gray-50 border-b border-gray-200">
                            <th class="p-3 text-left font-bold text-gray-600 text-xs uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                                Kitől
                            </th>
        `;

        // Dátum fejlécek
        dates.forEach(date => {
            const formatted = this._formatDate(date);
            html += `
                <th class="p-3 text-center font-bold text-gray-600 text-xs uppercase tracking-wider min-w-[100px] group relative" 
                    data-date="${date}">
                    ${formatted}
                    <button class="incoming-delete-col opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 w-4 h-4 bg-red-100 text-red-500 rounded-full text-[8px] hover:bg-red-200 transition"
                            data-date="${date}" title="Oszlop törlése (dátum)">
                        ×
                    </button>
                </th>
            `;
        });

        html += `
                        <th class="p-3 text-center font-bold text-gray-600 text-xs uppercase tracking-wider bg-gray-50">
                            Összesen
                        </th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Sorok
        senders.forEach(sender => {
            const senderEntries = incomings.filter(e => e.sender === sender);
            const total = senderEntries.reduce((sum, e) => sum + e.amount, 0);

            html += `
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition group">
                    <td class="p-3 font-medium text-gray-700 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
                        <div class="flex items-center justify-between">
                            <span>${this._escapeHtml(sender)}</span>
                            <button class="incoming-delete-row opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition text-xs px-1" 
                                    data-sender="${this._escapeHtml(sender)}" title="Sor törlése">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </td>
            `;

            dates.forEach(date => {
                const entry = senderEntries.find(e => e.date === date);
                const amount = entry ? entry.amount : '';
                const entryId = entry ? entry.id : null;

                html += `
                    <td class="p-2 text-center incoming-cell cursor-pointer hover:bg-blue-50 transition rounded-lg"
                         data-sender="${this._escapeHtml(sender)}"
                         data-date="${date}"
                         data-entry-id="${entryId || ''}"
                         data-amount="${amount}"
                         onclick="window.app?.incomingRenderer?._handleCellClick(this)">
                        ${amount ? amount.toLocaleString('hu-HU') + ' Ft' : '—'}
                    </td>
                `;
            });

            html += `
                    <td class="p-3 text-center font-bold text-blue-600 bg-gray-50">
                        ${total.toLocaleString('hu-HU')} Ft
                    </td>
                </tr>
            `;
        });

        // Összesítő sor
        html += `
                <tr class="bg-gray-100 border-t-2 border-gray-300">
                    <td class="p-3 font-bold text-gray-700 sticky left-0 bg-gray-100 z-10">
                        ÖSSZESEN
                    </td>
        `;

        dates.forEach(date => {
            const total = incomings.filter(e => e.date === date).reduce((sum, e) => sum + e.amount, 0);
            html += `
                <td class="p-3 text-center font-bold text-gray-700">
                    ${total ? total.toLocaleString('hu-HU') + ' Ft' : '—'}
                </td>
            `;
        });

        html += `
                    <td class="p-3 text-center font-bold text-blue-700 bg-gray-100">
                        ${incomings.reduce((sum, e) => sum + e.amount, 0).toLocaleString('hu-HU')} Ft
                    </td>
                </tr>
            </tbody>
        </table>
        </div>
        `;

        this.container.innerHTML = html;

        // Eseménykezelők
        this._bindEvents();
    }

    /**
     * Cellára kattintás kezelése
     */
    _handleCellClick(element) {
        const sender = element.dataset.sender;
        const date = element.dataset.date;
        const entryId = element.dataset.entryId;
        const currentAmount = element.dataset.amount;

        // Input modal megnyitása
        this.app.hmiNotif.showInputModal({
            title: entryId ? '💰 Bejövő utalás szerkesztése' : '💰 Új bejövő utalás',
            label: 'Összeg (Ft)',
            value: currentAmount || '',
            placeholder: 'Add meg az összeget...',
            inputType: 'number',
            confirmText: entryId ? 'Módosítás' : 'Rögzítés',
            onConfirm: async (value) => {
                const amount = parseFloat(value);
                if (isNaN(amount) || amount <= 0) {
                    this.app.hmiNotif.showToast('Érvénytelen összeg!', 'error');
                    return;
                }

                try {
                    if (entryId) {
                        // Meglévő módosítása
                        await this.app.incomingManager.update(entryId, { amount });
                    } else {
                        // Új hozzáadása
                        await this.app.incomingManager.add(sender, date, amount);
                    }
                    this.render();
                    this.app.hmiNotif.showToast('✅ Bejövő utalás rögzítve!', 'success');
                } catch (e) {
                    console.error('[INCOMING] Hiba:', e);
                    this.app.hmiNotif.showToast('❌ Hiba a mentés során!', 'error');
                }
            }
        });
    }

    /**
     * Új sender/bejegyzés hozzáadása (gomb)
     */
    async addNewEntry() {
        // 1. Sender kiválasztása vagy új
        const senders = this.app.incomingManager.getSenders();
        let sender = await this.app.hmiNotif.showSelectModal({
            title: '📤 Kitől érkezett?',
            options: senders.length > 0 ? [...senders, '+ Új utaló'] : ['+ Új utaló'],
            placeholder: 'Válassz utalót...'
        });

        if (!sender) return;

        // Új sender
        if (sender === '+ Új utaló') {
            sender = await this.app.hmiNotif.showInputModal({
                title: '📤 Új utaló',
                label: 'Név',
                placeholder: 'Add meg az utaló nevét...',
                confirmText: 'Hozzáadás'
            });
            sender = String(sender || '').trim();
            if (!sender) {
                this.app.hmiNotif.showToast('Az utaló neve nem lehet üres!', 'error');
                return;
            }
            // Ellenőrizzük, hogy nem létezik-e már
            if (senders.includes(sender)) {
                this.app.hmiNotif.showToast('⚠️ Ez az utaló már létezik!', 'warning');
                return;
            }
        }

        // 2. Dátum kiválasztása
        const today = new Date().toISOString().split('T')[0];
        const date = await this.app.hmiNotif.showInputModal({
            title: '📅 Dátum',
            label: 'Dátum',
            value: today,
            inputType: 'date',
            confirmText: 'Tovább'
        });
        const validDate = String(date || '').trim();
        if (!validDate || Number.isNaN(new Date(validDate).getTime())) {
            this.app.hmiNotif.showToast('Hibás dátum!', 'error');
            return;
        }

        // 3. Összeg megadása
        const amount = await this.app.hmiNotif.showInputModal({
            title: '💰 Összeg',
            label: 'Összeg (Ft)',
            placeholder: 'Add meg az összeget...',
            inputType: 'number',
            confirmText: 'Rögzítés'
        });
        if (!amount) return;

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            this.app.hmiNotif.showToast('Érvénytelen összeg!', 'error');
            return;
        }

        // 4. Mentés
        try {
            await this.app.incomingManager.add(sender, validDate, parsedAmount);
            this.render();
            this.app.hmiNotif.showToast('✅ Bejövő utalás rögzítve!', 'success');
        } catch (e) {
            console.error('[INCOMING] Hiba:', e);
            this.app.hmiNotif.showToast('❌ Hiba a mentés során!', 'error');
        }
    }

    /**
     * Sor törlése (utaló összes tételének törlése)
     */
    async deleteRow(sender) {
        const confirmed = await this.app.hmiNotif.showConfirm({
            title: '🗑️ Sor törlése',
            message: `Biztosan törölni szeretnéd "${sender}" összes bejövő utalását?`,
            type: 'warning',
            confirmText: 'Törlés'
        });
        if (!confirmed) return;

        const entries = this.app.incomingManager.incomings.filter(e => e.sender === sender);
        for (const entry of entries) {
            await this.app.incomingManager.delete(entry.id);
        }
        this.render();
        this.app.hmiNotif.showToast(`✅ "${sender}" összes tétel törölve`, 'success');
    }

    /**
     * Oszlop törlése (dátum)
     */
    async deleteColumn(date) {
        const confirmed = await this.app.hmiNotif.showConfirm({
            title: '🗑️ Oszlop törlése',
            message: `Biztosan törölni szeretnéd a(z) ${this._formatDate(date)} összes bejegyzését?`,
            type: 'warning',
            confirmText: 'Törlés'
        });
        if (!confirmed) return;

        const entries = this.app.incomingManager.incomings.filter(e => e.date === date);
        for (const entry of entries) {
            await this.app.incomingManager.delete(entry.id);
        }
        this.render();
        this.app.hmiNotif.showToast(`✅ ${this._formatDate(date)} összes tétel törölve`, 'success');
    }

    /**
     * Eseménykezelők bindolása
     */
    _bindEvents() {
        // Oszlop törlés
        this.container.querySelectorAll('.incoming-delete-col').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const date = btn.dataset.date;
                this.deleteColumn(date);
            });
        });

        // Sor törlés
        this.container.querySelectorAll('.incoming-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sender = btn.dataset.sender;
                this.deleteRow(sender);
            });
        });
    }

    /**
     * Dátum formázás
     */
    _formatDate(date) {
        const d = new Date(date + 'T00:00:00');
        return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    /**
     * HTML escape
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}