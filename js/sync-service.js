// js/sync-service.js - Szinkronizációs szolgáltatás (középréteg)
// Teljes implementáció push(), pull(), sync() metódusokkal

import { CloudSync } from './oop-core.js';

export class SyncService {
    constructor(configManager, offlineHandler) {
        this.config = configManager;
        this.offline = offlineHandler;
        this.cloud = new CloudSync(configManager);
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.syncResults = null;
    }

    // ==================== PUSH ====================
    /**
     * Push művelet (offline naplózással)
     */
    async push(storeName, data, isDelete = false, customKey = 'id') {
        // Offline ellenőrzés
        if (!navigator.onLine) {
            console.log(`[SYNC] Offline, változtatás naplózva: ${storeName}`);
            this.offline.addPendingChange(storeName, isDelete ? 'delete' : 'update', data, customKey);
            return;
        }

        if (!this.cloud.client || !this.config.useSupabase) return;

        try {
            if (isDelete) {
                await this.cloud.delete(storeName, data, customKey);
            } else {
                await this.cloud.upsert(storeName, data, customKey);
            }
            console.log(`[SYNC] ${storeName} push successful`);
        } catch (err) {
            console.warn('[SYNC] Sync error, data preserved locally:', err);
            this.offline.addPendingChange(storeName, isDelete ? 'delete' : 'update', data, customKey);
            throw err;
        }
    }

    // ==================== PULL ====================
    /**
     * Pull művelet (letöltés a felhőből)
     */
    async pull(storeName, options = {}) {
        if (!this.cloud.client || !this.config.useSupabase) return [];
        try {
            const data = await this.cloud.select(storeName, options);
            return data;
        } catch (err) {
            console.warn(`[SYNC] Pull error from ${storeName}:`, err);
            return [];
        }
    }

