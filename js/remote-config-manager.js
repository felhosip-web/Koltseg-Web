// js/remote-config-manager.js - Távoli konfiguráció kezelő (finomított)
// Többlépcsős fallback: settings.json → GitHub → ConfigManager → alapértelmezett
// NINCS felesleges localStorage olvasás!

export class RemoteConfigManager {
    constructor(app) {
        this.app = app;
        this.config = {};
        this.loaded = false;
    }

    /**
     * Konfiguráció betöltése (több forrásból)
     */
    async load() {
        try {
            // 1. Próbáljuk a lokális settings.json-t
            let res = await fetch('/settings.json');
            if (res.ok) {
                this.config = await res.json();
                this.loaded = true;
                console.log('[CONFIG] Lokális konfiguráció betöltve');
                return this.config;
            }
            
            // 2. Fallback: GitHub raw
            const rawUrl = 'https://raw.githubusercontent.com/felhosip-web/Koltseg-Web/gh-pages/settings.json';
            res = await fetch(rawUrl);
            if (res.ok) {
                this.config = await res.json();
                this.loaded = true;
                console.log('[CONFIG] GitHub konfiguráció betöltve');
                return this.config;
            }
            
            // 3. Nincs konfiguráció
            console.log('[CONFIG] Nincs távoli konfiguráció, ConfigManager használat');
            this.config = {};
            this.loaded = true;
            return {};

        } catch (e) {
            console.warn('[CONFIG] Konfiguráció betöltési hiba:', e);
            this.config = {};
            this.loaded = true;
            return {};
        }
    }

    /**
     * Konfiguráció alkalmazása az alkalmazásra
     * Csak a ConfigManager-t használja, nincs felesleges localStorage olvasás!
     */
    applyToApp() {
        const cfg = this.config;
        const configManager = this.app.config;
        
        if (!configManager) {
            console.warn('[CONFIG] ConfigManager nem elérhető!');
            return this.config;
        }

        // === SUPABASE BEÁLLÍTÁSOK ===
        // Csak a ConfigManager-ből olvasunk, nincs localStorage!
        
        // 1. URL
        const url = cfg.SUPABASE_URL || configManager.supabaseConfig?.url || '';
        
        // 2. API kulcs
        const key = cfg.SUPABASE_ANON_KEY || configManager.supabaseConfig?.key || '';
        
        // 3. Felhő használat (useCloud)
        let useCloud = false;
        
        // Remote config-ból
        if (cfg.USE_CLOUD !== undefined) {
            useCloud = cfg.USE_CLOUD === true || cfg.USE_CLOUD === 'true';
        }
        // ConfigManager-ből
        else if (configManager.useSupabase !== undefined) {
            useCloud = configManager.useSupabase === true;
        }
        // Alapértelmezett: ha van URL és kulcs, akkor automatikusan bekapcsoljuk
        else if (url && key) {
            useCloud = true;
        }

        // 4. EUR árfolyam
        const eurRate = cfg.DEFAULT_EUR_RATE || configManager.eurRate || 400;

        // === ALKALMAZÁS ===
        // ConfigManager frissítése
        configManager.supabaseConfig.url = url;
        configManager.supabaseConfig.key = key;
        configManager.useSupabase = useCloud;
        configManager.eurRate = eurRate;
        
        // Mentés localStorage-ba (csak a ConfigManager változásai miatt)
        // De ezt a ConfigManager végzi, itt csak biztosítjuk a konzisztenciát
        this._saveToStorage(url, key, useCloud, eurRate);

        // === CLOUD KLIENS ÚJRAINICIALIZÁLÁSA ===
        try {
            if (this.app.cloud) {
                this.app.cloud.init();
                console.log('[CONFIG] Cloud client re-initialized');
            }
            if (this.app.syncService?.cloud) {
                this.app.syncService.cloud.init();
                console.log('[CONFIG] SyncService cloud re-initialized');
            }
        } catch (e) {
            console.warn('[CONFIG] Cloud re-init failed:', e);
        }

        // === LOGGING ===
        console.log('[CONFIG] Konfiguráció alkalmazva:', {
            useCloud: useCloud,
            hasUrl: !!url,
            hasKey: !!key,
            eurRate: eurRate,
            source: cfg.SUPABASE_URL ? 'remote' : 'config'
        });

        return this.config;
    }

    /**
     * Beállítások mentése localStorage-ba (csak szükség esetén)
     */
    _saveToStorage(url, key, useCloud, eurRate) {
        try {
            // Csak akkor mentünk, ha változott valami
            const currentUrl = localStorage.getItem('supabase_url');
            const currentKey = localStorage.getItem('supabase_key');
            const currentUse = localStorage.getItem('supabase_use');
            const currentRate = localStorage.getItem('default_eur_rate');

            if (currentUrl !== url) localStorage.setItem('supabase_url', url);
            if (currentKey !== key) localStorage.setItem('supabase_key', key);
            if (currentUse !== String(useCloud)) localStorage.setItem('supabase_use', useCloud ? 'true' : 'false');
            if (currentRate !== String(eurRate)) localStorage.setItem('default_eur_rate', String(eurRate));
        } catch (e) {
            console.warn('[CONFIG] localStorage mentési hiba:', e);
        }
    }

    /**
     * Konfiguráció állapotának lekérése (csak ConfigManager-ből)
     */
    getStatus() {
        const config = this.app.config;
        if (!config) {
            return {
                loaded: this.loaded,
                useCloud: false,
                hasUrl: false,
                hasKey: false,
                eurRate: 400,
                error: 'ConfigManager nem elérhető'
            };
        }

        return {
            loaded: this.loaded,
            useCloud: config.useSupabase || false,
            hasUrl: !!(config.supabaseConfig?.url),
            hasKey: !!(config.supabaseConfig?.key),
            eurRate: config.eurRate || 400
        };
    }

    /**
     * Konfiguráció újratöltése (pl. beállítások mentése után)
     */
    async reload() {
        this.loaded = false;
        await this.load();
        this.applyToApp();
        console.log('[CONFIG] Konfiguráció újratöltve');
        return this.config;
    }

    /**
     * Beállítások mentése (felhasználói módosítások)
     * Csak a ConfigManager-t frissíti, a localStorage-t a ConfigManager kezeli
     */
    saveSettings(settings) {
        const config = this.app.config;
        if (!config) {
            console.warn('[CONFIG] ConfigManager nem elérhető!');
            return false;
        }

        const { url, key, useCloud, eurRate } = settings;

        // ConfigManager frissítése
        if (url !== undefined) {
            config.supabaseConfig.url = url;
            localStorage.setItem('supabase_url', url);
        }
        if (key !== undefined) {
            config.supabaseConfig.key = key;
            localStorage.setItem('supabase_key', key);
        }
        if (useCloud !== undefined) {
            config.useSupabase = useCloud;
            localStorage.setItem('supabase_use', useCloud ? 'true' : 'false');
        }
        if (eurRate !== undefined) {
            config.eurRate = eurRate;
            localStorage.setItem('default_eur_rate', String(eurRate));
        }

        // Cloud kliens újrainicializálása
        try {
            if (this.app.cloud) this.app.cloud.init();
            if (this.app.syncService?.cloud) this.app.syncService.cloud.init();
        } catch (e) {
            console.warn('[CONFIG] Cloud re-init failed after save:', e);
        }

        console.log('[CONFIG] Beállítások mentve:', { url, key, useCloud, eurRate });
        return true;
    }
}