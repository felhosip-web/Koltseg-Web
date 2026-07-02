// js/backup-manager.js
//Backup kezelés
export class BackupManager {
    constructor(app) {
        this.app = app;
        this.intervalId = null;
        this.backupInterval = 15 * 60 * 1000; // 15 perc
        this.lastBackupTime = null;
    }

    startAutoBackup() {
        // Utolsó mentés ellenőrzése
        this.lastBackupTime = this.app.storage.get('lastBackupTime');
        const now = Date.now();
        
        // Ha több mint 15 perc telt el az utolsó mentés óta
        if (this.lastBackupTime && (now - this.lastBackupTime) > this.backupInterval) {
            this.performBackup();
        }
        
        // Időzítő indítása
        if (this.intervalId) {
           clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => {
            this.performBackup();
        }, this.backupInterval);
        
        console.log(`[BACKUP] Automatikus backup indul (${this.backupInterval / 60000} perc)`);
    }

    stopAutoBackup() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[BACKUP] Automatikus backup leállítva');
        }
    }

    performBackup() {
        try {
            const backupData = {
                version: 'v4.0',
                timestamp: new Date().toISOString(),
                items: this.app.items.items,
                months: this.app.months.months,
                entries: this.app.entries.entries,
                templates: this.app.templates?.templates || [],
                reminders: this.app.reminderManager?.reminders || [],
                supabaseConfig: {
                    url: this.app.config.supabaseConfig.url,
                    useCloud: this.app.config.useSupabase
                },
                settings: {
                    eurRate: this.app.config.eurRate
                }
            };
            
            this.app.storage.set('backup', backupData);
            this.app.storage.set('lastBackupTime', Date.now());
            this.lastBackupTime = Date.now();
            
            // Lábban jelzés
            this.app.renderer.updateFooterStatus(
                `💾 Auto-mentés: ${new Date().toLocaleTimeString('hu-HU')}`, 
                false
            );
            
            console.log('[BACKUP] Automatikus mentés kész');
            
        } catch (e) {
            console.warn('[BACKUP] Automatikus mentés sikertelen:', e);
        }
    }

    async restoreFromBackup() {
        const backupData = this.app.storage.get('backup');
        if (!backupData) {
            this.app.hmiNotif.showToast('Nincs mentett backup!', 'error');
            return;
        }
        
        const confirmed = await this.app.hmiNotif.showConfirm(
            '🔙 Visszaállítás backupból',
            `Biztosan visszaállítja a ${backupData.timestamp} időpontban készült backupot?\n\nEz felülírja az összes jelenlegi adatot!`,
            true,
            'Visszaállítás'
        );
        
        if (!confirmed) return;
        
        try {
            this.app.renderer.updateFooterStatus('Backup visszaállítása...', false);
            
            const dbRaw = this.app.db.db || this.app.db._db;
            if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');
            
            const tx = dbRaw.transaction(['items', 'months', 'entries', 'templates', 'reminders'], 'readwrite');
            
            // Törlés
            tx.objectStore('items').clear();
            tx.objectStore('months').clear();
            tx.objectStore('entries').clear();
            tx.objectStore('templates').clear();
            tx.objectStore('reminders').clear();
            
            // Visszaírás
            backupData.items?.forEach(item => tx.objectStore('items').put(item));
            backupData.months?.forEach(m => tx.objectStore('months').put({ month: m }));
            backupData.entries?.forEach(entry => tx.objectStore('entries').put(entry));
            backupData.templates?.forEach(tpl => tx.objectStore('templates').put(tpl));
            backupData.reminders?.forEach(rem => tx.objectStore('reminders').put(rem));
            
            await new Promise((resolve) => {
                tx.oncomplete = resolve;
                tx.onerror = resolve;
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
            
            this.app.hmiNotif.showToast('✅ Backup sikeresen visszaállítva!', 'success');
            this.app.renderer.updateFooterStatus('Backup restore kész', false);
            
        } catch (err) {
            console.error('[RESTORE ERROR]', err);
            this.app.hmiNotif.showToast('❌ Visszaállítási hiba!', 'error');
        }
    }
}