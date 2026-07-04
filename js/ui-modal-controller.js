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
            const removeEscapeListener = () => {
                document.removeEventListener('keydown', handleEscape);
            };

            const cleanup = () => {
                this.modal.classList.add('hidden');
                // Klónozás a duplikált listener-ek elkerülésére
                const newOk = okBtn.cloneNode(true);
                const newCancel = cancelBtn.cloneNode(true);
                okBtn.parentNode.replaceChild(newOk, okBtn);
                cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
                removeEscapeListener();
                resolve(false);
            };

            const handleOk = () => {
                this.modal.classList.add('hidden');
                removeEscapeListener();
                resolve(true);
            };

            const handleCancel = () => {
                this.modal.classList.add('hidden');
                removeEscapeListener();
                resolve(false);
            };

            // Friss gombokra eseménykezelő
            document.getElementById('globalConfirmOkBtn').addEventListener('click', handleOk);
            document.getElementById('globalConfirmCancelBtn').addEventListener('click', handleCancel);
            
            // ESC billentyű
            const handleEscape = (e) => {
                if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                    handleCancel();
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
    
/**
 * Select modal megjelenítése
 */
showSelectModal(options) {
    return new Promise((resolve) => {
        const { title, options: items, placeholder = 'Válassz...' } = options;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-2xl">
                <h3 class="text-lg font-bold text-gray-800 mb-4">${title}</h3>
                <select id="selectModalSelect" class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">${placeholder}</option>
                    ${items.map(item => `<option value="${this._escapeHtml(item)}">${this._escapeHtml(item)}</option>`).join('')}
                </select>
                <div class="flex gap-2 mt-4">
                    <button id="selectModalCancel" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition">Mégse</button>
                    <button id="selectModalConfirm" class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">Kiválaszt</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const select = modal.querySelector('#selectModalSelect');
        const confirmBtn = modal.querySelector('#selectModalConfirm');
        const cancelBtn = modal.querySelector('#selectModalCancel');

        const close = (result) => {
            modal.remove();
            resolve(result);
        };

        confirmBtn.addEventListener('click', () => {
            const value = select.value;
            close(value || null);
        });

        cancelBtn.addEventListener('click', () => close(null));

        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        });

        // Fókusz
        setTimeout(() => select.focus(), 100);
    });
}  

/**
 * Input modal (bővítve)
 */
showInputModal(options) {
    return new Promise((resolve) => {
        const { 
            title, label, value = '', placeholder = '', 
            inputType = 'text', confirmText = 'Mentés', 
            onConfirm = null 
        } = options;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-2xl">
                <h3 class="text-lg font-bold text-gray-800 mb-1">${title}</h3>
                <p class="text-sm text-gray-500 mb-4">${label}</p>
                <input type="${inputType}" id="inputModalValue" 
                       class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                       value="${this._escapeHtml(String(value))}" 
                       placeholder="${this._escapeHtml(placeholder)}" />
                <div class="flex gap-2 mt-4">
                    <button id="inputModalCancel" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition">Mégse</button>
                    <button id="inputModalConfirm" class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#inputModalValue');
        const confirmBtn = modal.querySelector('#inputModalConfirm');
        const cancelBtn = modal.querySelector('#inputModalCancel');

        const close = (result) => {
            modal.remove();
            resolve(result);
        };

        confirmBtn.addEventListener('click', () => {
            const val = input.value.trim();
            if (onConfirm) {
                onConfirm(val);
            }
            close(val || null);
        });

        cancelBtn.addEventListener('click', () => close(null));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        });

        setTimeout(() => input.focus(), 100);
        if (inputType !== 'date') input.select();
    });
}

_escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
  
}