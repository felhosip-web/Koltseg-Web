// js/data-maintenance-controller.js - Karbantartási műveletek (Wipe, Backup, Restore)
export class DataMaintenanceController {
    constructor(app) {
        this.app = app;
    }

    // ==================== TELJES ADATBÁZIS TÖRLÉSE ====================
    async wipeDatabase() {
        const firstConfirm = await this.app.hmiNotif.showConfirm({
            title: '🚨 MINDEN HELYI ADAT TÖRLÉSE',
            message: 'Biztosan ki akarja törölni a **TELJES** helyi adatbázist?\n\nMinden kategória, hónap, tranzakció, sablon és határidő törlődni fog!',
            type: 'danger',
            confirmText: 'IGEN, TÖRÖLJÖM'
        });

        if (!firstConfirm) return;

        const secondConfirm = await this.app.hmiNotif.showConfirm({
            title: '🚨 VÉGSŐ BIZTONSÁGI ELLENŐRZÉS',
            message: 'Ez a művelet **visszafordíthatatlan**!\n\nBiztosan törli az összes helyi adatot?',
            type: 'danger',
            confirmText: 'VÉGLEGES TÖRLÉS'
        });

        if (!secondConfirm) return;

        try {
            this.app.renderer.updateFooterStatus('Adatbázis teljes törlése...', true);

            const dbRaw = this.app.db.db || this.app.db._db;
            if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');

            const tx = dbRaw.transaction(['items', 'months', 'entries', 'templates', 'reminders'], 'readwrite');

            tx.objectStore('items').clear();
            tx.objectStore('months').clear();
            tx.objectStore('entries').clear();
            tx.objectStore('templates').clear();
            tx.objectStore('reminders').clear();

            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });

            // Memória és UI frissítés
            await Promise.all([
                this.app.items.load(),
                this.app.months.load(),
                this.app.entries.load(),
                this.app.templates?.load?.(),
                this.app.reminderManager?.load?.()
            ]);

            this.app.renderer.renderTable();
            this.app.remindersRenderer?.renderList?.();
            this.app.renderStats?.();

            this.app.hmiNotif.showToast('🗑️ Minden helyi adat törölve!', 'error');
            this.app.renderer.updateFooterStatus('Adatbázis kiürítve', false);

        } catch (err) {
            console.error('[WIPE DATABASE ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ Törlési hiba', err.message || 'Ismeretlen hiba');
            this.app.renderer.updateFooterStatus('Törlési hiba!', true);
        }
    }

    // ==================== MANUÁLIS BACKUP ====================
    async performManualBackup() {
        try {
            this.app.renderer.updateFooterStatus('Manuális backup készítése...', false);

            const backupData = {
                version: 'v4.0',
                timestamp: new Date().toISOString(),
                items: this.app.items.items || [],
                months: this.app.months.months || [],
                entries: this.app.entries.entries || [],
                templates: this.app.templates?.templates || [],
                reminders: this.app.reminderManager?.reminders || [],
                supabaseConfig: {
                    url: this.app.config?.supabaseConfig?.url || '',
                    useCloud: this.app.config?.useSupabase || false
                },
                settings: {
                    eurRate: this.app.config?.eurRate || 400
                }
            };

            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const anchor = document.createElement('a');
            anchor.href = dataStr;
            anchor.download = `koltseg_manual_backup_${new Date().toISOString().slice(0,10)}.json`;
            anchor.click();

            this.app.hmiNotif.showToast('✅ Manuális backup letöltve!', 'success');
            this.app.renderer.updateFooterStatus('Backup kész', false);

        } catch (err) {
            console.error('[MANUAL BACKUP ERROR]', err);
            await this.app.hmiNotif.showInfo('Backup hiba', err.message || 'Ismeretlen hiba');
        }
    }

    // ==================== BACKUP VISSZAÁLLÍTÁS ====================
    async restoreFromBackup() {
        if (!this.app.backupManager) {
            await this.app.hmiNotif.showInfo('Nincs backup manager', 'A visszaállítási funkció nem elérhető.');
            return;
        }

        await this.app.backupManager.restoreFromBackup();
    }

    // ==================== CACHE TAKARÍTÁS ====================
    async clearCaches() {
        try {
            if (this.app.renderer?.clearCache) this.app.renderer.clearCache();
            if (this.app.chartsRenderer?.destroy) this.app.chartsRenderer.destroy();
            if (this.app.backgroundTasks?.destroy) this.app.backgroundTasks.destroy();

            this.app.hmiNotif.showToast('✅ Cache-ek takarítva', 'success');
            console.log('[MAINTENANCE] Cache takarítás végrehajtva');
        } catch (err) {
            console.warn('[CACHE CLEAR ERROR]', err);
        }
    }
}