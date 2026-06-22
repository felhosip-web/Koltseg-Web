// js/ui-modal-controller.js
export class UIModalController {
    constructor() {
        this.toastContainer = document.getElementById('hmiToastContainer');
    }

    showToast(message, type = 'success') {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        let bg = 'bg-emerald-500', icon = 'fa-check-circle';
        if (type === 'error') { bg = 'bg-rose-500'; icon = 'fa-exclamation-circle'; }
        if (type === 'info') { bg = 'bg-blue-500'; icon = 'fa-info-circle'; }

        toast.className = `${bg} text-white px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-black uppercase tracking-wider pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 min-w-[250px]`;
        toast.innerHTML = `<i class="fas ${icon} text-sm"></i> <span>${message}</span>`;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-[-8px]');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    async showConfirm(title, message, isWarning = true, actionText = 'Igen') {
        return new Promise((resolve) => {
            const modal = document.getElementById('globalConfirmModal');
            const header = document.getElementById('globalConfirmHeader');
            const icon = document.getElementById('globalConfirmIcon');
            const titleEl = document.getElementById('globalConfirmTitle');
            const msgEl = document.getElementById('globalConfirmMessage');
            const cancelBtn = document.getElementById('globalConfirmCancelBtn');
            const okBtn = document.getElementById('globalConfirmOkBtn');

            if (!modal) return resolve(false);

            titleEl.textContent = title;
            msgEl.textContent = message;
            okBtn.textContent = actionText;

            if (isWarning) {
                header.className = 'bg-red-600 p-5 text-white flex items-center gap-3';
                icon.className = 'fas fa-triangle-exclamation';
                okBtn.className = 'flex-1 py-4 bg-red-600 text-white hover:bg-red-700 transition text-center font-black uppercase tracking-wider';
                cancelBtn.classList.remove('hidden');
            } else {
                header.className = 'bg-amber-500 p-5 text-gray-950 flex items-center gap-3';
                icon.className = 'fas fa-circle-info';
                okBtn.className = 'flex-1 py-4 bg-amber-500 text-gray-950 hover:bg-amber-600 transition text-center font-black uppercase tracking-wider';
 //               cancelBtn.classList.add('hidden');
                // Ha showCancel = false, elrejtjük a Mégse gombot
                if (showCancel) {
                    cancelBtn.classList.remove('hidden');
                } else {
                    cancelBtn.classList.add('hidden');
                }
            }

            modal.classList.remove('hidden');
            const cleanUp = (result) => {
                modal.classList.add('hidden');
                okBtn.replaceWith(okBtn.cloneNode(true));
                cancelBtn.replaceWith(cancelBtn.cloneNode(true));
                resolve(result);
            };
            document.getElementById('globalConfirmOkBtn').addEventListener('click', () => cleanUp(true));
            document.getElementById('globalConfirmCancelBtn').addEventListener('click', () => cleanUp(false));
        });
    }
}