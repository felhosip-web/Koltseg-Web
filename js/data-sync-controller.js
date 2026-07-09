// js/data-sync-controller.js - Szinkronizációval kapcsolatos műveletek
export class DataSyncController {
    constructor(app) {
        this.app = app;
    }

    /**
     * Teljes szinkronizáció (felhasználó által indított)
     */
    async forceSync() {
        this.app.renderer.updateFooterStatus('🔄 Szinkronizáció folyamatban...', false);

        try {
            // === 1. ELŐKONTROLL ===
            const config = this.app.config;
            if (!config?.useSupabase) {
                await this.app.hmiNotif.showInfo(
                    '☁️ Felhő kikapcsolva',
                    'A szinkronizációhoz kapcsold be a felhőt a Beállításokban!'
                );
                return;
            }

            if (!config.supabaseConfig?.url || !config.supabaseConfig?.key) {
                await this.app.hmiNotif.showInfo(
                    '⚠️ Hiányzó Supabase adatok',
                    'Add meg a Supabase URL-t és Anon Public API Key-t a Beállításokban!'
                );
                return;
            }

            if (!navigator.onLine) {
                await this.app.hmiNotif.showInfo(
                    '📡 Nincs internetkapcsolat',
                    'A szinkronizációhoz stabil internetkapcsolat szükséges.'
                );
                return;
            }

            this.app.hmiNotif.showToast('🔄 Szinkronizáció indul...', 'info');

            // === 2. SZINKRONIZÁCIÓ VÉGREHAJTÁSA ===
            const syncService = this.app.syncService || this.app.syncManager;
            let result = null;

            if (typeof syncService.sync === 'function') {
                result = await syncService.sync();
            } else if (typeof syncService.fullSync === 'function') {
                result = await syncService.fullSync();
            } else {
                throw new Error('Nincs megfelelő sync metódus a SyncService-ben');
            }

            // === 3. UI FRISSÍTÉS ===
            await this._refreshAllUI();

            const syncTime = new Date().toLocaleTimeString('hu-HU');
            const conflicts = this.app.syncService?.lastSyncConflicts || [];
            
            if (conflicts.length > 0) {
                this.app.hmiNotif?.showNotification?.(
                    '🔀 Szinkronizációs ütközések',
                    `A szinkronizáció során ${conflicts.length} ütközést észleltünk és oldottunk fel sikeresen (időbélyeg alapján). A részleteket megtekintheted a Beállítások -> Eseménynapló fülön!`,
                    'info'
                );
            }
            
            this.app.hmiNotif.showToast(`✅ Szinkronizáció sikeres! (${syncTime})`, 'success');
            this.app.renderer.updateFooterStatus(`✅ Szinkronizálva: ${syncTime}`);

            console.log('[SYNC] Sikeres szinkronizáció', result);
            return result;

        } catch (err) {
            console.error('[SYNC ERROR]', err);
            const userMessage = this._getUserFriendlyError(err);
            
            await this.app.hmiNotif.showInfo('❌ Szinkronizációs hiba', userMessage);
            this.app.renderer.updateFooterStatus('❌ Szinkronizációs hiba!', true);
        }
    }

    /**
     * Hibák felhasználóbarát üzenetté alakítása
     */
  
_getUserFriendlyError(err) {
    const msg = (err.message || '').toLowerCase();
    
    // Supabase specifikus hibák
    if (msg.includes('jwt') || msg.includes('auth') || msg.includes('permission')) {
        return '🔐 Hitelesítési hiba. Ellenőrizd a Supabase API kulcsot a Beállításokban.';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
        return '🌐 Hálózati hiba. Ellenőrizd az internetkapcsolatot.';
    }
    if (msg.includes('rlp') || msg.includes('row level')) {
        return '🔒 Jogosultsági hiba a Supabase oldalon (RLS). Ellenőrizd a táblák RLS beállításait.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return '⏱️ Időtúllépés. A szerver lassan válaszol, próbáld újra később.';
    }
    if (msg.includes('duplicate') || msg.includes('unique constraint')) {
        return '📋 Duplikált adat. Ellenőrizd, hogy nem létezik már ilyen rekord.';
    }
    if (msg.includes('404') || msg.includes('not found')) {
        return '🔍 A tábla nem található a Supabase-ben. Ellenőrizd a tábla nevét.';
    }
    if (msg.includes('400') || msg.includes('bad request')) {
        return '📝 Érvénytelen kérés. Ellenőrizd az adatok formátumát.';
    }
    if (msg.includes('500') || msg.includes('internal server')) {
        return '⚠️ Szerverhiba a Supabase oldalon. Próbáld újra később.';
    }
    if (msg.includes('offline') || msg.includes('no internet')) {
        return '📡 Nincs internetkapcsolat. Ellenőrizd a hálózati beállításokat.';
    }
    if (msg.includes('cors')) {
        return '🌐 CORS hiba. Ellenőrizd a Supabase URL-t és a CORS beállításokat.';
    }
    
    // Ismeretlen hiba
    return err.message || '❌ Ismeretlen hiba történt a szinkronizáció során.';
}

    /**
     * Teljes UI frissítés szinkronizáció után
     */
    async _refreshAllUI() {
        try {
            await Promise.allSettled([
                this.app.renderer.renderTable(),
                this.app.renderStats?.(),
                this.app.remindersRenderer?.renderList?.(),
                this.app.updateReminderStatus?.()
            ]);
        } catch (e) {
            console.warn('[SYNC] UI frissítési hiba:', e);
        }
    }

    /**
     * Csak Pull (letöltés a felhőből)
     */
    async pullOnly() {
        const syncService = this.app.syncService || this.app.syncManager;
        if (typeof syncService.pull === 'function') {
            return await syncService.pull('all');
        }
        return [];
    }

    /**
     * Csak Push (feltöltés a felhőbe)
     */
    async pushOnly() {
        const syncService = this.app.syncService || this.app.syncManager;
        if (typeof syncService.executePush === 'function') {
            return await syncService.executePush();
        }
    }
}