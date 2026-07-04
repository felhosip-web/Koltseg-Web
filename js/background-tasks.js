// js/background-tasks.js - Háttérfolyamatok központi kezelése
export class BackgroundTaskManager {
    constructor(app) {
        this.app = app;
        this.intervals = {};
        this.isActive = true;
        this.settings = {
            reminderInterval: 5,      // perc
            syncInterval: 10,         // perc
            backupInterval: 25        // perc
        };
    }
    
    pause() {
        if (!this.isActive) return;
        this.isActive = false;
        console.log('[BACKGROUND] Paused due to visibilitychange');
    }

    resume() {
        if (this.isActive) return;
        this.isActive = true;
        console.log('[BACKGROUND] Resumed');

        if (!this.intervals.reminder && !this.intervals.sync && !this.intervals.backup && !this.intervals.eur) {
            this.startAll();
            return;
        }

        this._checkOverdueReminders?.();
    }
    
    loadSettings() {
        const saved = localStorage.getItem('backgroundTaskSettings');
        if (!saved) return;

        try {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                const nextSettings = { ...this.settings };
                if (Number.isFinite(parsed.reminderInterval) && parsed.reminderInterval > 0) {
                    nextSettings.reminderInterval = parsed.reminderInterval;
                }
                if (Number.isFinite(parsed.syncInterval) && parsed.syncInterval > 0) {
                    nextSettings.syncInterval = parsed.syncInterval;
                }
                if (Number.isFinite(parsed.backupInterval) && parsed.backupInterval > 0) {
                    nextSettings.backupInterval = parsed.backupInterval;
                }
                this.settings = nextSettings;
            }
        } catch (error) {
            console.warn('[BACKGROUND] backgroundTaskSettings parse error:', error);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('backgroundTaskSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.warn('[BACKGROUND] saveSettings failed:', error);
        }
    }
    
    startAll() {
        this.loadSettings();
        this.startReminderChecker();
        this.startAutoSync();
        // NOTE: Backup-ot a BackupManager indítja (boot-manager.js)
        this.startEURRateWatcher();
        console.log('[BACKGROUND] Minden háttérfolyamat elindítva');
    }

    startAutoBackup() {
        // DEPRECATED: BackupManager indítja az auto-backup-ot (boot-manager.js)
        console.log('[BACKGROUND] startAutoBackup() deprecated – BackupManager kezeli');
    }

    // ==================== 1. Emlékeztető ellenőrzés ====================
    startReminderChecker() {
        if (this.intervals.reminder) clearInterval(this.intervals.reminder);

        this.intervals.reminder = setInterval(() => {
            if (!this.isActive) return;
            this._checkOverdueReminders();
        }, this.settings.reminderInterval * 60 * 1000);

        this._checkOverdueReminders();
    }

    async _checkOverdueReminders() {
        const reminders = this.app.reminderManager?.reminders || [];
        const today = dayjs();
        let overdue = 0;

        reminders.forEach(rem => {
            if (rem.completed) return;
            const due = dayjs(rem.due_date);
            if (!due.isValid()) return;
            if (due.isBefore(today, 'day')) overdue++;
        });

        if (overdue > 0) {
            this.app.updateReminderStatus?.();
            
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`${overdue} lejárt határidő!`, {
                    body: 'Kérjük, ellenőrizze a Határidők fület.',
                    icon: '/icons/icon-192.png',
                    tag: 'overdue-reminders'
                });
            }
        }
    }

    // ==================== 2. Automatikus Szinkronizáció ====================
    startAutoSync() {
        if (this.intervals.sync) clearInterval(this.intervals.sync);

        this.intervals.sync = setInterval(async () => {
            if (!this.isActive || !navigator.onLine) return;
            
            if (!this.app.config?.useSupabase) return;

            try {
                if (this.app.syncManager?.hasPendingChanges?.()) {
                    await this.app.syncManager.processPendingChanges();
                }
                if (Math.random() < 0.3) {
                    await this.app.syncManager?.sync?.();
                }
            } catch (e) {
                console.warn('[BACKGROUND] Auto-sync hiba:', e);
            }
        }, this.settings.syncInterval * 60 * 1000);
    }

    // ==================== 3. Automatikus Backup ====================
    startAutoBackup() {
        if (this.intervals.backup) clearInterval(this.intervals.backup);

        this.intervals.backup = setInterval(() => {
            if (!this.isActive) return;
            this.app.backupManager?.performBackup?.();
        }, this.settings.backupInterval * 60 * 1000);
    }

    // ==================== 4. EUR Árfolyam figyelés ====================
    startEURRateWatcher() {
        if (this.intervals.eur) clearInterval(this.intervals.eur);

        this.intervals.eur = setInterval(async () => {
            if (!this.isActive) return;
            await this.app.config?.watchDogEur?.((rate, mode) => {
                this.app.renderer?.updateLed?.(rate, mode);
            });
        }, 60 * 60 * 1000);
    }

    // ==================== Segédmetódusok ====================
    stopAll() {
        Object.values(this.intervals).forEach(id => clearInterval(id));
        this.intervals = {};
        this.isActive = false;
        console.log('[BACKGROUND] Minden háttérfolyamat leállítva');
    }

    destroy() {
        this.stopAll();
        console.log('[BackgroundTaskManager] Összes háttérfolyamat leállítva');
    }
}