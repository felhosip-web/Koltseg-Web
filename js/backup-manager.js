// js/backup-manager.js
//Backup kezelés
import { validateWorkRecord } from './utils/work-validation.js';

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
            works: this.app.workLogManager?.works || [],
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

    async performBackup() {
        try {
            if (!this.app.storage) {
                console.warn('[BACKUP] Storage nem elérhető');
                return;
            }

            const backupData = this._buildBackupData();
            
            this.app.storage.set('backup', backupData);
            this.app.storage.set('lastBackupTime', Date.now());
            this.lastBackupTime = Date.now();
            
            this.app.setSystemStatus?.(
                `💾 Auto-mentés: ${new Date().toLocaleTimeString('hu-HU')}`,
                false
            );
            
            console.log('[BACKUP] Automatikus mentés kész');
            
            // Ha a Google Drive be van állítva és van internet, feltöltjük oda is
            if (navigator.onLine && this.app.gdriveBackup && this.app.gdriveBackup.isConfigured()) {
                console.log('[BACKUP] Google Drive backup indítása a háttérben...');
                // Nem várjuk meg (async háttér folyamat)
                this.app.gdriveBackup.uploadBackup(backupData).then(result => {
                    if (result && result.success) {
                        console.log('[BACKUP] Google Drive sikeres.');
                        this.app.setSystemStatus?.(`☁️ GDrive mentve: ${new Date().toLocaleTimeString('hu-HU')}`, false);
                    }
                }).catch(err => {
                    console.warn('[BACKUP] Google Drive feltöltés hiba:', err);
                });
            }

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
            // Reject explicitly null works property
            if (backupData.works === null) {
                throw new Error('A backup works szekciója érvénytelen (null nem megengedett)!');
            }

            // Validate complete works section and check for duplicate IDs BEFORE beginning any destructive database transactions
            let shouldRestoreWorks = false;
            let validatedWorks = [];
            if (backupData.works !== undefined) {
                if (!Array.isArray(backupData.works)) {
                    throw new Error('A backup works szekciója érvénytelen (tömb szükséges)!');
                }
                const seenIds = new Set();
                for (let i = 0; i < backupData.works.length; i++) {
                    const item = backupData.works[i];
                    const valRes = validateWorkRecord(item, { requireComplete: true });
                    if (!valRes.valid) {
                        throw new Error(`Érvénytelen munka bejegyzés a backupban (#${i + 1}): ${valRes.error}`);
                    }
                    if (seenIds.has(item.id)) {
                        throw new Error(`Duplikált munka azonosító a backupban: ${item.id}`);
                    }
                    seenIds.add(item.id);
                    validatedWorks.push(valRes.sanitizedRecord);
                }
                shouldRestoreWorks = true;
            }

            this.app.setSystemStatus?.('Backup visszaállítása...', true);
            
            const dbRaw = this.app.db?.db || this.app.db?._db;
            if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');

            const activeStores = [
                'items',
                'months',
                'entries',
                'templates',
                'reminders',
                'incomings',
                'incoming_senders'
            ];
            if (shouldRestoreWorks) {
                activeStores.push('works');
            }
            
            const tx = dbRaw.transaction(activeStores, 'readwrite');
            
            try {
                // Törlés
                tx.objectStore('items').clear();
                tx.objectStore('months').clear();
                tx.objectStore('entries').clear();
                tx.objectStore('templates').clear();
                tx.objectStore('reminders').clear();
                tx.objectStore('incomings').clear();
                tx.objectStore('incoming_senders').clear();
                if (shouldRestoreWorks) {
                    tx.objectStore('works').clear();
                }

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
                if (shouldRestoreWorks) {
                    validatedWorks.forEach(work => tx.objectStore('works').put(work));
                }
            } catch (syncPutErr) {
                if (typeof tx.abort === 'function') {
                    try { tx.abort(); } catch (_) {}
                }
                throw syncPutErr;
            }
            
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
                this.app.incomingManager?.load?.(),
                this.app.workLogManager?.load?.()
            ]);
            
            this.app.updateReactStore?.();
            this.app.updateReminderStatus?.();
            
            this.app.hmiNotif.showToast('✅ Backup sikeresen visszaállítva!', 'success');
            this.app.setSystemStatus?.('Backup restore kész', false);
            
        } catch (err) {
            console.error('[RESTORE ERROR]', err);
            this.app.hmiNotif.showToast(`❌ Visszaállítási hiba: ${err.message}`, 'error');
            this.app.setSystemStatus?.('Backup restore hiba!', true);
        }
    }
}
