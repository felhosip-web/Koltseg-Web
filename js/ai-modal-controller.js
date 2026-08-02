// js/ai-modal-controller.js
// AI Quick Insert Modal Controller - Természetes nyelvű költség-bejegyzés Gemini segítségével
import { CategoryIcons } from './category-icons.js';

export class AiModalController {
    constructor(app) {
        this.app = app;
        this.parsedData = null;
        
        // Gomb bekötése
        const btnOpen = document.getElementById('btnOpenAiModal');
        if (btnOpen) {
            btnOpen.addEventListener('click', () => this.open());
        }
    }

    /**
     * AI Modal megnyitása
     */
    open() {
        this.parsedData = null;
        
        // Modal konténer létrehozása
        const modal = document.createElement('div');
        modal.id = 'aiMagicModal';
        modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] opacity-0 transition-opacity duration-300';
        
        modal.innerHTML = `
            <div class="bg-white rounded-3xl p-6 max-w-lg w-full mx-auto shadow-2xl transform scale-95 opacity-0 transition-all duration-300" id="aiMagicContent">
                <!-- Cím és Fejléc -->
                <div class="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
                            <i class="fas fa-magic"></i>
                        </div>
                        <div>
                            <h3 class="text-base font-black text-slate-800 uppercase tracking-wider">AI Gyorsfelvitel</h3>
                            <p class="text-[10px] text-slate-400 font-medium">Írja le a költségét vagy bevételét egyszerűen!</p>
                        </div>
                    </div>
                    <button id="aiMagicClose" class="w-8 h-8 flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Input mező -->
                <div class="mb-4">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Írja be pl.: "5000 Ft ebédre júliusban kártyával"</label>
                    <div class="relative">
                        <textarea id="aiInputText" rows="3" 
                            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none placeholder-slate-400"
                            placeholder="Pl. 120 EUR fűtésszámla augusztusra utalással..."></textarea>
                        <div class="absolute bottom-3 right-3 flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold bg-white px-2.5 py-1 rounded-lg border border-slate-100 shadow-sm pointer-events-none">
                            <i class="fas fa-keyboard text-slate-300"></i> Enter az elemzéshez
                        </div>
                    </div>
                </div>

                <!-- Elemzés gomb -->
                <button id="aiBtnAnalyze" class="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
                    <i class="fas fa-sync fa-spin hidden" id="aiAnalyzeSpinner"></i>
                    <i class="fas fa-brain" id="aiAnalyzeBrainIcon"></i> 
                    <span>Költség Elemzése</span>
                </button>

                <!-- Betöltő állapot -->
                <div id="aiLoadingState" class="hidden my-8 text-center animate-pulse">
                    <div class="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 animate-spin mx-auto mb-3"></div>
                    <p class="text-xs font-bold text-slate-600">Az AI éppen értelmezi a bejegyzést...</p>
                    <p class="text-[10px] text-slate-400 mt-1">Kategória és hónap automatikus egyeztetése folyamatban.</p>
                </div>

                <!-- Hiba állapot -->
                <div id="aiErrorState" class="hidden my-6 bg-rose-50 border border-rose-100 rounded-2xl p-5 text-center">
                    <div class="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-2.5">
                        <i class="fas fa-exclamation-triangle text-sm"></i>
                    </div>
                    <h4 class="text-xs font-black text-rose-800 uppercase tracking-wider mb-1">Nem sikerült elemezni a bejegyzést</h4>
                    <p class="text-xs text-rose-600 font-semibold" id="aiErrorText">Hiba történt a feldolgozás során.</p>
                    <p class="text-[10px] text-slate-400 mt-2 font-medium">Tipp: Próbálja meg más szavakkal megfogalmazni, pl. adja meg az összeget (HUF vagy Ft), a kategóriát vagy a hónapot egyértelműbben!</p>
                </div>

                <!-- Elemzési eredmény (Preview kártya) -->
                <div id="aiPreviewContainer" class="hidden mt-6 bg-slate-50 border border-slate-100 rounded-2xl p-5 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
                    
                    <h4 class="text-xs font-black text-indigo-700 uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
                        <i class="fas fa-clipboard-check"></i> Elemzett adatok:
                    </h4>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Összeg -->
                        <div class="bg-white p-3 rounded-xl border border-slate-100/60">
                            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Összeg</span>
                            <span class="text-base font-black text-slate-800" id="aiPreviewAmount">0 Ft</span>
                        </div>
                        
                        <!-- Fizetési Mód -->
                        <div class="bg-white p-3 rounded-xl border border-slate-100/60">
                            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Fizetési mód</span>
                            <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5 mt-0.5" id="aiPreviewMethod">
                                <i class="fas fa-credit-card text-indigo-500" id="aiPreviewMethodIcon"></i>
                                <span id="aiPreviewMethodText">-</span>
                            </span>
                        </div>

                        <!-- Kategória -->
                        <div class="bg-white p-3 rounded-xl border border-slate-100/60">
                            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Kategória</span>
                            <div class="flex items-center justify-between mt-1">
                                <div class="flex items-center gap-1.5">
                                    <div class="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" id="aiPreviewCatIconContainer">
                                        <i id="aiPreviewCatIcon" class="fas fa-tag text-[10px]"></i>
                                    </div>
                                    <span class="text-xs font-bold text-slate-800" id="aiPreviewCategory">-</span>
                                </div>
                                <span class="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border" id="aiPreviewCatStatus">-</span>
                            </div>
                        </div>

                        <!-- Hónap -->
                        <div class="bg-white p-3 rounded-xl border border-slate-100/60">
                            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Hónap</span>
                            <div class="flex items-center justify-between mt-0.5">
                                <span class="text-xs font-bold text-slate-800 font-mono" id="aiPreviewMonth">-</span>
                                <span class="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border" id="aiPreviewMonthStatus">-</span>
                            </div>
                        </div>
                    </div>

                    <!-- Megjegyzés -->
                    <div class="mt-4 bg-white p-3 rounded-xl border border-slate-100/60">
                        <span class="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Megjegyzés / Leírás</span>
                        <p class="text-xs font-semibold text-slate-700 mt-1 italic" id="aiPreviewNote">-</p>
                    </div>

                    <!-- Jóváhagyás gombok -->
                    <div class="flex gap-3 mt-5">
                        <button id="aiBtnCancel" class="flex-1 py-3 bg-slate-200/80 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition">
                            Mégse
                        </button>
                        <button id="aiBtnConfirm" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100">
                            <i class="fas fa-check-circle"></i> Rendben, felvitel!
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Megjelenítés animációval
        const content = modal.querySelector('#aiMagicContent');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            modal.classList.add('opacity-100');
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        });

        // Eseménykezelők bekötése
        const inputEl = modal.querySelector('#aiInputText');
        const analyzeBtn = modal.querySelector('#aiBtnAnalyze');
        const closeBtn = modal.querySelector('#aiMagicClose');
        const confirmBtn = modal.querySelector('#aiBtnConfirm');
        const cancelBtn = modal.querySelector('#aiBtnCancel');

        inputEl.focus();

        // Enter gombra való elemzés
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.analyze();
            }
        });

        analyzeBtn.addEventListener('click', () => this.analyze());
        closeBtn.addEventListener('click', () => this.close());
        cancelBtn.addEventListener('click', () => this.close());
        confirmBtn.addEventListener('click', () => this.confirmAndInsert());

        // Modal hátterére kattintva bezárás
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
    }

    /**
     * Szöveg elemzése a szerver-oldali Gemini API-val
     */
    async analyze() {
        const modal = document.getElementById('aiMagicModal');
        if (!modal) return;

        const inputEl = modal.querySelector('#aiInputText');
        const text = inputEl.value.trim();

        if (!text) {
            this.app.hmiNotif.showToast('Kérjük, írjon be egy mondatot!', 'error');
            return;
        }

        // UI elemek elérése
        const analyzeBtn = modal.querySelector('#aiBtnAnalyze');
        const spinner = modal.querySelector('#aiAnalyzeSpinner');
        const brainIcon = modal.querySelector('#aiAnalyzeBrainIcon');
        const loadingState = modal.querySelector('#aiLoadingState');
        const errorState = modal.querySelector('#aiErrorState');
        const errorText = modal.querySelector('#aiErrorText');
        const previewContainer = modal.querySelector('#aiPreviewContainer');

        // Gomb kikapcsolása és betöltő indítása, hiba és előnézet elrejtése
        analyzeBtn.disabled = true;
        spinner.classList.remove('hidden');
        brainIcon.classList.add('hidden');
        loadingState.classList.remove('hidden');
        errorState.classList.add('hidden');
        previewContainer.classList.add('hidden');

        try {
            // Meglévő kategóriák és hónapok átadása a kontextushoz
            const categories = this.app.items.items.map(i => i.name);
            const months = this.app.months.months;
            const currentDate = new Date().toISOString().split('T')[0];

            const response = await fetch('/api/ai/parse', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text,
                    categories,
                    months,
                    currentDate,
                    aiConfig: this.app.config.aiConfig
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Szerver hiba: ${response.status}`);
            }

            const data = await response.json();
            this.parsedData = data;

            // UI frissítése az eredményekkel
            modal.querySelector('#aiPreviewAmount').textContent = `${data.amount.toLocaleString('hu-HU')} ${data.currency}`;
            
            // Fizetési mód ikon és szöveg
            const methodText = modal.querySelector('#aiPreviewMethodText');
            const methodIcon = modal.querySelector('#aiPreviewMethodIcon');
            methodText.textContent = data.paymentMethod;
            
            methodIcon.className = 'fas';
            if (data.paymentMethod === 'Készpénz') {
                methodIcon.classList.add('fa-money-bill-wave', 'text-emerald-500');
            } else if (data.paymentMethod === 'Utalás') {
                methodIcon.classList.add('fa-university', 'text-amber-500');
            } else {
                methodIcon.classList.add('fa-credit-card', 'text-blue-500');
            }

            // Kategória és státusz
            modal.querySelector('#aiPreviewCategory').textContent = data.category;
            
            // Intelligens ikon beállítása a kategória előnézetben
            const catIconEl = modal.querySelector('#aiPreviewCatIcon');
            const catIconContainer = modal.querySelector('#aiPreviewCatIconContainer');
            if (catIconEl && catIconContainer) {
                const catIconData = CategoryIcons.getIconData(data.category);
                catIconEl.className = `${catIconData.iconClass} text-[10px] ${catIconData.textClass}`;
                catIconContainer.className = `w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${catIconData.bgClass}`;
            }

            const catStatus = modal.querySelector('#aiPreviewCatStatus');
            if (data.isNewCategory) {
                catStatus.textContent = 'ÚJ KATEGÓRIA';
                catStatus.className = 'text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border-purple-100';
            } else {
                catStatus.textContent = 'MEGLÉVŐ';
                catStatus.className = 'text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border-slate-200';
            }

            // Hónap és státusz
            modal.querySelector('#aiPreviewMonth').textContent = data.month;
            const monthStatus = modal.querySelector('#aiPreviewMonthStatus');
            if (data.isNewMonth) {
                monthStatus.textContent = 'ÚJ HÓNAP';
                monthStatus.className = 'text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border-emerald-100';
            } else {
                monthStatus.textContent = 'MEGLÉVŐ';
                monthStatus.className = 'text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border-slate-200';
            }

            // Megjegyzés
            modal.querySelector('#aiPreviewNote').textContent = data.note || 'Nincs leírás';

            // Megjelenítés
            previewContainer.classList.remove('hidden');
        } catch (error) {
            console.error('[AI Parse Error]:', error);
            errorText.textContent = error.message || 'Hiba történt az elemzés során.';
            errorState.classList.remove('hidden');
            this.app.hmiNotif.showToast(error.message || 'Hiba történt az elemzés során!', 'error');
        } finally {
            analyzeBtn.disabled = false;
            spinner.classList.add('hidden');
            brainIcon.classList.remove('hidden');
            loadingState.classList.add('hidden');
        }
    }

    /**
     * Elemzett költség tényleges rögzítése és adatbázisba mentése
     */
    async confirmAndInsert() {
        if (!this.parsedData) return;

        try {
            const data = this.parsedData;
            let categoryId = null;

            // 1. Ha új a kategória, hozzuk létre
            if (data.isNewCategory) {
                const newCat = await this.app.items.add(data.category);
                categoryId = newCat.id;
            } else {
                // Egyébként keressük meg a meglévő ID-ját
                const existing = this.app.items.items.find(i => i.name.toLowerCase() === data.category.toLowerCase());
                if (existing) {
                    categoryId = existing.id;
                } else {
                    // Ha valamiért mégis hiányozna, hozzuk létre biztosítékként
                    const fallbackCat = await this.app.items.add(data.category);
                    categoryId = fallbackCat.id;
                }
            }

            // 2. Ha új a hónap, hozzuk létre
            if (data.isNewMonth && !this.app.months.months.includes(data.month)) {
                await this.app.months.add(data.month);
            }

            // 3. Tranzakció mentése a cellKey-vel
            const cellBaseKey = `${categoryId}_${data.month}`;
            const cellKey = `${cellBaseKey}_${Date.now()}`;

            await this.app.entries.saveEntry({
                cellKey,
                amount: data.amount,
                currency: data.currency,
                paymentMethod: data.paymentMethod,
                note: data.note,
                color: '#c7d2fe', // Szép, AI-specifikus halvány kék/indigo jelölő szín
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            // 4. Betöltés és renderelés
            await this.app.entries.load();
            await this.app.items.load();
            await this.app.months.load();
            this.app.renderer.renderTable();

            this.app.hmiNotif.showToast('✅ Tranzakció rögzítve az adatbázisban!', 'success');
            this.close();
        } catch (error) {
            console.error('[AI Insertion Error]:', error);
            this.app.hmiNotif.showToast('Hiba történt a felvitel során!', 'error');
        }
    }

    /**
     * Modal bezárása animációval
     */
    close() {
        const modal = document.getElementById('aiMagicModal');
        if (!modal) return;

        const content = modal.querySelector('#aiMagicContent');
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0');

        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}
