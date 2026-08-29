// js/ai-modal-controller.js
// AI Quick Insert Modal Controller - Természetes nyelvű költség-bejegyzés Gemini segítségével
import { CategoryIcons } from './category-icons.js';

export class AiModalController {
    /**
     * Konstruktor - AI Modal vezérlő inicializálása
     * @param {Object} app - Az alkalmazás fő példánya
     */
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
     * AI Modal megnyitása (React event trigger)
     */
    open() {
        this.parsedData = null;
        document.getElementById('costAppAiModalRoot')?.dispatchEvent(new CustomEvent('ai-modal-open'));
    }

    /**
     * Szöveg elemzése a szerver-oldali Gemini API-val
     * @param {string} text - A mondat
     * @returns {Promise<Object>} Elemzett adatok
     */
    async analyze(text) {
        if (!text) {
            throw new Error('Kérjük, írjon be egy mondatot!');
        }

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

        // Hozzáadjuk a kategória ikont az adatokhoz, hogy a React tudja használni
        data.catIconData = CategoryIcons.getIconData(data.category);

        this.parsedData = data;
        return data;
    }

    /**
     * Elemzett költség tényleges rögzítése és adatbázisba mentése
     * @param {Object} data - Elemzett adatok
     */
    async confirmAndInsert(data = this.parsedData) {
        if (!data) return;

        try {
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
                itemId: categoryId,
                month: data.month,
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
        } catch (error) {
            console.error('[AI Insertion Error]:', error);
            this.app.hmiNotif.showToast('Hiba történt a felvitel során!', 'error');
            throw error;
        }
    }

    /**
     * Modal bezárása (React event trigger)
     */
    close() {
        document.getElementById('costAppAiModalRoot')?.dispatchEvent(new CustomEvent('ai-modal-close'));
    }
}
