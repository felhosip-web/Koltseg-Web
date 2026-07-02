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
        this.isActive = false;
        console.log('[BACKGROUND] Paused due to visibilitychange');
    }

    resume() {
        this.isActive = true;
        console.log('[BACKGROUND] Resumed');
        // opcionális: azonnali check
        this._checkOverdueReminders?.();
    }
    
    loadSettings() {
        const saved = localStorage.getItem('backgroundTaskSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    }

    saveSettings() {
        localStorage.setItem('backgroundTaskSettings', JSON.stringify(this.settings));
    }
    
    startAll() {
        this.loadSettings();
        this.startReminderChecker();
        this.startAutoSync();
        this.startAutoBackup();
        this.startEURRateWatcher();
        console.log('[BACKGROUND] Minden háttérfolyamat elindítva');
    }

    // ==================== 1. Emlékeztető ellenőrzés ====================
    startReminderChecker() {
        if (this.intervals.reminder) clearInterval(this.intervals.reminder);

        this.intervals.reminder = setInterval(() => {
            if (!this.isActive) return;
            this._checkOverdueReminders();
        }, 5 * 60 * 1000); // 5 percenként
    }

    async _checkOverdueReminders() {
        const reminders = this.app.reminderManager?.reminders || [];
        const today = dayjs();
        let overdue = 0;

        reminders.forEach(rem => {
            if (rem.completed) return;
            const due = dayjs(rem.due_date);
            if (due.isBefore(today, 'day')) overdue++;
        });

        if (overdue > 0) {
            this.app.updateReminderStatus?.();
            
            // Értesítés
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`${overdue} lejárt határidő!`, {
                    body: "Kérjük, ellenőrizze a Határidők fület.",
                    icon: "/icons/icon-192.png",
                    tag: "overdue-reminders"
                });
            }
        }
    }

    // ==================== 2. Automatikus Szinkronizáció ====================
    startAutoSync() {
        if (this.intervals.sync) clearInterval(this.intervals.sync);

        this.intervals.sync = setInterval(async () => {
            if (!this.isActive || !navigator.onLine) return;
            
            const config = this.app.config;
            if (!config?.useSupabase) return;

            try {
                if (this.app.syncManager?.hasPendingChanges?.()) {
                    await this.app.syncManager.processPendingChanges();
                }
                // Teljes sync csak 30 percenként
                if (Math.random() < 0.3) {
                    await this.app.syncManager?.sync?.();
                }
            } catch (e) {
                console.warn('[BACKGROUND] Auto-sync hiba:', e);
            }
        }, 10 * 60 * 1000); // 10 percenként
    }

    // ==================== 3. Automatikus Backup ====================
    startAutoBackup() {
        if (this.intervals.backup) clearInterval(this.intervals.backup);

        this.intervals.backup = setInterval(() => {
            if (!this.isActive) return;
            this.app.backupManager?.performBackup?.();
        }, 25 * 60 * 1000); // 25 percenként
    }

    // ==================== 4. EUR Árfolyam figyelés ====================
    startEURRateWatcher() {
        if (this.intervals.eur) clearInterval(this.intervals.eur);

        this.intervals.eur = setInterval(async () => {
            if (!this.isActive) return;
            await this.app.config?.watchDogEur?.((rate, mode) => {
                this.app.renderer?.updateLed?.(rate, mode);
            });
        }, 60 * 60 * 1000); // óránként
    }

    // ==================== Segédmetódusok ====================
    stopAll() {
        Object.values(this.intervals).forEach(id => clearInterval(id));
        this.isActive = false;
        this.intervals = {};
        console.log('[BACKGROUND] Minden háttérfolyamat leállítva');
    }

    resume() {
        this.isActive = true;
        this.startAll();
    }
    
        destroy() {
        Object.values(this.intervals).forEach(id => {
            if (id) clearInterval(id);
        });
        this.intervals = {};
        this.isActive = false;
        console.log('[BackgroundTaskManager] Összes háttérfolyamat leállítva');
    }
}