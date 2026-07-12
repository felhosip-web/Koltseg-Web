// js/offline-handler.js
// Egységes offline kezelés + Banner

export class OfflineHandler {
    constructor(app) {
        this.app = app;
        this.isOnline = navigator.onLine;
        this.pendingChanges = {
            items: [],
            months: [],
            entries: [],
            templates: [],
            reminders: []
        };
        
        // ===== ÚJ: BANNER HEZ =====
        this.bannerElement = null;
        this.isBannerVisible = false;
        this.bannerContainerId = 'offlineBannerContainer';
    }

    // ========================================================
    // === MEGLÉVŐ METÓDUSOK (változatlanok) ===
    // ========================================================

    /**
     * Függő változtatás hozzáadása
     */
    addPendingChange(table, operation, data, key = 'id') {
        this.pendingChanges[table].push({
            operation,
            data,
            key,
            timestamp: new Date().toISOString()
        });
        
        this._saveToStorage();
        console.log(`[OFFLINE] ${table} ${operation} naplózva (${this.pendingChanges[table].length} függő)`);
    }

    /**
     * Függő változtatások feldolgozása (online állapotban)
     */
    async processPendingChanges() {
        if (!this.isOnline) {
            console.log('[OFFLINE] Offline, a függő változtatások később kerülnek feldolgozásra.');
            return 0;
        }

        let processed = 0;
        const errors = [];

        for (const table in this.pendingChanges) {
            const changes = this.pendingChanges[table];
            if (changes.length === 0) continue;

            for (const change of changes) {
                try {
                    if (change.operation === 'delete') {
                        await this.app.cloud.push(table, change.data, true, change.key);
                    } else {
                        await this.app.cloud.push(table, change.data);
                    }
                    processed++;
                } catch (e) {
                    errors.push({ table, change, error: e });
                    console.warn(`[OFFLINE] Sikertelen: ${table} ${change.operation}`, e);
                }
            }
            
            this.pendingChanges[table] = [];
        }

        this._saveToStorage();

        if (errors.length > 0) {
            console.warn(`[OFFLINE] ${errors.length} változtatás sikertelen`);
        }

        if (processed > 0) {
            console.log(`[OFFLINE] ${processed} függő változtatás feldolgozva`);
        }

        return processed;
    }

    /**
     * Függő változtatások betöltése a localStorage-ból
     */
    loadPendingChanges() {
        try {
            const saved = localStorage.getItem('hmi_pendingChanges');
            if (saved) {
                const parsed = JSON.parse(saved);
                for (const table in this.pendingChanges) {
                    if (parsed[table]) {
                        this.pendingChanges[table] = parsed[table];
                    }
                }
                const total = this.getPendingCount();
                if (total > 0) {
                    console.log(`[OFFLINE] ${total} függő változtatás betöltve a localStorage-ból`);
                }
            }
        } catch (e) {
            console.warn('[OFFLINE] Nem sikerült betölteni a függő változtatásokat:', e);
        }
    }

    /**
     * Függő változtatások mentése localStorage-ba
     */
    _saveToStorage() {
        try {
            localStorage.setItem('hmi_pendingChanges', JSON.stringify(this.pendingChanges));
        } catch (e) {
            console.warn('[OFFLINE] Nem sikerült menteni a függő változtatásokat:', e);
        }
    }

    /**
     * Függő változtatások száma
     */
    getPendingCount() {
        return Object.values(this.pendingChanges).reduce((sum, arr) => sum + arr.length, 0);
    }

    /**
     * Van-e függő változtatás
     */
    hasPendingChanges() {
        return this.getPendingCount() > 0;
    }

    /**
     * Függő offline változtatások teljes törlése
     */
    clearPendingChanges() {
        this.pendingChanges = {
            items: [],
            months: [],
            entries: [],
            templates: [],
            reminders: [],
            incomings: [],
            incoming_senders: []
        };
        this._saveToStorage();
        console.log('[OFFLINE] Függő változtatások sikeresen kiürítve');
    }

    /**
     * Függő változtatások listája (részletesen)
     */
    getPendingDetails() {
        const details = {};
        for (const table in this.pendingChanges) {
            if (this.pendingChanges[table].length > 0) {
                details[table] = this.pendingChanges[table].map(c => ({
                    operation: c.operation,
                    timestamp: c.timestamp
                }));
            }
        }
        return details;
    }

