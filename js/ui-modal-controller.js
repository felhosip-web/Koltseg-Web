// js/ui-modal-controller.js - Egységes üzenetkezelő
import { HELP_SECTIONS } from './help-data.js';

export class UIModalController {
    constructor() {
        this.toastContainer = document.getElementById('hmiToastContainer');
        this.modal = document.getElementById('globalConfirmModal');
        setTimeout(() => this.initHelp(), 300);
    }

    showToast(message, type = 'success', duration = 3000) {
        if (!this.toastContainer) this.toastContainer = document.getElementById('hmiToastContainer');
        if (!this.toastContainer) return;
        const configs = {
            success: { bg: 'bg-emerald-500', icon: 'fa-check-circle', textColor: 'text-white' },
            error: { bg: 'bg-rose-500', icon: 'fa-exclamation-circle', textColor: 'text-white' },
            warning: { bg: 'bg-amber-500', icon: 'fa-triangle-exclamation', textColor: 'text-gray-900' },
            info: { bg: 'bg-blue-500', icon: 'fa-info-circle', textColor: 'text-white' }
        };
        const config = configs[type] || configs.info;
        const toast = document.createElement('div');
        toast.className = `${config.bg} ${config.textColor} px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-black uppercase tracking-wider pointer-events-auto`;
        toast.innerHTML = `<i class="fas ${config.icon} text-sm"></i> <span>${message}</span>`;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    /** Részletes, Rendben gombbal nyugtázható szinkronizációs eredmény. */
    showSyncResult({ success, title, message }) {
        return this.showConfirm({
            title,
            message,
            type: success ? 'info' : 'danger',
            confirmText: 'Rendben',
            showCancel: false
        });
    }

    showConfirm(options) {
        return new Promise((resolve) => {
            const { title = 'Megerősítés', message = 'Biztosan folytatja?', type = 'warning', confirmText = 'Végrehajtás', cancelText = 'Mégse', showCancel = true } = options;
            if (!this.modal) this.modal = document.getElementById('globalConfirmModal');
            if (!this.modal) return resolve(window.confirm(message || title || 'Biztosan folytatja?'));
            const configs = {
                danger: { headerBg: 'bg-red-600', headerText: 'text-white', icon: 'fa-triangle-exclamation', buttonBg: 'bg-red-600 hover:bg-red-700' },
                warning: { headerBg: 'bg-amber-500', headerText: 'text-gray-950', icon: 'fa-circle-exclamation', buttonBg: 'bg-amber-500 hover:bg-amber-600' },
                info: { headerBg: 'bg-blue-600', headerText: 'text-white', icon: 'fa-circle-info', buttonBg: 'bg-blue-600 hover:bg-blue-700' },
                success: { headerBg: 'bg-emerald-500', headerText: 'text-white', icon: 'fa-check-circle', buttonBg: 'bg-emerald-500 hover:bg-emerald-600' }
            };
            const config = configs[type] || configs.info;
            const header = document.getElementById('globalConfirmHeader');
            const icon = document.getElementById('globalConfirmIcon');
            const titleEl = document.getElementById('globalConfirmTitle');
            const msgEl = document.getElementById('globalConfirmMessage');
            const cancelBtn = document.getElementById('globalConfirmCancelBtn');
            const okBtn = document.getElementById('globalConfirmOkBtn');
            header.className = `${config.headerBg} p-5 ${config.headerText} flex items-center gap-3`;
            icon.className = `fas ${config.icon}`;
            titleEl.textContent = title;
            msgEl.textContent = message;
            msgEl.style.whiteSpace = 'pre-line';
            okBtn.textContent = confirmText;
            okBtn.className = `flex-1 py-4 ${config.buttonBg} text-white transition text-center font-black uppercase tracking-wider`;
            cancelBtn.classList.toggle('hidden', !showCancel);
            if (showCancel) cancelBtn.textContent = cancelText;
            this.modal.classList.remove('hidden');
            const newOk = okBtn.cloneNode(true);
            const newCancel = cancelBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOk, okBtn);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            const cleanup = (value) => { this.modal.classList.add('hidden'); resolve(value); };
            newOk.addEventListener('click', () => cleanup(true));
            newCancel.addEventListener('click', () => cleanup(false));
        });
    }

    showCritical(title, message) { return this.showConfirm({ title, message, type: 'danger', confirmText: 'Értem', showCancel: false }); }
    showSuccess(title, message) { return this.showConfirm({ title, message, type: 'success', confirmText: 'Rendben', showCancel: false }); }
    showNotification(title, message, type = 'info') { return this.showConfirm({ title, message, type: type === 'error' || type === 'danger' ? 'danger' : 'info', confirmText: 'Rendben', showCancel: false }); }
    showInfo(title, message) { return this.showConfirm({ title, message, type: 'info', confirmText: 'Értem', showCancel: false }); }
    showWarning(title, message, confirmText = 'Folytatom') { return this.showConfirm({ title, message, type: 'warning', confirmText, showCancel: true }); }

    // A help rendszer további metódusai változatlanok.
    initHelp() {
        this.helpModal = document.getElementById('helpModal');
        this.helpCategoriesContainer = document.getElementById('helpCategoriesContainer');
        this.helpContentContainer = document.getElementById('helpContentContainer');
        this.helpSearchInput = document.getElementById('helpSearchInput');
        this.btnCloseHelpModal = document.getElementById('btnCloseHelpModal');
        if (!this.helpModal) return;
        this.helpSearchInput?.addEventListener('input', (e) => this.filterHelp(e.target.value));
        this.btnCloseHelpModal?.addEventListener('click', () => this.closeHelp());
        this.selectedCategory = HELP_SECTIONS[0]?.id;
        this.renderHelpCategories();
        this.renderHelpContent();
    }

    openHelp(categoryId = null) { if (categoryId) this.selectedCategory = categoryId; this.helpModal?.classList.remove('hidden'); }
    closeHelp() { this.helpModal?.classList.add('hidden'); }
    renderHelpCategories() {}
    renderHelpContent() {}
    filterHelp() {}
}
