// js/ui-modal-controller.js - Egységes üzenetkezelő
import { HELP_SECTIONS } from './help-data.js';

export class UIModalController {
    constructor() {
        this.toastContainer = document.getElementById('hmiToastContainer');
        this.modal = document.getElementById('globalConfirmModal');
        setTimeout(() => this.initHelp(), 300);
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

    // ==================== ÁLTALÁNOS ÉRTESÍTÉS METÓDUS ====================
    showNotification(title, message, type = 'info') {
        const mappedType = type === 'error' || type === 'danger' ? 'danger' : (type === 'success' ? 'success' : 'info');
        return this.showConfirm({
            title,
            message,
            type: mappedType,
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

_playChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // Első hang (magasabb)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        gain1.gain.setValueAtTime(0.15, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        
        // Második hang (még magasabb)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc1.start();
        osc1.stop(ctx.currentTime + 1.2);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 1.2);
    } catch (e) {
        console.log('Audio chime error:', e);
    }
}

showSimulatedPushNotification(title, body) {
    if (!this.toastContainer) return;
    
    // Csengő hang lejátszása
    this._playChime();
    
    const card = document.createElement('div');
    // Gyönyörű üveghatású natív iOS/macOS push kártya stílus
    card.className = "bg-white/95 backdrop-blur-md border border-slate-200 text-slate-800 p-4 rounded-2xl shadow-xl pointer-events-auto flex gap-3 transform translate-y-[-20px] opacity-0 transition-all duration-500 ease-out min-w-[320px] max-w-sm relative overflow-hidden";
    
    card.innerHTML = `
        <div class="flex-shrink-0 w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-lg shadow-inner">
            <i class="fas fa-bell animate-bounce"></i>
        </div>
        <div class="flex-1 text-left">
            <div class="flex items-center justify-between gap-2 mb-1">
                <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Költségnyilvántartó</span>
                <span class="text-[9px] text-gray-400">most</span>
            </div>
            <h4 class="text-xs font-bold text-gray-900 leading-snug">${title}</h4>
            <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">${body}</p>
        </div>
        <button class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-sm font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 transition">&times;</button>
    `;
    
    // Bezáró gomb működése
    const closeBtn = card.querySelector('button');
    closeBtn.onclick = () => {
        card.classList.add('opacity-0', 'translate-x-12');
        setTimeout(() => card.remove(), 500);
    };
    
    this.toastContainer.appendChild(card);
    
    // Animált beúszás
    requestAnimationFrame(() => {
        card.classList.remove('translate-y-[-20px]', 'opacity-0');
    });
    
    // 5 másodperc múlva automatikusan eltűnik
    setTimeout(() => {
        if (card.parentNode) {
            card.classList.add('opacity-0', 'translate-y-[-20px]');
            setTimeout(() => card.remove(), 500);
        }
    }, 5000);
}

    // ==================== DYNAMIC HELP SYSTEM METHODS ====================
    initHelp() {
        this.helpModal = document.getElementById('helpModal');
        this.helpCategoriesContainer = document.getElementById('helpCategoriesContainer');
        this.helpContentContainer = document.getElementById('helpContentContainer');
        this.helpSearchInput = document.getElementById('helpSearchInput');
        this.btnCloseHelpModal = document.getElementById('btnCloseHelpModal');
        this.btnHelp = document.getElementById('btnHelp');
        this.btnHelpInline = document.getElementById('btnHelpInline');

        if (!this.helpModal) return;

        // Eseménykezelők
        this.btnHelp?.addEventListener('click', () => this.openHelp());
        this.btnHelpInline?.addEventListener('click', () => this.openHelp());
        this.btnCloseHelpModal?.addEventListener('click', () => this.closeHelp());
        this.helpSearchInput?.addEventListener('input', (e) => this.filterHelp(e.target.value));

        // Bezárás külső kattintásra
        this.helpModal.addEventListener('click', (e) => {
            if (e.target === this.helpModal) this.closeHelp();
        });

        // Alapértelmezett kategória kiválasztása
        this.selectedCategory = HELP_SECTIONS[0]?.id;
        
        // Első render
        this.renderHelpCategories();
        this.renderHelpContent();
    }

    openHelp() {
        if (!this.helpModal) return;
        this.helpModal.classList.remove('hidden');
        // Animáció indítása
        const box = this.helpModal.querySelector('.bg-white');
        setTimeout(() => {
            box?.classList.remove('scale-95', 'opacity-0');
            box?.classList.add('scale-100', 'opacity-100');
        }, 10);
    }

    closeHelp() {
        if (!this.helpModal) return;
        const box = this.helpModal.querySelector('.bg-white');
        box?.classList.remove('scale-100', 'opacity-100');
        box?.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            this.helpModal.classList.add('hidden');
        }, 300);
    }

    renderHelpCategories() {
        if (!this.helpCategoriesContainer) return;
        this.helpCategoriesContainer.innerHTML = '';

        HELP_SECTIONS.forEach(section => {
            const btn = document.createElement('button');
            const isActive = section.id === this.selectedCategory;
            btn.className = `w-full text-left p-3.5 rounded-2xl transition-all flex items-center gap-3 border ${
                isActive 
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' 
                    : 'bg-white border-slate-200/60 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
            }`;
            
            btn.innerHTML = `
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                    isActive ? 'bg-white/25 text-white' : 'bg-indigo-50 text-indigo-600'
                }">
                    <i class="${section.icon}"></i>
                </div>
                <div class="flex-1 text-left min-w-0">
                    <div class="text-xs font-bold leading-tight truncate">${section.title}</div>
                    <div class="text-[9px] mt-0.5 ${isActive ? 'text-indigo-100' : 'text-slate-400'}">${section.articles.length} cikk</div>
                </div>
            `;
            
            btn.addEventListener('click', () => {
                this.selectedCategory = section.id;
                this.renderHelpCategories();
                this.renderHelpContent();
            });
            this.helpCategoriesContainer.appendChild(btn);
        });

        // Plus fixed Developer & Service Panel triggers at the bottom of categories
        const devDiv = document.createElement('div');
        devDiv.className = 'pt-4 border-t border-dashed border-slate-200 mt-4 space-y-2';
        
        // Button 1: Debug Panel / Hibakereső
        const debugBtn = document.createElement('button');
        debugBtn.id = 'helpOpenDevPanelBtn';
        debugBtn.className = 'w-full text-left p-3 rounded-2xl transition-all flex items-center gap-3 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700';
        debugBtn.innerHTML = `
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 bg-white shadow-sm">
                <i class="fas fa-bug text-rose-500"></i>
            </div>
            <div class="flex-1 text-left min-w-0">
                <div class="text-xs font-black leading-tight uppercase tracking-wider">HMI Hibakereső (Debug)</div>
                <div class="text-[9px] mt-0.5 text-slate-400">Séma másolás, értesítés tesztek</div>
            </div>
        `;
        debugBtn.addEventListener('click', () => {
            this.closeHelp();
        });
        devDiv.appendChild(debugBtn);

        // Button 2: Service Panel / Fejlesztői Menü
        const serviceBtn = document.createElement('button');
        serviceBtn.id = 'helpOpenServicePanelBtn';
        serviceBtn.className = 'w-full text-left p-3 rounded-2xl transition-all flex items-center gap-3 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-700';
        serviceBtn.innerHTML = `
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 bg-white shadow-sm">
                <i class="fas fa-tools text-emerald-600"></i>
            </div>
            <div class="flex-1 text-left min-w-0">
                <div class="text-xs font-black leading-tight uppercase tracking-wider">Fejlesztői & Szerviz Panel</div>
                <div class="text-[9px] mt-0.5 text-slate-400">Diagnosztika, platform adatok, naplók</div>
            </div>
        `;
        serviceBtn.addEventListener('click', () => {
            this.closeHelp();
        });
        devDiv.appendChild(serviceBtn);

        this.helpCategoriesContainer.appendChild(devDiv);
    }

    renderHelpContent(filterKeyword = '') {
        if (!this.helpContentContainer) return;
        this.helpContentContainer.innerHTML = '';

        const keyword = filterKeyword.toLowerCase().trim();

        if (keyword) {
            // Globális keresési eredmények
            let matchCount = 0;
            HELP_SECTIONS.forEach(section => {
                const matchedArticles = section.articles.filter(art => 
                    art.title.toLowerCase().includes(keyword) || 
                    art.content.toLowerCase().includes(keyword)
                );

                if (matchedArticles.length > 0) {
                    const sectionTitle = document.createElement('h4');
                    sectionTitle.className = "text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-4 mb-2 border-b pb-1 text-left";
                    sectionTitle.textContent = section.title;
                    this.helpContentContainer.appendChild(sectionTitle);

                    matchedArticles.forEach(art => {
                        matchCount++;
                        const card = this.createArticleCard(art, keyword);
                        this.helpContentContainer.appendChild(card);
                    });
                }
            });

            if (matchCount === 0) {
                this.helpContentContainer.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-slate-400">
                        <i class="fas fa-search-minus text-4xl mb-3"></i>
                        <div class="text-sm font-bold">Nincs találat a következőre: "${filterKeyword}"</div>
                        <div class="text-xs mt-1">Próbálj meg más kulcsszavakat megadni.</div>
                    </div>
                `;
            }
        } else {
            // Aktuális kategória cikkei
            const section = HELP_SECTIONS.find(s => s.id === this.selectedCategory);
            if (!section) return;

            const header = document.createElement('div');
            header.className = "mb-6 pb-4 border-b border-gray-100 text-left";
            header.innerHTML = `
                <h3 class="text-base font-extrabold text-slate-800">${section.title}</h3>
                <p class="text-xs text-slate-400 mt-1">${section.description}</p>
            `;
            this.helpContentContainer.appendChild(header);

            section.articles.forEach(art => {
                const card = this.createArticleCard(art);
                this.helpContentContainer.appendChild(card);
            });
        }
    }

    createArticleCard(article, highlightKeyword = '') {
        const card = document.createElement('div');
        card.className = "bg-slate-50 border border-slate-200/80 rounded-2xl p-5 mb-4 text-left shadow-sm";

        let title = article.title;
        let content = article.content;

        if (highlightKeyword) {
            const regex = new RegExp(`(${highlightKeyword})`, 'gi');
            title = title.replace(regex, '<mark class="bg-amber-100 text-slate-900 px-1 rounded">$1</mark>');
        }

        card.innerHTML = `
            <h4 class="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                <i class="far fa-file-alt text-indigo-500"></i> ${title}
            </h4>
            <div class="text-xs text-slate-600 leading-relaxed font-normal space-y-2">
                ${content}
            </div>
        `;
        return card;
    }

    filterHelp(value) {
        this.renderHelpContent(value);
    }

    showCategoryActionsModal(itemName) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]';
            modal.innerHTML = `
                <div class="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl transform scale-95 opacity-0 transition-all duration-300" id="catActionContent">
                    <h3 class="text-base font-black text-slate-800 text-center mb-1 uppercase tracking-wider">Kategória Műveletek</h3>
                    <p class="text-xs text-slate-500 text-center mb-6 font-medium">Mit szeretne tenni a(z) <strong class="text-slate-800 font-bold">"${this._escapeHtml(itemName)}"</strong> kategóriával?</p>
                    
                    <div class="flex flex-col gap-3">
                        <button id="catActionRename" class="w-full py-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 border border-indigo-100">
                            <i class="fas fa-edit"></i> Kategória átnevezése
                        </button>
                        <button id="catActionDelete" class="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 border border-rose-100">
                            <i class="fas fa-trash-alt"></i> Kategória törlése
                        </button>
                        <button id="catActionCancel" class="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-wider transition">
                            Mégse
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            
            const content = modal.querySelector('#catActionContent');
            requestAnimationFrame(() => {
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');
            });

            const close = (action) => {
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
                setTimeout(() => {
                    modal.remove();
                    resolve(action);
                }, 150);
            };

            modal.querySelector('#catActionRename').addEventListener('click', () => close('rename'));
            modal.querySelector('#catActionDelete').addEventListener('click', () => close('delete'));
            modal.querySelector('#catActionCancel').addEventListener('click', () => close(null));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close(null);
            });
        });
    }
  
}