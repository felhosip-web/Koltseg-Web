// js/cell-modal-controller.js
// Cell Modal Controller - Rész-tételek kezelése egy cellában (2026-os javított verzió)

export class CellModalController {
    constructor(app) {
        this.app = app;
        
        // Aktuális állapot
        this.currentCellBaseKey = null;   // Pl.: "5_2026-07"
        this.selectedColor = 'transparent';
        this.editingEntryId = null;       // Szerkesztés esetén az aktuális entry ID
        
        // Event listener-ek tisztításához (memory leak megelőzés)
        this.boundEvents = new Set();
    }

    /**
     * Modal megnyitása egy cellára kattintva
     */
    open(cellElement) {
        this.currentCellBaseKey = cellElement.getAttribute('data-cellbasekey');
        
        this.resetForm();
        this.refreshList();                    // Rész-tételek betöltése
        
        document.getElementById('cellEditorModal').classList.remove('hidden');
        document.getElementById('cellAmountInput').focus();
    }

    /**
     * Űrlap alaphelyzetbe állítása (új tételhez)
     */
    resetForm() {
        this.editingEntryId = null;
        
        document.getElementById('cellAmountInput').value = '';
        document.getElementById('cellNoteInput').value = '';
        document.getElementById('cellMethodInput').value = 'Kártya';
        document.getElementById('cellCurrencyInput').value = 'HUF';
        
        this.selectedColor = 'transparent';
        
        // Gomb szöveg visszaállítása
        const saveBtn = document.getElementById('btnSaveCellModal');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Tétel Hozzáadása';
        
        // Színválasztó alaphelyzet
        document.querySelectorAll('.color-selector-btn').forEach(btn => {
            btn.classList.remove('ring-4', 'ring-black');
            if (btn.getAttribute('data-color') === 'transparent') {
                btn.classList.add('ring-4', 'ring-black');
            }
        });
    }

    /**
     * Rész-tételek lista frissítése a jelenlegi cellához
     * Fontos: IndexedDB-ből gyors lekérdezés
     */
    async refreshList() {
        const container = document.getElementById('subEntriesContainer');
        if (!container) return;

        // Gyors és indexelt lekérdezés
        const cellEntries = await this.app.entries.getByCellKey(this.currentCellBaseKey);

        if (cellEntries.length === 0) {
            container.innerHTML = `
                <p class="text-[11px] text-center text-gray-400 py-6 italic">
                    Nincsenek rész-tételek ebben a cellában.
                </p>`;
            return;
        }

        let html = '';
        
        cellEntries.forEach(entry => {
            const bgColor = entry.color && entry.color !== 'transparent' 
                ? entry.color 
                : '#f8fafc';
            
            html += `
                <div class="p-3 rounded-2xl flex justify-between items-start border border-gray-100 hover:border-gray-200 transition-all group" 
                     style="background-color: ${bgColor}">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="font-bold text-gray-900 text-base">
                                ${entry.amount.toLocaleString('hu-HU')} ${entry.currency || 'HUF'}
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono bg-black/5 rounded">
                                ${entry.paymentMethod}
                            </span>
                        </div>
                        ${entry.note ? `
                            <p class="text-xs text-gray-600 mt-1 line-clamp-2">${entry.note}</p>
                        ` : ''}
                    </div>
                    
                    <div class="flex gap-1 opacity-70 group-hover:opacity-100 transition-all">
                        <button class="btn-edit-sub-entry w-8 h-8 flex items-center justify-center hover:bg-blue-100 hover:text-blue-600 rounded-xl transition" 
                                data-id="${entry.id}">
                            <i class="fas fa-pen text-sm"></i>
                        </button>
                        <button class="btn-delete-sub-entry w-8 h-8 flex items-center justify-center hover:bg-red-100 hover:text-red-600 rounded-xl transition" 
                                data-id="${entry.id}">
                            <i class="fas fa-trash-can text-sm"></i>
                        </button>
                    </div>
                </div>`;
        });

        container.innerHTML = html;
        
        this._attachListEventListeners();
    }

