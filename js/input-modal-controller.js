// js/input-modal-controller.js
// Input Modal Controller - Új kategória és új hónap létrehozása

export class InputModalController {
    constructor(app) {
        this.app = app;
        this.modalType = null;           // 'item' vagy 'month'
        this.selectedColor = '#dbeafe';  // Alapértelmezett szín új kategóriához
        
        // Event listener-ek tisztításához (memory leak védelem)
        this.boundColorHandler = this._colorClickHandler.bind(this);
    }

    /**
     * Modal megnyitása (kategória vagy hónap létrehozásához)
     * @param {string} type - 'item' vagy 'month'
     */
    open(type) {
        this.modalType = type;
        
        const titleEl = document.getElementById('hmiInputTitle');
        const labelEl = document.getElementById('hmiInputLabel');
        const inputEl = document.getElementById('hmiInputValue');
        const colorContainer = document.getElementById('hmiColorContainer');

        if (type === 'item') {
            // Kategória létrehozása
            titleEl.textContent = 'Új kategória hozzáadása';
            labelEl.textContent = 'Kategória megnevezése';
            inputEl.type = 'text';
            inputEl.placeholder = 'Pl. Rezsi, Élelmiszer, Benzín...';
            colorContainer?.classList.remove('hidden');
            
            // Alapértelmezett szín beállítása
            this.selectedColor = '#dbeafe';
            this._updateColorSelection();
            
        } else {
            // Hónap létrehozása
            titleEl.textContent = 'Új hónap megnyitása';
            labelEl.textContent = 'Hónap választása (ÉÉÉÉ-HH)';
            inputEl.type = 'month';
            inputEl.value = new Date().toISOString().slice(0, 7);
            colorContainer?.classList.add('hidden');
        }

        inputEl.value = '';                    // Ürítés
        document.getElementById('hmiInputModal').classList.remove('hidden');
        inputEl.focus();
        inputEl.select();
    }

    /**
     * Színválasztó gombok vizuális frissítése
     */
    _updateColorSelection() {
        document.querySelectorAll('.hmi-color-option').forEach(el => {
            el.classList.remove('ring-2', 'ring-blue-500');
            if (el.dataset.color === this.selectedColor) {
                el.classList.add('ring-2', 'ring-blue-500');
            }
        });
    }

    /**
     * Színválasztó listener-ek inicializálása (csak egyszer fusson le)
     */
    setupColorListeners() {
        document.querySelectorAll('.hmi-color-option').forEach(option => {
            // Először eltávolítjuk a régi listener-t (biztonság)
            option.removeEventListener('click', this.boundColorHandler);
            // Majd hozzáadjuk az újat
            option.addEventListener('click', this.boundColorHandler);
        });
    }

    /**
     * Színválasztó kattintás kezelése
     */
    _colorClickHandler(event) {
        const option = event.currentTarget;
        
        // Minden szín gombról eltávolítjuk a kijelölést
        document.querySelectorAll('.hmi-color-option').forEach(el => {
            el.classList.remove('ring-2', 'ring-blue-500');
        });
        
        // Kiválasztott szín kiemelése
        option.classList.add('ring-2', 'ring-blue-500');
        
        // Szín eltárolása
        this.selectedColor = option.dataset.color;
    }

    /**
     * Modal bezárása
     */
    close() {
        document.getElementById('hmiInputModal').classList.add('hidden');
    }

    /**
     * Mentés gomb kezelése (Új kategória vagy új hónap)
     */
    async save() {
        const val = document.getElementById('hmiInputValue').value.trim();
        if (!val) {
            this.app.hmiNotif.showToast('A mező nem lehet üres!', 'error');
            return;
        }

        if (this.modalType === 'item') {
            // === ÚJ KATEGÓRIA ===
            
            // Duplikáció ellenőrzés (kis- és nagybetű érzéketlen)
            const existing = this.app.items.items.some(i => 
                i.name.toLowerCase() === val.toLowerCase()
            );

            if (existing) {
                await this.app.hmiNotif.showConfirm({
                    title: 'Duplikált kategória',
                    message: `Már létezik "${val}" nevű kategória!`,
                    type: 'warning',
                    confirmText: 'Értem',
                    showCancel: false
                });
                return;
            }

            // Szín használata (a felhasználó által kiválasztott)
            const color = this.selectedColor || '#dbeafe';
            
            await this.app.items.add(val, color);
            await this.app.items.load();

            this.app.hmiNotif.showToast(`✅ "${val}" kategória létrehozva`, 'success');
            this.app.renderer.render();           // Táblázat frissítése

        } else if (this.modalType === 'month') {
            // === ÚJ HÓNAP ===
            
            // Formátum ellenőrzés (YYYY-MM)
            if (!/^\d{4}-\d{2}$/.test(val)) {
                this.app.hmiNotif.showToast('Hibás dátumformátum! (ÉÉÉÉ-HH)', 'error');
                return;
            }

            if (this.app.months.months.includes(val)) {
                await this.app.hmiNotif.showConfirm({
                    title: 'Hónap már létezik',
                    message: `A(z) ${val} periódus már nyitva van.`,
                    type: 'warning',
                    confirmText: 'Értem',
                    showCancel: false
                });
                return;
            }

            await this.app.months.add(val);
            await this.app.months.load();

            this.app.hmiNotif.showToast(`✅ ${val} hónap megnyitva`, 'success');
            this.app.renderer.render();           // Táblázat frissítése
        }
        this.app.refreshAllTabs();
        this.close();
    }

    /**
     * Takarítás (ha szükséges)
     */
    destroy() {
        document.querySelectorAll('.hmi-color-option').forEach(option => {
            option.removeEventListener('click', this.boundColorHandler);
        });
    }
}