    /**
     * Online/Offline állapot beállítása
     */
    setOnlineStatus(isOnline) {
        this.isOnline = isOnline;
        if (isOnline) {
            console.log('[OFFLINE] Online állapot helyreállt');
            // Banner elrejtése online állapotban
            this.hideBanner();
        } else {
            console.log('[OFFLINE] Offline állapot');
            // Banner megjelenítése offline állapotban
            this.showBanner();
        }
    }

    // ========================================================
    // === ÚJ: BANNER METÓDUSOK ===
    // ========================================================

    /**
     * Offline banner megjelenítése
     */
    showBanner() {
        if (this.isBannerVisible) return;
        this.isBannerVisible = true;
        
        // Ellenőrizzük, hogy létezik-e a konténer
        let container = document.getElementById(this.bannerContainerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this.bannerContainerId;
            container.className = 'fixed top-0 left-0 right-0 z-[9999] pointer-events-none';
            document.body.prepend(container);
        }
        
        // Banner létrehozása
        this.bannerElement = document.createElement('div');
        this.bannerElement.className = 'offline-banner bg-gradient-to-r from-amber-500 to-amber-600 text-white p-3 text-center font-bold shadow-lg transition-all duration-500 pointer-events-auto';
        this.bannerElement.style.animation = 'slideDown 0.5s ease forwards';
        this.bannerElement.innerHTML = `
            <div class="flex items-center justify-center gap-3 flex-wrap max-w-4xl mx-auto">
                <span class="flex items-center gap-2">
                    <span class="inline-block w-3 h-3 bg-white rounded-full animate-pulse"></span>
                    📡 OFFLINE MÓD
                </span>
                <span class="text-sm font-normal opacity-90">Csak helyi adatok elérhetők</span>
                <span class="text-xs font-mono bg-white/20 px-2 py-0.5 rounded-full">
                    ${this.getPendingCount()} függő változtatás
                </span>
                <button onclick="window.app?.offline?.hideBanner()" 
                        class="text-white/80 hover:text-white text-sm underline px-3 py-1 rounded-lg hover:bg-white/10 transition">
                    <i class="fas fa-times"></i> Bezár
                </button>
            </div>
            <div class="text-xs opacity-75 mt-1 font-normal max-w-4xl mx-auto">
                💡 A változtatások mentésre kerülnek, de szinkronizáció csak netkapcsolat esetén történik
            </div>
        `;
        
        // Stílus hozzáadása (ha még nincs)
        this._ensureStyles();
        
        container.appendChild(this.bannerElement);
        
        // Státusz frissítése
        this._updateBannerStatus();
    }

    /**
     * Offline banner elrejtése
     */
    hideBanner() {
        if (!this.bannerElement) {
            this.isBannerVisible = false;
            return;
        }
        
        this.bannerElement.style.opacity = '0';
        this.bannerElement.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            this.bannerElement?.remove();
            this.bannerElement = null;
            this.isBannerVisible = false;
        }, 500);
    }

    /**
     * Banner státusz frissítése (függő változtatások száma)
     */
    _updateBannerStatus() {
        if (!this.bannerElement) return;
        
        const count = this.getPendingCount();
        const badge = this.bannerElement.querySelector('.font-mono');
        if (badge) {
            badge.textContent = `${count} függő változtatás`;
            if (count === 0) {
                badge.className = 'text-xs font-mono bg-white/20 px-2 py-0.5 rounded-full opacity-50';
            } else {
                badge.className = 'text-xs font-mono bg-white/20 px-2 py-0.5 rounded-full animate-pulse';
            }
        }
    }

    /**
     * Banner frissítése (külső hívásra)
     */
    updateBanner() {
        if (this.isBannerVisible) {
            this._updateBannerStatus();
        } else if (!this.isOnline) {
            this.showBanner();
        }
    }

    /**
     * Stílusok biztosítása (egyszeri)
     */
    _ensureStyles() {
        if (document.getElementById('offline-banner-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'offline-banner-styles';
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .offline-banner {
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
            }
            
            .offline-banner .animate-pulse {
                animation: pulseDot 1.5s ease-in-out infinite;
            }
            
            @keyframes pulseDot {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.3; transform: scale(0.8); }
            }
            
            /* Mobil optimalizáció */
            @media (max-width: 640px) {
                .offline-banner {
                    padding: 12px 16px;
                    font-size: 13px;
                }
                .offline-banner .flex-wrap {
                    gap: 6px;
                }
                .offline-banner .text-sm {
                    font-size: 12px;
                }
                .offline-banner .text-xs {
                    font-size: 10px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}