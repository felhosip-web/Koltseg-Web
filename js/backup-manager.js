// js/backup-manager.js
//Backup kezelés
export class BackupManager {
    constructor(app) {
        this.app = app;
        this.intervalId = null;
        this.backupInterval = 15 * 60 * 1000; // 15 perc
        this.lastBackupTime = null;
    }

    _buildBackupData() {
        return {
            version: 'v4.0',
            timestamp: new Date().toISOString(),
            items: this.app.items?.items || [],
            months: this.app.months?.months || [],
            entries: this.app.entries?.entries || [],
            templates: this.app.templates?.templates || [],
            reminders: this.app.reminderManager?.reminders || [],
            incomings: this.app.incomingManager?.incomings || [],
            incoming_senders: this.app.incomingManager?.senders || [],
            supabaseConfig: {
                url: this.app.config?.supabaseConfig?.url || '',
                useCloud: this.app.config?.useSupabase || false
            },
            settings: {
                eurRate: this.app.config?.eurRate || 400
            }
        };
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

    destroy() {
        this.stopAutoBackup();
        console.log('[BACKUP] BackupManager megsemmisítve');
    }

    performBackup() {
        try {
            if (!this.app.storage) {
                console.warn('[BACKUP] Storage nem elérhető');
                return;
            }

            const backupData = this._buildBackupData();
            
            this.app.storage.set('backup', backupData);
            this.app.storage.set('lastBackupTime', Date.now());
            this.lastBackupTime = Date.now();
            
            if (this.app.renderer?.updateFooterStatus) {
                this.app.renderer.updateFooterStatus(
                    `💾 Auto-mentés: ${new Date().toLocaleTimeString('hu-HU')}`, 
                    false
                );
            }
            
            console.log('[BACKUP] Automatikus mentés kész');
            
        } catch (e) {
            console.warn('[BACKUP] Automatikus mentés sikertelen:', e);
        }
    }

    async restoreFromBackup() {
        if (!this.app.storage) {
            this.app.hmiNotif.showToast('Storage nem elérhető!', 'error');
            return;
        }

        const backupData = this.app.storage.get('backup');
        if (!backupData) {
            this.app.hmiNotif.showToast('Nincs mentett backup!', 'error');
            return;
        }
        
        const confirmed = await this.app.hmiNotif.showConfirm({
            title: '🔙 Visszaállítás backupból',
            message: `Biztosan visszaállítja a ${new Date(backupData.timestamp).toLocaleString('hu-HU')} időpontban készült backupot?\n\nEz felülírja az összes jelenlegi adatot!`,
            type: 'warning',
            confirmText: 'Visszaállítás',
            showCancel: true
        });
        
        if (!confirmed) return;
        
        try {
            if (this.app.renderer?.updateFooterStatus) {
                this.app.renderer.updateFooterStatus('Backup visszaállítása...', true);
            }
            
            const dbRaw = this.app.db?.db || this.app.db?._db;
            if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');
            
            const tx = dbRaw.transaction([
                'items',
                'months',
                'entries',
                'templates',
                'reminders',
                'incomings',
                'incoming_senders'
            ], 'readwrite');
            
            // Törlés
            tx.objectStore('items').clear();
            tx.objectStore('months').clear();
            tx.objectStore('entries').clear();
            tx.objectStore('templates').clear();
            tx.objectStore('reminders').clear();
            tx.objectStore('incomings').clear();
            tx.objectStore('incoming_senders').clear();
            
            // Visszaírás - helyesen
            backupData.items?.forEach(item => tx.objectStore('items').put(item));
            backupData.months?.forEach(m => {
                const monthData = typeof m === 'object' ? m : { month: m };
                tx.objectStore('months').put(monthData);
            });
            backupData.entries?.forEach(entry => tx.objectStore('entries').put(entry));
            backupData.templates?.forEach(tpl => tx.objectStore('templates').put(tpl));
            backupData.reminders?.forEach(rem => tx.objectStore('reminders').put(rem));
            backupData.incomings?.forEach(incoming => tx.objectStore('incomings').put(incoming));
            backupData.incoming_senders?.forEach(sender => tx.objectStore('incoming_senders').put(sender));
            
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(new Error(`DB restore hiba: ${tx.error}`));
            });
            
            // Memória és UI frissítés
            await Promise.all([
                this.app.items?.load?.(),
                this.app.months?.load?.(),
                this.app.entries?.load?.(),
                this.app.templates?.load?.(),
                this.app.reminderManager?.load?.(),
                this.app.incomingManager?.load?.()
            ]);
            
            this.app.renderer?.renderTable?.();
            this.app.remindersRenderer?.renderList?.();
            this.app.incomingRenderer?.render?.();
            this.app.renderStats?.();
            this.app.renderDashboard?.();
            
            this.app.hmiNotif.showToast('✅ Backup sikeresen visszaállítva!', 'success');
            if (this.app.renderer?.updateFooterStatus) {
                this.app.renderer.updateFooterStatus('Backup restore kész', false);
            }
            
        } catch (err) {
            console.error('[RESTORE ERROR]', err);
            this.app.hmiNotif.showToast(`❌ Visszaállítási hiba: ${err.message}`, 'error');
            if (this.app.renderer?.updateFooterStatus) {
                this.app.renderer.updateFooterStatus('Backup restore hiba!', true);
            }
        }
    }
}
