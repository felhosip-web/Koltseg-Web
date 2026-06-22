// js/cell-modal-controller.js
export class CellModalController {
    constructor(app) {
        this.app = app;
        this.currentCellBaseKey = null;
        this.selectedColor = 'transparent';
        this.editingEntryId = null;
    }

    open(cellElement) {
        this.currentCellBaseKey = cellElement.getAttribute('data-cellbasekey');
        this.resetForm();
        this.refreshList();
        document.getElementById('cellEditorModal').classList.remove('hidden');
        document.getElementById('cellAmountInput').focus();
    }

    resetForm() {
        this.editingEntryId = null;
        document.getElementById('cellAmountInput').value = '';
        document.getElementById('cellNoteInput').value = '';
        document.getElementById('cellMethodInput').value = 'Kártya';
        document.getElementById('cellCurrencyInput').value = 'HUF';
        this.selectedColor = 'transparent';
        const saveBtn = document.getElementById('btnSaveCellModal');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Tétel Hozzáadása';
        document.querySelectorAll('.color-selector-btn').forEach(b => {
            b.classList.remove('ring-4', 'ring-black');
            if (b.getAttribute('data-color') === 'transparent') b.classList.add('ring-4', 'ring-black');
        });
    }

    refreshList() {
        const container = document.getElementById('subEntriesContainer');
        if (!container) return;
        const cellEntries = this.app.entries.entries.filter(e => e.cellKey && e.cellKey.startsWith(this.currentCellBaseKey));
        if (cellEntries.length === 0) {
            container.innerHTML = '<p class="text-[11px] text-center text-gray-400 py-3 italic">Nincsenek rész-tételek ebben a cellában.</p>';
            return;
        }
        let html = '';
        cellEntries.forEach(entry => {
            const itemBg = entry.color && entry.color !== 'transparent' ? entry.color : '#f3f4f6';
            html += `<div class="p-2.5 rounded-xl flex justify-between items-center text-xs shadow-sm border border-black/5" style="background-color: ${itemBg}">
                <div class="truncate max-w-[65%]">
                    <span class="font-black text-gray-900">${entry.amount.toLocaleString('hu-HU')} ${entry.currency || 'HUF'}</span>
                    <span class="px-1.5 py-0.5 bg-black/5 rounded font-mono text-[9px] text-gray-600 ml-1">${entry.paymentMethod}</span>
                    ${entry.note ? `<p class="text-[10px] text-gray-600 font-medium truncate mt-0.5">${entry.note}</p>` : ''}
                </div>
                <div class="flex gap-1">
                    <button class="btn-edit-sub-entry w-8 h-8 flex items-center justify-center bg-white/80 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition" data-id="${entry.id}">
                        <i class="fas fa-pen text-[11px]"></i>
                    </button>
                    <button class="btn-delete-sub-entry w-8 h-8 flex items-center justify-center bg-white/80 hover:bg-red-50 hover:text-red-600 rounded-lg transition" data-id="${entry.id}">
                        <i class="fas fa-trash-can text-[11px]"></i>
                    </button>
                </div>
            </div>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('.btn-edit-sub-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                this.editEntry(id);
            });
        });

        container.querySelectorAll('.btn-delete-sub-entry').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                await this.deleteEntry(id);
            });
        });
    }

    editEntry(id) {
        const entry = this.app.entries.entries.find(ent => ent.id === id);
        if (!entry) return;
        this.editingEntryId = id;
        document.getElementById('cellAmountInput').value = entry.amount;
        document.getElementById('cellCurrencyInput').value = entry.currency || 'HUF';
        document.getElementById('cellMethodInput').value = entry.paymentMethod || 'Kártya';
        document.getElementById('cellNoteInput').value = entry.note || '';
        this.selectedColor = entry.color || 'transparent';
        document.querySelectorAll('.color-selector-btn').forEach(b => {
            b.classList.remove('ring-4', 'ring-black');
            if (b.getAttribute('data-color') === this.selectedColor) b.classList.add('ring-4', 'ring-black');
        });
        document.getElementById('btnSaveCellModal').innerHTML = '<i class="fas fa-save"></i> Tétel Módosítása';
        document.getElementById('cellAmountInput').focus();
    }

    async deleteEntry(id) {
        const targetEntry = this.app.entries.entries.find(ent => ent.id === id);
        const confirmed = await this.app.hmiNotif.showConfirm(
            'Rész-tétel törlése',
            `Biztosan törli ezt a rész-tételt (${targetEntry.amount.toLocaleString()} ${targetEntry.currency})?`,
            true,
            'Törlés'
        );
        if (confirmed) {
            await this.app.entries.deleteEntry(id);
            await this.app.entries.load();
            this.app.hmiNotif.showToast('Rész-tétel törölve', 'info');
            this.app.renderer.updateFooterStatus('Rész-tétel törölve a DB-ből');
            if (this.editingEntryId === id) this.resetForm();
            this.refreshList();
            this.app.renderer.renderTable();
            this.app.renderer.renderSummary();
        }
    }

    async save() {
        const amount = parseFloat(document.getElementById('cellAmountInput').value);
        if (isNaN(amount) || amount <= 0) {
            this.app.hmiNotif.showToast('Érvénytelen összeg!', 'error');
            return;
        }
        const currency = document.getElementById('cellCurrencyInput').value;
        const paymentMethod = document.getElementById('cellMethodInput').value;
        const note = document.getElementById('cellNoteInput').value.trim();

        let entryData;
        if (this.editingEntryId !== null) {
            const oldEntry = this.app.entries.entries.find(ent => ent.id === this.editingEntryId);
            entryData = {
                id: this.editingEntryId,
                cellKey: oldEntry ? oldEntry.cellKey : `${this.currentCellBaseKey}_${Date.now()}`,
                amount,
                currency,
                paymentMethod,
                note,
                color: this.selectedColor,
                timestamp: new Date().toISOString()
            };
            this.app.hmiNotif.showToast('Rész-tétel frissítve!', 'success');
            this.app.renderer.updateFooterStatus('Tranzakció frissítve');
        } else {
            entryData = {
                cellKey: `${this.currentCellBaseKey}_${Date.now()}`,
                amount,
                currency,
                paymentMethod,
                note,
                color: this.selectedColor,
                timestamp: new Date().toISOString()
            };
            this.app.hmiNotif.showToast('Rész-tétel hozzáadva!', 'success');
            this.app.renderer.updateFooterStatus('Új tranzakció rögzítve');
        }

        await this.app.entries.saveEntry(entryData);
        await this.app.entries.load();

        this.resetForm();
        this.refreshList();
        this.app.renderer.renderTable();
        this.app.renderer.renderSummary();
    }

    close() {
        document.getElementById('cellEditorModal').classList.add('hidden');
    }
}