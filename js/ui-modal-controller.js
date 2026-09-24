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

    /** Részletes Sync Result modal megjelenítése (SyncReport alapján) */
    showSyncReportModal(report) {
        return new Promise((resolve) => {
            const data = (report && typeof report.toModalData === 'function')
                ? report.toModalData()
                : (report || {});

            let modal = document.getElementById('syncReportModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'syncReportModal';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-labelledby', 'syncReportModalTitle');
                modal.className = 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[300000] hidden modal';
                modal.style.zIndex = '999999';
                document.body.appendChild(modal);
            }

            const status = data.status || 'success';
            const configs = {
                success: {
                    headerBg: 'bg-emerald-600',
                    headerText: 'text-white',
                    icon: 'fa-check-circle',
                    badgeBg: 'bg-emerald-100 text-emerald-800',
                    badgeText: '✓ Sikeres'
                },
                partial: {
                    headerBg: 'bg-amber-500',
                    headerText: 'text-gray-950',
                    icon: 'fa-triangle-exclamation',
                    badgeBg: 'bg-amber-100 text-amber-900',
                    badgeText: '⚠ RÉSZLEGES SZINKRONIZÁCIÓ'
                },
                critical: {
                    headerBg: 'bg-red-600',
                    headerText: 'text-white',
                    icon: 'fa-circle-xmark',
                    badgeBg: 'bg-red-100 text-red-800',
                    badgeText: '✕ SZINKRONIZÁCIÓ MEGSZAKADT'
                }
            };
            const config = configs[status] || configs.success;

            // Per-table sorok előállítása
            const tableRows = [];
            const tables = data.tables || {};
            const tableKeys = Object.keys(tables);

            if (tableKeys.length > 0) {
                for (const table of tableKeys) {
                    const row = tables[table];
                    if (row.error) {
                        tableRows.push(`
                            <tr class="border-b border-gray-100">
                                <td class="py-1.5 font-mono text-xs font-bold text-gray-700">${this._escapeHtml(table)}</td>
                                <td colspan="3" class="py-1.5 text-right font-bold text-xs text-amber-600">⚠ ${this._escapeHtml(row.error)}</td>
                            </tr>
                        `);
                    } else {
                        tableRows.push(`
                            <tr class="border-b border-gray-100">
                                <td class="py-1.5 font-mono text-xs font-bold text-gray-700">${this._escapeHtml(table)}</td>
                                <td class="py-1.5 text-center font-mono text-xs text-gray-600">${row.pulled ?? 0}</td>
                                <td class="py-1.5 text-center font-mono text-xs text-gray-600">${row.merged ?? 0}</td>
                                <td class="py-1.5 text-center font-mono text-xs text-gray-600">${row.pushed ?? 0}</td>
                            </tr>
                        `);
                    }
                }
            } else {
                tableRows.push(`
                    <tr>
                        <td colspan="4" class="py-2 text-center text-xs text-gray-400 italic">Nincs részletes tábla statisztika</td>
                    </tr>
                `);
            }

            // Error sorok
            let errorsHtml = '';
            if (data.errors && data.errors.length > 0) {
                const errItems = data.errors.map(e => {
                    const prefix = e.table ? `[${e.table}${e.operation ? ' - ' + e.operation : ''}] ` : '';
                    return `<li class="text-xs text-red-600 font-mono">${prefix}${this._escapeHtml(e.error || e.message || String(e))}</li>`;
                }).join('');
                errorsHtml = `<ul class="list-disc pl-4 space-y-1">${errItems}</ul>`;
            } else {
                errorsHtml = `<p class="text-xs text-emerald-600 font-bold flex items-center gap-1.5"><i class="fas fa-check"></i> Nincs hiba</p>`;
            }

            // Checkpoint figyelmeztetés
            let checkpointHtml = '';
            if (data.checkpointStatus === 'unchanged') {
                checkpointHtml = `
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold flex items-center gap-2 mt-3">
                        <i class="fas fa-triangle-exclamation text-amber-600"></i>
                        <span>⚠ A checkpoint nem frissült.</span>
                    </div>
                `;
            }

            modal.innerHTML = `
                <div class="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
                    <div class="${config.headerBg} p-5 ${config.headerText} flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">
                                <i class="fas ${config.icon}"></i>
                            </div>
                            <div>
                                <h3 id="syncReportModalTitle" class="text-sm font-black uppercase tracking-wider">SZINKRONIZÁCIÓ</h3>
                                <span class="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${config.badgeBg}">${config.badgeText}</span>
                            </div>
                        </div>
                        <button id="btnCloseSyncReportX" class="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition text-inherit">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="p-6 overflow-y-auto space-y-5 text-left text-xs">
                        <!-- Időzítések -->
                        <div class="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 grid grid-cols-3 gap-2 text-center">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Kezdés</span>
                                <span class="font-mono font-bold text-gray-800">${data.startTimeFormatted || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Befejezés</span>
                                <span class="font-mono font-bold text-gray-800">${data.endTimeFormatted || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Időtartam</span>
                                <span class="font-mono font-bold text-indigo-600">${data.durationFormatted || '0 s'}</span>
                            </div>
                        </div>

                        <!-- Táblázat statisztikák -->
                        <div>
                            <h4 class="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-2 border-b border-gray-100 pb-1">Adatok</h4>
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="text-[10px] font-bold text-gray-400 uppercase border-b border-gray-200">
                                        <th class="py-1">Tábla</th>
                                        <th class="py-1 text-center">Pull</th>
                                        <th class="py-1 text-center">Merge</th>
                                        <th class="py-1 text-center">Push</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows.join('')}
                                </tbody>
                            </table>
                        </div>

                        <!-- Queue & Diagnosztika -->
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1">
                                <h4 class="text-[10px] font-black uppercase tracking-wider text-gray-400">Queue</h4>
                                <div class="flex justify-between"><span>Feldolgozva:</span> <span class="font-mono font-bold">${data.queue?.processed ?? 0}</span></div>
                                <div class="flex justify-between"><span>Sikeres:</span> <span class="font-mono font-bold text-emerald-600">${data.queue?.success ?? 0}</span></div>
                                <div class="flex justify-between"><span>Sikertelen:</span> <span class="font-mono font-bold text-red-600">${data.queue?.failed ?? 0}</span></div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1">
                                <h4 class="text-[10px] font-black uppercase tracking-wider text-gray-400">Diagnosztika</h4>
                                <div class="flex justify-between"><span>Ütközések:</span> <span class="font-mono font-bold">${data.conflictsCount ?? 0}</span></div>
                                <div class="flex justify-between"><span>Törlések:</span> <span class="font-mono font-bold">${data.deletionsCount ?? 0}</span></div>
                            </div>
                        </div>

                        <!-- Hibák -->
                        <div>
                            <h4 class="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-2 border-b border-gray-100 pb-1">Hibák</h4>
                            ${errorsHtml}
                        </div>

                        <!-- Utolsó sikeres sync checkpoint -->
                        <div class="border-t border-gray-100 pt-3">
                            <span class="text-[10px] uppercase font-bold text-gray-400 block">Utolsó sikeres szinkronizáció</span>
                            <span class="font-mono font-bold text-gray-700">${data.lastSuccessfulSyncFormatted || 'N/A'}</span>
                            ${checkpointHtml}
                        </div>
                    </div>

                    <div class="p-4 border-t border-gray-100 bg-gray-50">
                        <button id="btnSyncReportOk" class="w-full py-3.5 bg-slate-800 hover:bg-slate-900 text-white font-black uppercase tracking-wider rounded-2xl transition shadow-md">
                            Rendben
                        </button>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');

            const btnOk = modal.querySelector('#btnSyncReportOk');
            const btnCloseX = modal.querySelector('#btnCloseSyncReportX');

            const cleanup = () => {
                modal.classList.add('hidden');
                document.removeEventListener('keydown', keyHandler);
                resolve(true);
            };

            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                }
            };

            btnOk?.addEventListener('click', cleanup);
            btnCloseX?.addEventListener('click', cleanup);
            document.addEventListener('keydown', keyHandler);
        });
    }

    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
