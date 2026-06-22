// js/input-modal-controller.js
export class InputModalController {
    constructor(app) {
        this.app = app;
        this.modalType = null;
        this.selectedColor = '#dbeafe'; // Alapértelmezett szín
        
        // Eseménykezelők bekötése a színválasztó gombokhoz
        this.setupColorListeners();
    }

    open(type) {
        this.modalType = type;
        const title = document.getElementById('hmiInputTitle');
        const label = document.getElementById('hmiInputLabel');
        const input = document.getElementById('hmiInputValue');
        const colorContainer = document.getElementById('hmiColorContainer');

        if (type === 'item') {
            title.textContent = 'Új kategória hozzáadása';
            label.textContent = 'Tétel megnevezése';
            input.type = 'text';
            input.placeholder = 'Pl. Rezsi, Élelmiszer...';
            
            // Színválasztó megjelenítése
            colorContainer?.classList.remove('hidden');
            
            // Alapértelmezett szín kijelölése (vizuális visszajelzés)
            this.selectedColor = '#dbeafe';
            document.querySelectorAll('.hmi-color-option').forEach(el => {
                el.classList.remove('ring-2', 'ring-blue-500');
                if (el.dataset.color === this.selectedColor) {
                    el.classList.add('ring-2', 'ring-blue-500');
                }
            });
        } else { // month
            title.textContent = 'Új hónap megnyitása';
            label.textContent = 'Válaszd ki a periódust (YYYY-MM)';
            input.type = 'month';
            input.value = new Date().toISOString().slice(0, 7);
            colorContainer?.classList.add('hidden');
        }
        
        input.value = '';
        document.getElementById('hmiInputModal').classList.remove('hidden');
        input.focus();
    }

    setupColorListeners() {
        document.querySelectorAll('.hmi-color-option').forEach(option => {
            // Eltávolítjuk a régi eseménykezelőket, hogy ne duplikálódjanak
            option.removeEventListener('click', this._colorClickHandler);
            // Hozzáadjuk az új eseménykezelőt (bind-del, hogy a this context megmaradjon)
            option.addEventListener('click', this._colorClickHandler.bind(this));
        });
    }

    // Külön metódus a kattintás kezelésére (a bind miatt)
    _colorClickHandler(event) {
        const option = event.currentTarget;
        // Minden gombról eltávolítjuk a kijelölést
        document.querySelectorAll('.hmi-color-option').forEach(el => {
            el.classList.remove('ring-2', 'ring-blue-500');
        });
        // A kiválasztottra rárakjuk
        option.classList.add('ring-2', 'ring-blue-500');
        // Eltároljuk a kiválasztott színt
        this.selectedColor = option.dataset.color;
    }

    close() {
        document.getElementById('hmiInputModal').classList.add('hidden');
    }

    async save() {
        const val = document.getElementById('hmiInputValue').value.trim();
        if (!val) return;

        if (this.modalType === 'item') {
            // Duplikáció ellenőrzés
            const existing = this.app.items.items.some(i => 
                i.name.toLowerCase() === val.toLowerCase()
            );

            if (existing) {
                await this.app.hmiNotif.showConfirm(
                    'Duplikált kategória', 
                    `Már létezik "${val}" nevű kategória!`, 
                    false, 
                    'Értem'
                );
                return;
            }
            
            // A kiválasztott szín használata (a this.selectedColor már frissül az eseménykezelőben)
            const color = this.selectedColor || '#dbeafe';
            await this.app.items.add(val, color);
            await this.app.items.load();
            this.app.hmiNotif.showToast('Kategória rögzítve!', 'success');
            this.app.renderer.updateFooterStatus('Kategória mentve a DB-be');
            
        } else if (this.modalType === 'month') {
            if (this.app.months.months.includes(val)) {
                await this.app.hmiNotif.showConfirm(
                    'Interlock hiba', 
                    `A(z) ${val} periódus már nyitva van.`, 
                    false, 
                    'Értem'
                );
                return;
            }
            await this.app.months.add(val);
            await this.app.months.load();
            this.app.hmiNotif.showToast('Hónap megnyitva!', 'success');
            this.app.renderer.updateFooterStatus('Új hónap inicializálva');
        }
        
        this.close();
        this.app.renderer.renderTable();
        // Ha van renderSummary, hívd meg (de lehet, hogy már nincs)
        if (typeof this.app.renderer.renderSummary === 'function') {
            this.app.renderer.renderSummary();
        }
    }
}