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
        // React handles rendering for Phase 17
        // This vanilla render is retired.
        return;
    }


    /**
     * Cellára kattintás kezelése
     */
    _handleCellClick(element) {
        const sender = element.dataset.sender;
        const date = element.dataset.date;
        const entryId = element.dataset.entryId;
        const currentAmount = element.dataset.amount;

        const existingEntry = entryId ? this.app.incomingManager.incomings.find(e => e.id === entryId) : null;
        const isCurrentlyStorno = existingEntry ? !!existingEntry.isStorno : false;

        // Input modal megnyitása
        this.app.hmiNotif.showInputModal({
            title: entryId ? '💰 Bejövő utalás szerkesztése' : '💰 Új bejövő utalás',
            label: 'Összeg (Ft)',
            value: currentAmount || '',
            placeholder: 'Add meg az összeget...',
            inputType: 'number',
            confirmText: entryId ? 'Módosítás' : 'Rögzítés',
            showDelete: !!entryId,
            showStorno: !!entryId,
            isStorno: isCurrentlyStorno,
            onDelete: async () => {
                const confirmed = await this.app.hmiNotif.showConfirm({
                    title: '🗑️ Tétel törlése',
                    message: `Biztosan törölni szeretnéd ezt a bejövő utalást? (${parseFloat(currentAmount || 0).toLocaleString('hu-HU')} Ft)`,
                    type: 'danger',
                    confirmText: 'Törlés'
                });
                if (!confirmed) return;

                try {
                    await this.app.incomingManager.delete(entryId);
                    this.render();
                    this.app.hmiNotif.showToast('✅ Bejövő utalás törölve!', 'success');
                } catch (e) {
                    console.error('[INCOMING] Hiba a törlésnél:', e);
                    this.app.hmiNotif.showToast('❌ Hiba a törlés során!', 'error');
                }
            },
            onConfirm: async (value, isStornoChecked) => {
                const amount = parseFloat(value);
                if (isNaN(amount) || amount <= 0) {
                    this.app.hmiNotif.showToast('Érvénytelen összeg!', 'error');
                    return;
                }

                try {
                    if (entryId) {
                        // Meglévő módosítása
                        await this.app.incomingManager.update(entryId, { amount, isStorno: isStornoChecked });
                        this.app.hmiNotif.showToast('✅ Bejövő utalás módosítva!', 'success');
                    } else {
                        // Új hozzáadása
                        await this.app.incomingManager.add(sender, date, amount);
                        this.app.hmiNotif.showToast('✅ Bejövő utalás rögzítve!', 'success');
                    }
                    this.render();
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