// js/ui-modal-controller.js - Egységes üzenetkezelő

export class UIModalController {
    constructor() {
        this.toastContainer = document.getElementById('hmiToastContainer');
        this.modal = document.getElementById('globalConfirmModal');
    }

    // ==================== TOAST (NEM BLOKKOLÓ) ====================
    showToast(message, type = 'success', duration = 3000) {
        if (!this.toastContainer) return;
        
        const configs = {
            success: { bg: 'bg-emerald-500', icon: 'fa-check-circle', textColor: 'text-white' },
            error: { bg: 'bg-rose-500', icon: 'fa-exclamation-circle', textColor: 'text-white' },
            warning: { bg: 'bg-amber-500', icon: 'fa-triangle-exclamation', textColor: 'text-gray-900' },
            info: { bg: 'bg-blue-500', icon: 'fa-info-circle', textColor: 'text-white' }
        };

        const config = configs[type] || configs.info;
        
        const toast = document.createElement('div');
        toast.className = `${config.bg} ${config.textColor} px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-black uppercase tracking-wider pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 min-w-[250px] max-w-sm`;
        toast.innerHTML = `<i class="fas ${config.icon} text-sm"></i> <span>${message}</span>`;
        
        this.toastContainer.appendChild(toast);
        
        // Beúszás
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        });
        
        // Eltűnés
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-[-8px]');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ==================== BLOKKOLÓ MODAL ====================
    showConfirm(options) {
        return new Promise((resolve) => {
            const {
                title = 'Megerősítés',
                message = 'Biztosan folytatja?',
                type = 'warning', // 'warning' | 'danger' | 'info' | 'success'
                confirmText = 'Végrehajtás',
                cancelText = 'Mégse',
                showCancel = true,
                confirmButtonClass = ''
            } = options;

            if (!this.modal) return resolve(false);

            // Konfigurációk a típus alapján
            const configs = {
                danger: {
                    headerBg: 'bg-red-600',
                    headerText: 'text-white',
                    icon: 'fa-triangle-exclamation',
                    buttonBg: 'bg-red-600 hover:bg-red-700',
                    title: title || '⚠️ Veszélyes művelet'
                },
                warning: {
                    headerBg: 'bg-amber-500',
                    headerText: 'text-gray-950',
                    icon: 'fa-circle-exclamation',
                    buttonBg: 'bg-amber-500 hover:bg-amber-600',
                    title: title || '⚠️ Figyelmeztetés'
                },
                info: {
                    headerBg: 'bg-blue-500',
                    headerText: 'text-white',
                    icon: 'fa-circle-info',
                    buttonBg: 'bg-blue-500 hover:bg-blue-600',
                    title: title || 'ℹ️ Információ'
                },
                success: {
                    headerBg: 'bg-emerald-500',
                    headerText: 'text-white',
                    icon: 'fa-check-circle',
                    buttonBg: 'bg-emerald-500 hover:bg-emerald-600',
                    title: title || '✅ Sikeres'
                }
            };

            const config = configs[type] || configs.info;
            
            // UI elemek
            const header = document.getElementById('globalConfirmHeader');
            const icon = document.getElementById('globalConfirmIcon');
            const titleEl = document.getElementById('globalConfirmTitle');
            const msgEl = document.getElementById('globalConfirmMessage');
            const cancelBtn = document.getElementById('globalConfirmCancelBtn');
            const okBtn = document.getElementById('globalConfirmOkBtn');

            // Beállítások
            header.className = `${config.headerBg} p-5 ${config.headerText} flex items-center gap-3`;
            icon.className = `fas ${config.icon}`;
            titleEl.textContent = config.title;
            msgEl.textContent = message;
            okBtn.textContent = confirmText;
            okBtn.className = `flex-1 py-4 ${config.buttonBg} text-white hover:${config.buttonBg.split(' ')[0]} transition text-center font-black uppercase tracking-wider`;
            
            if (showCancel) {
                cancelBtn.classList.remove('hidden');
                cancelBtn.textContent = cancelText;
            } else {
                cancelBtn.classList.add('hidden');
            }

            // Megjelenítés
            this.modal.classList.remove('hidden');

            // Event listener-ek (egyszeri)
            const cleanup = () => {
                this.modal.classList.add('hidden');
                // Klónozás a duplikált listener-ek elkerülésére
                const newOk = okBtn.cloneNode(true);
                const newCancel = cancelBtn.cloneNode(true);
                okBtn.parentNode.replaceChild(newOk, okBtn);
                cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
                resolve(false);
            };

            const handleOk = () => {
                this.modal.classList.add('hidden');
                resolve(true);
            };

            const handleCancel = () => {
                this.modal.classList.add('hidden');
                resolve(false);
            };

            // Friss gombokra eseménykezelő
            document.getElementById('globalConfirmOkBtn').addEventListener('click', handleOk);
            document.getElementById('globalConfirmCancelBtn').addEventListener('click', handleCancel);
            
            // ESC billentyű
            const handleEscape = (e) => {
                if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                    handleCancel();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    // ==================== KÉNYSZERÍTETT BLOKKOLÁS (KRITIKUS) ====================
    showCritical(title, message) {
        return this.showConfirm({
            title,
            message,
            type: 'danger',
            confirmText: 'Értem',
            showCancel: false
        });
    }

    // ==================== SIKERES MEGERŐSÍTÉS ====================
    showSuccess(title, message) {
        return this.showConfirm({
            title,
            message,
            type: 'success',
            confirmText: 'Rendben',
            showCancel: false
        });
    }

    // ==================== INFORMÁCIÓS MEGERŐSÍTÉS ====================
    showInfo(title, message) {
        return this.showConfirm({
            title,
            message,
            type: 'info',
            confirmText: 'Értem',
            showCancel: false
        });
    }

    // ==================== FIGYELMEZTETŐ MEGERŐSÍTÉS ====================
    showWarning(title, message, confirmText = 'Folytatom') {
        return this.showConfirm({
            title,
            message,
            type: 'warning',
            confirmText,
            showCancel: true
        });
    }
}