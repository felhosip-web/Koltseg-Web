// js/cell-modal-controller.js
// Cell Modal Controller - Rész-tételek kezelése egy cellában (2026-os javított verzió)

export class CellModalController {
    /**
     * Konstruktor - Cell Modal vezérlő inicializálása
     * @param {Object} app - Az alkalmazás fő példánya
     */
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

        const stornoCheckbox = document.getElementById('cellIsStorno');
        if (stornoCheckbox) {
            stornoCheckbox.checked = false;
        }
        
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
            
            const isStorno = !!entry.isStorno;
            const stornoClass = isStorno ? 'line-through text-red-900 opacity-60' : '';
            const stornoBg = isStorno ? 'background-color: #fef2f2;' : `background-color: ${bgColor}`;
            const stornoBorder = isStorno ? 'border-red-200' : 'border-gray-100';

            html += `
                <div class="p-3 rounded-2xl flex justify-between items-start border ${stornoBorder} hover:border-gray-200 transition-all group" 
                     style="${stornoBg}">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2 flex-wrap">
                            <span class="font-bold text-gray-900 text-base ${stornoClass}">
                                ${entry.amount.toLocaleString('hu-HU')} ${entry.currency || 'HUF'}
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono bg-black/5 rounded">
                                ${entry.paymentMethod}
                            </span>
                            ${isStorno ? `
                                <span class="px-2 py-0.5 text-[10px] font-black bg-red-100 text-red-600 rounded flex items-center gap-1">
                                    <i class="fas fa-ban"></i> SZTORNÓ
                                </span>
                            ` : ''}
                        </div>
                        ${entry.note ? `
                            <p class="text-xs text-gray-600 mt-1 line-clamp-2 ${stornoClass}">${entry.note}</p>
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

        // Színválasztó gombok
        document.querySelectorAll('.color-selector-btn').forEach(btn => {
            const handler = (e) => {
                this.selectedColor = e.currentTarget.getAttribute('data-color');
                document.querySelectorAll('.color-selector-btn').forEach(b => b.classList.remove('ring-4', 'ring-black'));
                e.currentTarget.classList.add('ring-4', 'ring-black');
            };
            btn.addEventListener('click', handler);
            this.boundEvents.add({ element: btn, type: 'click', handler });
        });

        // Szerkesztés gombok
        document.querySelectorAll('.btn-edit-sub-entry').forEach(btn => {
            const handler = (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                this.editEntry(id);
            };
            btn.addEventListener('click', handler);
            this.boundEvents.add({ element: btn, type: 'click', handler });
        });

        // Törlés gombok
        document.querySelectorAll('.btn-delete-sub-entry').forEach(btn => {
            const handler = async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
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
        const entry = this.app.entries.entries.find(ent => String(ent.id) === String(id));
        if (!entry) return;

        this.editingEntryId = entry.id;

        document.getElementById('cellAmountInput').value = entry.amount;
        document.getElementById('cellCurrencyInput').value = entry.currency || 'HUF';
        document.getElementById('cellMethodInput').value = entry.paymentMethod || 'Kártya';
        document.getElementById('cellNoteInput').value = entry.note || '';
        
        const stornoCheckbox = document.getElementById('cellIsStorno');
        if (stornoCheckbox) {
            stornoCheckbox.checked = !!entry.isStorno;
        }

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
        const targetEntry = this.app.entries.entries.find(ent => String(ent.id) === String(id));
        if (!targetEntry) return;

        const confirmed = await this.app.hmiNotif.showConfirm({
            title: 'Rész-tétel törlése',
            message: `Biztosan törli ezt a rész-tételt?\n\n${targetEntry.amount.toLocaleString()} ${targetEntry.currency || 'HUF'}`,
            type: 'danger',
            confirmText: 'Törlés'
        });

        if (!confirmed) return;

        try {
            await this.app.entries.deleteEntry(targetEntry.id);
            await this.app.entries.load();

            this.app.hmiNotif.showToast('Rész-tétel törölve', 'success');
        } catch (error) {
            console.error('[CellModal] Hiba a törlés során:', error);

            this.app.hmiNotif.showToast('Hiba törlés közben.', 'error');
        } finally {
            this.app.renderer.renderTable();           // Táblázat frissítése
            this.refreshList();                   // Lista frissítése
        }
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
        
        const stornoCheckbox = document.getElementById('cellIsStorno');
        const isStorno = stornoCheckbox ? stornoCheckbox.checked : false;

        let entryData;

        if (this.editingEntryId !== null) {
            // Módosítás
            const oldEntry = this.app.entries.entries.find(e => String(e.id) === String(this.editingEntryId));
            entryData = {
                id: this.editingEntryId,
                cellKey: oldEntry ? oldEntry.cellKey : `${this.currentCellBaseKey}_${Date.now()}`,
                itemId: this.currentCellBaseKey.split('_')[0],
                month: this.currentCellBaseKey.split('_')[1],
                amount,
                currency,
                paymentMethod,
                note,
                color: this._normalizeColor(this.selectedColor),
                isStorno,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            this.app.hmiNotif.showToast('Rész-tétel frissítve!', 'success');
        } else {
            // Új tétel
            entryData = {
                cellKey: `${this.currentCellBaseKey}_${Date.now()}`,
                itemId: this.currentCellBaseKey.split('_')[0],
                month: this.currentCellBaseKey.split('_')[1],
                amount,
                currency,
                paymentMethod,
                note,
                color: this._normalizeColor(this.selectedColor),
                isStorno,
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
        this.app.renderer.renderTable();
        this.app.renderer.renderSummary?.();   // ha létezik
        
        // Státusz frissítése a láblécben
        this.app.renderer.updateFooterStatus('Adatok sikeresen mentve', false);
    }

    _normalizeColor(color) {
        if (!color || typeof color !== 'string') return 'transparent';
        const normalized = color.trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) return normalized;
        if (/^rgba?\(/i.test(normalized) || /^hsla?\(/i.test(normalized)) return normalized;
        return 'transparent';
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