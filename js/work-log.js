// js/work-log.js - v5.2.0 - Munka nyilvántartó modul (UUID)
import { UIModalController } from './ui-modal-controller.js';
import { generateUUID } from './uuid-utils.js';

export class WorkLogManager {
    constructor(db, syncService) {
        this.db = db;
        this.syncService = syncService;
        this.works = [];
    }

    /**
     * Load all works from database
     */
    async load() {
        this.works = await this.db.getAll('works') || [];
        // Sort works by created_at timestamp (newer first for display, but keep stable order)
        this.works.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        return this.works;
    }

    /**
     * Save a work log entry
     */
    async save(work) {
        if (!work.id) {
            // New entry - generate UUID
            work.id = generateUUID();
            work.created_at = new Date().toISOString();
        }
        work.updated_at = new Date().toISOString();
        
        await this.db.save('works', work);
        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', work);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a felhőbe szinkronizálni:', err);
            }
        }
        return work;
    }

    /**
     * Delete a work log entry
     */
    async delete(id) {
        await this.db.delete('works', id);
        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', id, true);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a törlést felhőbe szinkronizálni:', err);
            }
        }
    }
}

export class WorkLogRenderer {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
        this.modalController = app.hmiNotif || new UIModalController();
        this.initListeners();
    }

    /**
     * Initialize event listeners
     */
    initListeners() {
        // "Új munka felvitele" button
        const btnNewWork = document.getElementById('btnNewWork');
        if (btnNewWork) {
            btnNewWork.addEventListener('click', () => this.openModal());
        }

        // React owns the editor controls when its mount point is present.
        if (document.getElementById('workAppEditorRoot')) return;

        // Close modal buttons
        const btnCloseWorkModalX = document.getElementById('btnCloseWorkModalX');
        if (btnCloseWorkModalX) {
            btnCloseWorkModalX.addEventListener('click', () => this.closeModal());
        }

        const btnCancelWorkModal = document.getElementById('btnCancelWorkModal');
        if (btnCancelWorkModal) {
            btnCancelWorkModal.addEventListener('click', () => this.closeModal());
        }

        // Form submission
        const workForm = document.getElementById('workForm');
        if (workForm) {
            workForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Delete button inside modal
        const btnDeleteWork = document.getElementById('btnDeleteWork');
        if (btnDeleteWork) {
            btnDeleteWork.addEventListener('click', () => this.handleDeleteWork());
        }
    }

    /**
     * Render the whole Work Log UI
     */
    async render() {
        await this.manager.load();
        this.renderTable();
        this.updateKpis();
    }

    /**
     * Render the table of works
     */
    renderTable() {
        window.dispatchEvent(new Event('app-data-updated'));
    }

    /**
     * Update KPI counter cards
     */
    updateKpis() {
        window.dispatchEvent(new Event('app-data-updated'));
    }

    /**
     * Open Editor Modal (Create or Edit mode)
     */
    openModal(id = null) {
        const modal = document.getElementById('workEditorModal');
        if (!modal) return;

        const title = document.getElementById('workEditorTitle');
        const idInput = document.getElementById('workIdInput');
        const nameInput = document.getElementById('workNameInput');
        const descInput = document.getElementById('workDescriptionInput');
        const locInput = document.getElementById('workLocationInput');
        const dateInput = document.getElementById('workDateInput');
        const durInput = document.getElementById('workDurationInput');
        const statusInput = document.getElementById('workStatusInput');
        const btnDelete = document.getElementById('btnDeleteWork');

        // Reset form
        document.getElementById('workForm').reset();

        if (id) {
            // EDIT MODE
            const work = this.manager.works.find(w => String(w.id) === String(id));
            if (!work) return;

            if (title) title.innerText = 'Munka bejegyzés szerkesztése';
            if (idInput) idInput.value = work.id;
            if (nameInput) nameInput.value = work.name || '';
            if (descInput) descInput.value = work.description || '';
            if (locInput) locInput.value = work.location || '';
            if (dateInput) dateInput.value = work.date || '';
            if (durInput) durInput.value = work.duration || 1;
            if (statusInput) statusInput.value = work.status || 'folyamatban';
            if (btnDelete) btnDelete.classList.remove('hidden');
        } else {
            // CREATE MODE
            if (title) title.innerText = 'Új munka rögzítése';
            if (idInput) idInput.value = '';
            
            // Default date is today in local time zone
            if (dateInput) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.value = today;
            }
            if (durInput) durInput.value = 1;
            if (statusInput) statusInput.value = 'folyamatban';
            if (btnDelete) btnDelete.classList.add('hidden');
        }


        // Instead of classList removal, trigger custom event for React Modal
        const reactRoot = document.getElementById('workAppEditorRoot');
        if (reactRoot) {
            reactRoot.dispatchEvent(new CustomEvent('work-editor-open'));
        } else {
            modal.classList.remove('hidden');
        }
    }

    /**
     * Close Editor Modal
     */
    closeModal() {
        const modal = document.getElementById('workEditorModal');
        if (modal) {

            // Instead of classList addition, trigger custom event for React Modal
            const reactRoot = document.getElementById('workAppEditorRoot');
            if (reactRoot) {
                reactRoot.dispatchEvent(new CustomEvent('work-editor-close'));
            } else {
                modal.classList.add('hidden');
            }
        }
    }

    /**
     * Handle Form Submission (Save Work)
     */
    async handleFormSubmit(e) {
        e.preventDefault();
        console.log('[WorkLog] handleFormSubmit elindult...');

        const idInput = document.getElementById('workIdInput');
        const nameInput = document.getElementById('workNameInput');
        const descInput = document.getElementById('workDescriptionInput');
        const locInput = document.getElementById('workLocationInput');
        const dateInput = document.getElementById('workDateInput');
        const durInput = document.getElementById('workDurationInput');
        const statusInput = document.getElementById('workStatusInput');

        if (!nameInput || !dateInput) {
            console.error('[WorkLog] Szükséges beviteli mezők hiányoznak!');
            this.modalController.showToast('❌ Hiba: Hiányzó űrlap elemek!', 'error');
            return;
        }

        const nameValue = (nameInput.value || '').trim();
        if (!nameValue) {
            this.modalController.showToast('⚠️ Kérjük, adja meg a munka nevét!', 'warning');
            return;
        }

        const workData = {
            name: nameValue,
            description: (descInput ? descInput.value : '').trim(),
            location: (locInput ? locInput.value : '').trim(),
            date: dateInput.value,
            duration: Number(durInput ? durInput.value : 1) || 1,
            status: statusInput ? statusInput.value : 'folyamatban'
        };

        if (idInput && idInput.value) {
            workData.id = idInput.value; // UUID string
        }

        console.log('[WorkLog] Mentendő adatok:', workData);

        try {
            await this.manager.save(workData);
            console.log('[WorkLog] Mentés sikeres az adatbázisban.');
            this.renderTable();
            this.updateKpis();
            this.closeModal();

            // Notify user
            this.modalController.showToast('✅ Munka bejegyzés sikeresen mentve!', 'success');
        } catch (err) {
            console.error('[WorkLog] Hiba a mentés során:', err);
            this.modalController.showToast('❌ Hiba történt a mentés során: ' + err.message, 'error');
        }
    }

    /**
     * Handle deletion of work entry
     */
    async handleDeleteWork() {
        console.log('[WorkLog] handleDeleteWork elindult...');
        const idInput = document.getElementById('workIdInput');
        if (!idInput || !idInput.value) {
            console.warn('[WorkLog] Nincs kiválasztott munka azonosító a törléshez!');
            return;
        }

        const id = idInput.value; // UUID string

        // Use custom confirmation modal instead of standard confirm() which is blocked in iFrames
        const confirmed = await this.modalController.showConfirm({
            title: '⚠️ Törlés megerősítése',
            message: 'Biztosan törölni szeretné ezt a munka bejegyzést?',
            type: 'danger',
            confirmText: 'Törlés',
            cancelText: 'Mégse'
        });
        
        console.log('[WorkLog] Törlés megerősítve:', confirmed);
        if (!confirmed) return;

        try {
            await this.manager.delete(id);
            console.log('[WorkLog] Bejegyzés törölve az adatbázisból:', id);
            this.renderTable();
            this.updateKpis();
            this.closeModal();

            // Notify user
            this.modalController.showToast('🗑️ Munka bejegyzés sikeresen törölve!', 'success');
        } catch (err) {
            console.error('[WorkLog] Hiba a törlés során:', err);
            this.modalController.showToast('❌ Hiba történt a törlés során: ' + err.message, 'error');
        }
    }

    /**
     * Helper to escape HTML characters safely
     */
    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