    /**
     * Event listener-ek felvétele a lista gombjaira
     * (cleanup előbb történik)
     */
    _attachListEventListeners() {
        this._cleanupEvents(); // régi listener-ek eltávolítása

        // Szerkesztés gombok
        document.querySelectorAll('.btn-edit-sub-entry').forEach(btn => {
            const handler = (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                this.editEntry(id);
            };
            btn.addEventListener('click', handler);
            this.boundEvents.add({ element: btn, type: 'click', handler });
        });

        // Törlés gombok
        document.querySelectorAll('.btn-delete-sub-entry').forEach(btn => {
            const handler = async (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                await this.deleteEntry(id);
            };
            btn.addEventListener('click', handler);
            this.boundEvents.add({ element: btn, type: 'click', handler });
        });
    }

    /**
     * Régi event listener-ek eltávolítása (memory leak védelem)
     */
    _cleanupEvents() {
        this.boundEvents.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this.boundEvents.clear();
    }

    /**
     * Egy meglévő tétel szerkesztése
     */
    editEntry(id) {
        const entry = this.app.entries.entries.find(ent => ent.id === id);
        if (!entry) return;

        this.editingEntryId = id;

        document.getElementById('cellAmountInput').value = entry.amount;
        document.getElementById('cellCurrencyInput').value = entry.currency || 'HUF';
        document.getElementById('cellMethodInput').value = entry.paymentMethod || 'Kártya';
        document.getElementById('cellNoteInput').value = entry.note || '';
        
        this.selectedColor = entry.color || 'transparent';

        // Szín gombok frissítése
        document.querySelectorAll('.color-selector-btn').forEach(b => {
            b.classList.remove('ring-4', 'ring-black');
            if (b.getAttribute('data-color') === this.selectedColor) {
                b.classList.add('ring-4', 'ring-black');
            }
        });

        const saveBtn = document.getElementById('btnSaveCellModal');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Tétel Módosítása';
    }

    /**
     * Rész-tétel törlése
     */
    async deleteEntry(id) {
        const targetEntry = this.app.entries.entries.find(ent => ent.id === id);
        if (!targetEntry) return;

        const confirmed = await this.app.hmiNotif.showConfirm({
            title: 'Rész-tétel törlése',
            message: `Biztosan törli ezt a rész-tételt?\n\n${targetEntry.amount.toLocaleString()} ${targetEntry.currency || 'HUF'}`,
            type: 'danger',
            confirmText: 'Törlés'
        });

        if (!confirmed) return;

        await this.app.entries.deleteEntry(id);
        await this.app.entries.load();

        this.app.hmiNotif.showToast('Rész-tétel törölve', 'success');
        this.app.renderer.render();           // Táblázat frissítése
        this.refreshList();                   // Lista frissítése
    }

    /**
     * Új tétel mentése vagy meglévő módosítása
     */
    async save() {
        const amountStr = document.getElementById('cellAmountInput').value.trim();
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount <= 0) {
            this.app.hmiNotif.showToast('Érvénytelen összeg!', 'error');
            return;
        }

        const currency = document.getElementById('cellCurrencyInput').value;
        const paymentMethod = document.getElementById('cellMethodInput').value;
        const note = document.getElementById('cellNoteInput').value.trim();

        let entryData;

        if (this.editingEntryId !== null) {
            // Módosítás
            const oldEntry = this.app.entries.entries.find(e => e.id === this.editingEntryId);
            entryData = {
                id: this.editingEntryId,
                cellKey: oldEntry ? oldEntry.cellKey : `\( {this.currentCellBaseKey}_ \){Date.now()}`,
                amount,
                currency,
                paymentMethod,
                note,
                color: this.selectedColor,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            this.app.hmiNotif.showToast('Rész-tétel frissítve!', 'success');
        } else {
            // Új tétel
            entryData = {
                cellKey: `\( {this.currentCellBaseKey}_ \){Date.now()}`,
                amount,
                currency,
                paymentMethod,
                note,
                color: this.selectedColor,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            this.app.hmiNotif.showToast('Új rész-tétel rögzítve!', 'success');
        }

        await this.app.entries.saveEntry(entryData);
        await this.app.entries.load();

        this.resetForm();
        this.refreshList();
        
        // Fő táblázat és összegzés frissítése
        this.app.renderer.render();
        this.app.renderer.renderSummary?.();   // ha létezik
    }

    /**
     * Modal bezárása
     */
    close() {
        this._cleanupEvents();
        document.getElementById('cellEditorModal').classList.add('hidden');
    }

    // Destructor-szerű metódus (ha kell takarítani)
    destroy() {
        this._cleanupEvents();
    }
}