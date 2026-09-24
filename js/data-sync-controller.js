// js/data-sync-controller.js - Szinkronizációval kapcsolatos műveletek
export class DataSyncController {
    constructor(app) {
        this.app = app;
    }

    /**
     * Teljes szinkronizáció (felhasználó által indított)
     */
    async forceSync() {
        this.app.renderer?.updateFooterStatus('🔄 Szinkronizáció folyamatban...', false);

        const syncService = this.app.syncService || this.app.syncManager;
        const previousReport = syncService?.lastReport;

        try {
            // === 1. ELŐKONTROLL ===
            const config = this.app.config;
            if (!config?.useSupabase) {
                throw new Error('A felhőszinkronizáció ki van kapcsolva. Kapcsold be a Felhő aktív beállítást.');
            }

            if (!config.supabaseConfig?.url || !config.supabaseConfig?.key) {
                throw new Error('Hiányoznak a Supabase kapcsolati adatai. Ellenőrizd az URL-t és az Anon Public API Key mezőt.');
            }

            if (!navigator.onLine) {
                throw new Error('Nincs internetkapcsolat. A szinkronizációhoz stabil internetkapcsolat szükséges.');
            }

            this.app.hmiNotif.showToast('🔄 Szinkronizáció indul...', 'info');

            // === 2. SZINKRONIZÁCIÓ VÉGREHAJTÁSA ===
            let result = null;

            if (typeof syncService.sync === 'function') {
                result = await syncService.sync();
            } else if (typeof syncService.fullSync === 'function') {
                result = await syncService.fullSync();
            } else {
                throw new Error('Nincs megfelelő sync metódus a SyncService-ben.');
            }

            if (!result || result.status !== 'success') {
                const syncFailureMessage = result?.message || result?.error || 'A szinkronizáció nem fejeződött be.';
                throw new Error(syncFailureMessage);
            }

            // === 3. UI FRISSÍTÉS ===
            await this._refreshAllUI();

            const syncTime = new Date().toLocaleTimeString('hu-HU');
            const report = result?.report || this.app.syncService?.lastReport;

            // Részletes, külön modal a szinkronizáció eredményéről (manual sync esetén automatikusan megjelenik)
            if (report && this.app.hmiNotif?.showSyncReportModal) {
                this.app.hmiNotif.showSyncReportModal(report);
            } else {
                const conflicts = this.app.syncService?.lastSyncConflicts || [];
                const successSummary = this._buildSuccessSummary(result, conflicts, syncTime);
                this.app.hmiNotif?.showSyncResult?.({
                    success: result.errors?.length === 0,
                    title: result.errors?.length === 0 ? 'Szinkronizáció sikeres' : 'Részleges szinkronizáció',
                    message: successSummary
                });
            }

            if (result.errors && result.errors.length > 0) {
                this.app.hmiNotif?.showToast?.(`⚠️ Részleges szinkronizáció (${result.errors.length} hiba)`, 'warning');
                this.app.renderer?.updateFooterStatus(`⚠️ Szinkronizálva (hibákkal): ${syncTime}`);
            } else {
                this.app.hmiNotif?.showToast?.(`✅ Szinkronizáció sikeres! (${syncTime})`, 'success');
                this.app.renderer?.updateFooterStatus(`✅ Szinkronizálva: ${syncTime}`);
            }

            console.log('[SYNC] Sikeres szinkronizáció', result);
            return result;

        } catch (err) {
            console.error('[SYNC ERROR]', err);

            const currentReport = syncService?.lastReport;
            const report = (currentReport && currentReport !== previousReport) ? currentReport : null;

            if (report && this.app.hmiNotif?.showSyncReportModal) {
                this.app.hmiNotif.showSyncReportModal(report);
            } else {
                const userMessage = this._getUserFriendlyError(err);
                this.app.hmiNotif?.showSyncResult?.({
                    success: false,
                    title: 'Szinkronizáció sikertelen',
                    message: userMessage
                });
            }

            this.app.renderer?.updateFooterStatus('❌ Szinkronizációs hiba!', true);
            throw err;
        }
    }

    _buildSuccessSummary(result, conflicts, syncTime) {
        const tables = Object.values(result.tables || {});
        const pulled = tables.reduce((sum, table) => sum + (table.pulled || 0), 0);
        const pushed = tables.reduce((sum, table) => sum + (table.pushed || 0), 0);
        const merged = tables.reduce((sum, table) => sum + (table.merged || 0), 0);

        const lines = [
            'A helyi és a felhőadatok összefésülése befejeződött.',
            `Letöltve: ${pulled} rekord`,
            `Feltöltve: ${pushed} rekord`,
            `Helyben frissítve: ${merged} rekord`,
            `Befejezés: ${syncTime}`
        ];

        if (result.queueProcessed) lines.push(`Várólistából feldolgozva: ${result.queueProcessed} művelet`);
        if (conflicts.length > 0) lines.push(`Feloldott ütközések: ${conflicts.length}`);
        if (result.errors?.length > 0) lines.push(`Figyelmeztetés: ${result.errors.length} részfeladat hibával zárult.`);

        return lines.join('\n');
    }

    /**
     * Hibák felhasználóbarát üzenetté alakítása
     */
    _getUserFriendlyError(err) {
        const msg = (err.message || '').toLowerCase();

        if (msg.includes('jwt') || msg.includes('auth') || msg.includes('permission')) {
            return '🔐 Hitelesítési hiba. Ellenőrizd a Supabase API kulcsot a Beállításokban.';
        }
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
            return '🌐 Hálózati hiba. Ellenőrizd az internetkapcsolatot.';
        }
        if (msg.includes('rls') || msg.includes('row level')) {
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

        return err.message || '❌ Ismeretlen hiba történt a szinkronizáció során.';
    }

    /**
     * Teljes UI frissítés szinkronizáció után
     */
    async _refreshAllUI() {
        try {
            await Promise.allSettled([
                this.app.refreshAllTabs?.(),
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
