export class ModalManager {
    constructor(app) {
        this.app = app;
        this.activeModals = [];
        this._injectStyles();
        this._bindGlobalEvents();
        // A DOM elemek még nem biztos, hogy léteznek, ha a konstruktor korán fut, 
        // de az init meghívásával biztosak lehetünk benne.
        document.addEventListener('DOMContentLoaded', () => this._setupModals());
        // Ha már betöltött, rögtön hívjuk:
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            this._setupModals();
        }
    }

    _injectStyles() {
        if (document.getElementById('hmi-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'hmi-modal-styles';
        style.textContent = `
            .hmi-modal-backdrop {
                transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                opacity: 0;
                display: none;
            }
            .hmi-modal-backdrop.modal-show {
                opacity: 1;
                display: flex !important;
            }
            .hmi-modal-content {
                transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                transform: scale(0.95) translateY(10px);
                opacity: 0;
            }
            .hmi-modal-backdrop.modal-show .hmi-modal-content {
                transform: scale(1) translateY(0);
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    _setupModals() {
        if (this._setupDone) return;
        
        const modalIds = [
            'dbAuditModal', 'workEditorModal', 'cellEditorModal', 
            'hmiInputModal', 'globalConfirmModal', 'editReminderModal', 
            'syncModal', 'conflictModal', 'helpModal'
        ];

        let foundAny = false;

        modalIds.forEach(id => {
            const modal = document.getElementById(id);
            if (!modal) return;
            foundAny = true;
            
            // Add base animation classes
            modal.classList.add('hmi-modal-backdrop');
            // Biztosítjuk, hogy ne 'hidden' legyen, mert mi display: none-al operálunk
            modal.classList.remove('hidden');
            
            const content = modal.firstElementChild;
            if (content) {
                content.classList.add('hmi-modal-content');
            }

            // Click outside to close
            modal.addEventListener('mousedown', (e) => {
                if (e.target === modal) {
                    this.close(id);
                }
            });
            
            // Hijack classList add/remove hogy lekezeljük a 'hidden' manipulációkat
            const originalRemove = modal.classList.remove.bind(modal.classList);
            const originalAdd = modal.classList.add.bind(modal.classList);
            
            modal.classList.remove = (...args) => {
                if (args.includes('hidden')) {
                    this.open(id);
                } else {
                    originalRemove(...args);
                }
            };

            modal.classList.add = (...args) => {
                if (args.includes('hidden')) {
                    this.close(id);
                } else {
                    originalAdd(...args);
                }
            };
        });

        if (foundAny) this._setupDone = true;
    }

    _bindGlobalEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModals.length > 0) {
                const topModalId = this.activeModals[this.activeModals.length - 1];
                this.close(topModalId);
            }
        });
    }

    open(modalId) {
        if (!this._setupDone) this._setupModals();
        
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        modal.style.display = 'flex';
        void modal.offsetWidth; // Reflow for animation

        modal.classList.add('modal-show');

        if (!this.activeModals.includes(modalId)) {
            this.activeModals.push(modalId);
        }
    }

    close(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.remove('modal-show');

        setTimeout(() => {
            if (!modal.classList.contains('modal-show')) {
                modal.style.display = 'none';
            }
        }, 250);

        this.activeModals = this.activeModals.filter(id => id !== modalId);
    }

    isOpen(modalId) {
        return this.activeModals.includes(modalId);
    }
}
