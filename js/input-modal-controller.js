// js/input-modal-controller.js
// Input Modal Controller - Új kategória és új hónap létrehozása

export class InputModalController {
    constructor(app) {
        this.app = app;
        this.modalType = null;
    }

    open(type) {
        this.modalType = type;
        this._dispatchOpen({ type });
    }

    openRename(itemId, currentName) {
        this.modalType = 'rename';
        this._dispatchOpen({ type: 'rename', itemId, currentName });
    }

    _dispatchOpen(detail) {
        const event = new CustomEvent('hmi-input-open', { detail });
        const root = document.getElementById('costAppHmiInputRoot');
        if (root) root.dispatchEvent(event);
        document.dispatchEvent(event);
    }

    async performSave(type, val, color) {
        this.modalType = type;
        const value = typeof val === 'string' ? val.trim() : '';
        if (!value) {
            this.app.hmiNotif.showToast('A mező nem lehet üres!', 'error');
            return false;
        }

        if (this.modalType === 'item') {
            // === ÚJ KATEGÓRIA ===
            
            // Duplikáció ellenőrzés (kis- és nagybetű érzéketlen)
            const existing = this.app.items.items.some(i => 
                i.name.toLowerCase() === value.toLowerCase()
            );

            if (existing) {
                await this.app.hmiNotif.showConfirm({
                    title: 'Duplikált kategória',
                    message: `Már létezik "${value}" nevű kategória!`,
                    type: 'warning',
                    confirmText: 'Értem',
                    showCancel: false
                });
                return false;
            }

            // Szín használata (a felhasználó által kiválasztott)
            const finalColor = this._normalizeColor(color || '#dbeafe');
            
            await this.app.items.add(value, finalColor);
            await this.app.items.load();

            this.app.hmiNotif.showToast(`✅ "${value}" kategória létrehozva`, 'success');
            this.app.renderer.renderTable();           // Táblázat frissítése

        } else if (this.modalType === 'month') {
            // === ÚJ HÓNAP ===
            
            // Formátum ellenőrzés (YYYY-MM)
            if (!/^\d{4}-\d{2}$/.test(value) || Number.isNaN(new Date(value + '-01').getTime())) {
                this.app.hmiNotif.showToast('Hibás dátumformátum! (ÉÉÉÉ-HH)', 'error');
                return false;
            }

            if (this.app.months.months.includes(value)) {
                await this.app.hmiNotif.showConfirm({
                    title: 'Hónap már létezik',
                    message: `A(z) ${value} periódus már nyitva van.`,
                    type: 'warning',
                    confirmText: 'Értem',
                    showCancel: false
                });
                return false;
            }

            await this.app.months.add(value);
            await this.app.months.load();

            this.app.hmiNotif.showToast(`✅ ${value} hónap megnyitva`, 'success');
            this.app.renderer.renderTable();           // Táblázat frissítése
        } else {
            return false;
        }
        this.app.refreshAllTabs();
        return true;
    }

    async performRename(itemId, val) {
        const newName = typeof val === 'string' ? val.trim() : '';
        const item = this.app.items.items.find(({ id }) => String(id) === String(itemId));

        if (!newName || newName === item?.name) return true;

        try {
            await this.app.items.update(itemId, { name: newName });
            await this.app.items.load();
            this.app.renderer.renderTable();
            this.app.hmiNotif.showToast('Kategória átnevezve!', 'success');
        } catch (err) {
            console.error(err);
            this.app.hmiNotif.showToast('Hiba az átnevezés során!', 'error');
        }

        return true;
    }

    _normalizeColor(color) {
        if (!color || typeof color !== 'string') return '#dbeafe';
        const normalized = color.trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) return normalized;
        if (/^rgba?\(/i.test(normalized) || /^hsla?\(/i.test(normalized)) return normalized;
        return '#dbeafe';
    }
}