    // ==================== TELJES SZINKRONIZÁCIÓ ====================
    /**
     * Teljes kétirányú szinkronizáció push + pull + merge
     */
    async sync() {
        // === 1. ELLENŐRZÉSEK ===
        if (this.isSyncing) {
            console.log('[SYNC] Már folyamatban van egy szinkronizáció.');
            return { status: 'already_running', message: 'Szinkronizáció már folyamatban van' };
        }

        if (!this.config.useSupabase || !this.cloud.client) {
            console.warn('[SYNC] Felhő nincs konfigurálva.');
            return { status: 'error', message: 'Felhő nincs konfigurálva' };
        }

        if (!navigator.onLine) {
            console.warn('[SYNC] Nincs internetkapcsolat.');
            return { status: 'offline', message: 'Nincs internetkapcsolat' };
        }

        this.isSyncing = true;
        console.log('[SYNC] 🔄 Teljes szinkronizáció indul...');

        const results = {
            status: 'success',
            startTime: new Date().toISOString(),
            tables: {},
            pendingProcessed: 0,
            errors: []
        };

        try {
            // === 2. FÜGGŐ VÁLTOZTATÁSOK FELDOLGOZÁSA ===
            if (this.offline) {
                const pendingCount = this.offline.getPendingCount();
                if (pendingCount > 0) {
                    console.log(`[SYNC] 📦 ${pendingCount} függő változtatás feldolgozása...`);
                    const processed = await this.offline.processPendingChanges();
                    results.pendingProcessed = processed;
                }
            }

            // === 3. PULL: ADATOK LETÖLTÉSE A FELHŐBŐL ===
            console.log('[SYNC] ⬇️ Pull: Adatok letöltése a felhőből...');
            const tables = ['items', 'months', 'entries', 'templates', 'reminders'];
            const cloudData = {};

            for (const table of tables) {
                try {
                    const data = await this.pull(table);
                    cloudData[table] = data;
                    results.tables[table] = { pulled: data.length };
                    console.log(`[SYNC] ✅ ${table}: ${data.length} elem letöltve`);
                } catch (err) {
                    console.warn(`[SYNC] ⚠️ Pull hiba a ${table} táblánál:`, err);
                    results.tables[table] = { pulled: 0, error: err.message };
                    results.errors.push({ table, operation: 'pull', error: err.message });
                }
            }

            // === 4. MERGE: ADATOK ÖSSZEFÉSÜLÉSE (időbélyeg alapján) ===
            console.log('[SYNC] 🔀 Merge: Adatok összefésülése...');
            
            // Helyi adatok betöltése
            const localData = {
                items: this._getLocalData('items'),
                months: this._getLocalData('months'),
                entries: this._getLocalData('entries'),
                templates: this._getLocalData('templates'),
                reminders: this._getLocalData('reminders')
            };

            // Merge eredmények
            const mergedData = {};
            let mergedCount = 0;

            for (const table of tables) {
                const local = localData[table] || [];
                const cloud = cloudData[table] || [];
                
                const merged = this._mergeTable(local, cloud, table);
                mergedData[table] = merged;
                mergedCount += merged.length;
                
                results.tables[table].merged = merged.length;
                console.log(`[SYNC] 🔀 ${table}: ${local.length} helyi + ${cloud.length} felhő → ${merged.length} merged`);
            }

            // === 5. PUSH: MERGED ADATOK FELTÖLTÉSE A FELHŐBE ===
            console.log('[SYNC] ⬆️ Push: Merged adatok feltöltése a felhőbe...');
            
            for (const table of tables) {
                const items = mergedData[table] || [];
                if (items.length === 0) continue;

                let pushedCount = 0;
                for (const item of items) {
                    try {
                        await this.push(table, item);
                        pushedCount++;
                    } catch (err) {
                        console.warn(`[SYNC] ⚠️ Push hiba a ${table} táblánál:`, err);
                        results.errors.push({ table, operation: 'push', error: err.message });
                    }
                }
                results.tables[table].pushed = pushedCount;
                console.log(`[SYNC] ✅ ${table}: ${pushedCount} elem feltöltve`);
            }

            // === 6. HELYI ADATBÁZIS FRISSÍTÉSE ===
            console.log('[SYNC] 💾 Helyi adatbázis frissítése...');
            await this._saveMergedToLocal(mergedData);

            // === 7. MEMÓRIA ÉS UI FRISSÍTÉS ===
            console.log('[SYNC] 🔄 Memória és UI frissítése...');
            await this._reloadAndRender();

            // === 8. BEFEJEZÉS ===
            this.lastSyncTime = new Date();
            results.endTime = this.lastSyncTime.toISOString();
            results.duration = (new Date(results.endTime) - new Date(results.startTime)) / 1000 + 's';
            
            console.log(`[SYNC] ✅ Szinkronizáció befejezve (${results.duration})`);
            console.log('[SYNC] 📊 Eredmények:', results);

            this.syncResults = results;
            return results;

        } catch (error) {
            console.error('[SYNC] ❌ Kritikus hiba:', error);
            results.status = 'error';
            results.error = error.message;
            this.syncResults = results;
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    // ==================== SEGÉDFÜGGVÉNYEK ====================

    /**
     * Helyi adatok lekérése a manager-ekből
     */
    _getLocalData(table) {
        const app = this._getApp();
        if (!app) return [];

        switch (table) {
            case 'items': return app.items?.items || [];
            case 'months': return app.months?.months?.map(m => ({ month: m })) || [];
            case 'entries': return app.entries?.entries || [];
            case 'templates': return app.templates?.templates || [];
            case 'reminders': return app.reminderManager?.reminders || [];
            default: return [];
        }
    }

    /**
     * App referenciát szerzünk (több útvonalon)
     */
    _getApp() {
        return window.app || this._app || null;
    }

    /**
     * App referencia beállítása (kívülről)
     */
    setApp(app) {
        this._app = app;
    }

    /**
     * Két tábla összefésülése (időbélyeg alapján)
     */
    _mergeTable(localItems, cloudItems, table) {
        const merged = [];
        const keyMap = {};
        const keyField = table === 'months' ? 'month' : 'id';

        // Helyi adatok betöltése
        localItems.forEach(item => {
            const key = item[keyField];
            if (key !== undefined && key !== null) {
                keyMap[key] = { 
                    ...item, 
                    _source: 'local',
                    _updated_at: item.updated_at || item.timestamp || new Date().toISOString()
                };
            }
        });

        // Felhő adatok összefésülése (frissebb nyer)
        cloudItems.forEach(item => {
            const key = item[keyField];
            if (key === undefined || key === null) return;

            if (keyMap[key]) {
                // Összehasonlítás időbélyeg alapján
                const localTime = new Date(keyMap[key]._updated_at || 0);
                const cloudTime = new Date(item.updated_at || item.timestamp || 0);

                if (cloudTime > localTime) {
                    // Felhő frissebb → felülírjuk a helyit
                    keyMap[key] = { 
                        ...item, 
                        _source: 'merged (cloud wins)', 
                        _updated_at: item.updated_at || new Date().toISOString()
                    };
                } else {
                    // Helyi frissebb → megtartjuk a helyit
                    keyMap[key]._source = 'merged (local wins)';
                }
            } else {
                // Nincs helyi → felhőből jön
                keyMap[key] = { 
                    ...item, 
                    _source: 'merged (from cloud)',
                    _updated_at: item.updated_at || new Date().toISOString()
                };
            }
        });

        // Map-ből tömb (belső mezők tisztítása)
        for (const key in keyMap) {
            const item = keyMap[key];
            const { _source, _updated_at, ...cleanItem } = item;
            merged.push(cleanItem);
        }

        return merged;
    }

    /**
     * Merged adatok mentése a helyi IndexedDB-be
     */
    async _saveMergedToLocal(mergedData) {
        const app = this._getApp();
        if (!app || !app.db) return;

        const tables = [
            { name: 'items', data: mergedData.items || [], key: 'id' },
            { name: 'months', data: mergedData.months || [], key: 'month' },
            { name: 'entries', data: mergedData.entries || [], key: 'id' },
            { name: 'templates', data: mergedData.templates || [], key: 'id' },
            { name: 'reminders', data: mergedData.reminders || [], key: 'id' }
        ];

        for (const { name, data, key } of tables) {
            if (data.length === 0) continue;

            for (const item of data) {
                try {
                    // Időbélyeg biztosítása
                    if (!item.updated_at) {
                        item.updated_at = new Date().toISOString();
                    }
                    await app.db.save(name, item);
                } catch (e) {
                    console.warn(`[SYNC] Helyi mentési hiba a ${name} táblánál:`, e);
                }
            }
        }
    }

    /**
     * Memória és UI frissítése
     */
    async _reloadAndRender() {
        const app = this._getApp();
        if (!app) return;

        try {
            await Promise.all([
                app.items?.load?.() || Promise.resolve(),
                app.months?.load?.() || Promise.resolve(),
                app.entries?.load?.() || Promise.resolve(),
                app.templates?.load?.() || Promise.resolve(),
                app.reminderManager?.load?.() || Promise.resolve()
            ]);

            app.renderer?.renderTable?.();
            app.renderer?.renderSummary?.();
            app.remindersRenderer?.renderList?.();
            app.renderStats?.();

            // Ha a charts tab aktív, frissítsük
            if (app.activeTab === 'charts' && app.chartsRenderer) {
                app.chartsRenderer.renderAll(app.currentFilter);
            }

            // Ha a statisztika tab aktív, frissítsük
            if (app.activeTab === 'stats') {
                app.renderStats?.();
            }

            // Reminder státusz frissítése
            app.updateReminderStatus?.();

        } catch (e) {
            console.warn('[SYNC] UI frissítési hiba:', e);
        }
    }

    // ==================== INFORMÁCIÓS METÓDUSOK ====================

    /**
     * Szinkronizációs státusz lekérése
     */
    getStatus() {
        const app = this._getApp();
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            hasCloud: !!this.cloud.client,
            useCloud: this.config.useSupabase,
            pendingChanges: this.offline?.getPendingCount?.() || 0,
            hasApp: !!app,
            syncResults: this.syncResults
        };
    }

    /**
     * Utolsó szinkronizációs eredmények
     */
    getLastResults() {
        return this.syncResults;
    }

    /**
     * CloudSync újrainicializálása
     */
    reinit() {
        this.cloud.init();
    }

    /**
     * Pusztán pull művelet (csak letöltés, merge nélkül)
     */
    async pullOnly(table) {
        if (!this.cloud.client || !this.config.useSupabase) return [];
        
        try {
            const data = await this.cloud.select(table);
            return data;
        } catch (err) {
            console.warn(`[SYNC] Pull-only error from ${table}:`, err);
            return [];
        }
    }

    /**
     * Pusztán push művelet (csak feltöltés, merge nélkül)
     */
    async pushOnly(table, data) {
        if (!navigator.onLine) {
            console.log(`[SYNC] Offline, push-only naplózva: ${table}`);
            this.offline.addPendingChange(table, 'update', data);
            return;
        }

        if (!this.cloud.client || !this.config.useSupabase) return;

        try {
            await this.cloud.upsert(table, data);
            console.log(`[SYNC] Push-only ${table} successful`);
        } catch (err) {
            console.warn('[SYNC] Push-only error:', err);
            this.offline.addPendingChange(table, 'update', data);
            throw err;
        }
    }
}