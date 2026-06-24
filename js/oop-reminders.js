// js/oop-reminders.js - Modern OOP Reminders Component
import { Database, ConfigManager, CloudSync } from './oop-core.js';
import { UIModalController } from './ui-modal-controller.js';

export class ReminderManager {
    constructor(db, cloud) {
        this.db = db;
        this.cloud = cloud;
        this.reminders = [];
    }

    async load() {
        this.reminders = await this.db.getAll('reminders');
        await this.autoGenerateRecurring();
    }

    async autoGenerateRecurring() {
        let updated = false;
        const today = dayjs();
        for (const rem of this.reminders) {
            if (rem.frequency && rem.frequency !== 'once') {
                let dueDate = dayjs(rem.due_date);
                while (dueDate.isBefore(today, 'day')) {
                    if (rem.frequency === 'monthly') dueDate = dueDate.add(1, 'month');
                    else if (rem.frequency === 'quarterly') dueDate = dueDate.add(3, 'month');
                    else if (rem.frequency === 'yearly') dueDate = dueDate.add(1, 'year');
                    rem.due_date = dueDate.format('YYYY-MM-DD');
                    rem.updated_at = new Date().toISOString();
                    await this.db.save('reminders', rem);
                    await this.cloud.push('reminders', rem);
                    updated = true;
                }
            }
        }
        if (updated) this.reminders = await this.db.getAll('reminders');
    }

    async add(reminder) {
        reminder.updated_at = new Date().toISOString();
        reminder.id = await this.db.save('reminders', reminder);
        this.reminders.push(reminder);
        await this.cloud.push('reminders', reminder);
        return reminder;
    }

    async update(id, updatedData) {
        const idx = this.reminders.findIndex(r => r.id === id);
        if (idx === -1) return;
        const reminder = {
            ...this.reminders[idx],
            ...updatedData,
            updated_at: new Date().toISOString()
        };
        await this.db.save('reminders', reminder);
        this.reminders[idx] = reminder;
        await this.cloud.push('reminders', reminder);
        return reminder;
    }

    async delete(id) {
        await this.db.delete('reminders', id);
        this.reminders = this.reminders.filter(r => r.id !== id);
        await this.cloud.push('reminders', id, true);
    }
}

export class RemindersRenderer {
    constructor(app, hmiNotif) {
        this.app = app;
        this.hmiNotif = hmiNotif;
    }

    renderList() {
        const container = document.getElementById('remindersTableBody');
        if (!container) return;

        const list = this.app.reminderManager.reminders;
        if (list.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="text-center text-gray-400 py-8">Nincsenek aktív határidők.</td></tr>`;
            return;
        }

        let html = '';
        list.forEach(rem => {
            const due = dayjs(rem.due_date);
            const today = dayjs();
            const diffDays = due.diff(today, 'day');
            let statusText, statusColor;
            if (diffDays < 0) {
                statusText = 'LEJÁRT';
                statusColor = 'bg-red-500';
            } else if (diffDays <= 3) {
                statusText = 'ESEDÉKES';
                statusColor = 'bg-amber-500';
            } else {
                statusText = 'AKTÍV';
                statusColor = 'bg-emerald-500';
            }

            html += `<tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                <td class="p-3"><span class="${statusColor} text-white text-[10px] font-black px-2 py-0.5 rounded-full">${statusText}</span></td>
                <td class="p-3 font-medium text-gray-800">${rem.title}</td>
                <td class="p-3 text-gray-600">${rem.frequency === 'once' ? 'Egyszeri' : rem.frequency === 'monthly' ? 'Havi' : rem.frequency === 'quarterly' ? 'Negyedéves' : 'Éves'}</td>
                <td class="p-3 font-mono text-sm">${rem.due_date}</td>
                <td class="p-3 font-mono text-sm">${diffDays < 0 ? 'Múltbéli' : diffDays + ' nap'}</td>
                <td class="p-3 font-bold">${rem.amount.toLocaleString()} ${rem.currency || 'HUF'}</td>
                <td class="p-3 text-right flex gap-2 justify-end">
                    <button class="btn-edit-reminder p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition" data-id="${rem.id}">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-delete-reminder p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition" data-id="${rem.id}">
                        <i class="fas fa-trash-can"></i>
                    </button>
                </td>
            </tr>`;
        });
        container.innerHTML = html;

        // Törlés
        container.querySelectorAll('.btn-delete-reminder').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const confirmed = await this.hmiNotif.showConfirm({
                    title: 'Határidő törlése',
                    message: 'Biztosan törli ezt a határidőt? Ez a művelet nem vonható vissza.',
                    type: 'warning',
                    confirmText: 'Törlés'
                });
                if (!confirmed) return;
                await this.app.reminderManager.delete(id);
                this.renderList();
                this.app.renderer.updateFooterStatus('Határidő törölve');
                this.app.updateReminderStatus?.();
                this.hmiNotif.showToast('Határidő sikeresen törölve!', 'success');
            });
        });

        // Szerkesztés (megnyitja a modált)
        container.querySelectorAll('.btn-edit-reminder').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const rem = this.app.reminderManager.reminders.find(r => r.id === id);
                if (!rem) return;
                document.getElementById('editRemId').value = rem.id;
                document.getElementById('editRemTitle').value = rem.title;
                document.getElementById('editRemAmount').value = rem.amount;
                document.getElementById('editRemCurrency').value = rem.currency || 'HUF';
                document.getElementById('editRemDate').value = rem.due_date;
                document.getElementById('editRemFreq').value = rem.frequency || 'once';
                document.getElementById('editReminderModal').classList.remove('hidden');
            });
        });
    }
}

export class RemindersApp {
    constructor() {
        this.config = new ConfigManager();
        this.db = new Database();
        this.cloud = new CloudSync(this.config);
        this.manager = new ReminderManager(this.db, this.cloud);
        this.hmiNotif = new UIModalController();
        this.renderer = new RemindersRenderer(this, this.hmiNotif);
    }

    async boot() {
        try {
            await this.db.connect();
            await this.manager.load();

            // Statikus eseménykezelők
            document.getElementById('reminderForm')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('remTitleInput').value.trim();
                const amount = parseFloat(document.getElementById('remAmountInput').value);
                const currency = document.getElementById('remCurrencySelect').value;
                const due_date = document.getElementById('remDateInput').value;
                const frequency = document.getElementById('remFreqSelect').value;

                if (!title || isNaN(amount) || !due_date) {
                    await this.hmiNotif.showInfo('Hiányzó adatok', 'Minden mezőt tölts ki!');
                    return;
                }

                await this.manager.add({ title, amount, currency, due_date, frequency });
                e.target.reset();
                this.renderer.renderList();
                this.hmiNotif.showToast('Határidő rögzítve!', 'success');
            });

            this.renderer.renderList();

            // Szerkesztő modal gombok
            document.getElementById('btnCancelEditReminder')?.addEventListener('click', () => {
                document.getElementById('editReminderModal').classList.add('hidden');
            });

            document.getElementById('btnSaveEditReminder')?.addEventListener('click', async () => {
                await this.updateReminder();
            });

            await this.config.watchDogEur((rate, mode) => {
                if (this.config) this.config.eurRate = Number(rate);
                console.log(`[HMI REMINDERS] Live EUR Rate updated: ${rate} Ft`);
            });

            console.log('[HMI REMINDERS] Reminders Subsystem successfully booted.');
            window.remindersApp = this;
        } catch (err) {
            console.error('[REMINDERS BOOT ERROR]', err);
            await this.hmiNotif.showInfo('Rendszerindítási hiba', 'A határidők modul nem tudott elindulni. Ellenőrizd a konzolt.');
        }
    }

    async updateReminder() {
        const id = parseInt(document.getElementById('editRemId').value);
        const title = document.getElementById('editRemTitle').value.trim();
        const amount = parseFloat(document.getElementById('editRemAmount').value);
        const currency = document.getElementById('editRemCurrency').value;
        const due_date = document.getElementById('editRemDate').value;
        const frequency = document.getElementById('editRemFreq').value;

        if (!title || isNaN(amount) || !due_date) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'Minden mezőt tölts ki!');
            return;
        }

        const updated = { title, amount, currency, due_date, frequency };
        const idx = this.manager.reminders.findIndex(r => r.id === id);
        if (idx === -1) return;

        const full = { ...this.manager.reminders[idx], ...updated };
        await this.db.save('reminders', full);
        this.manager.reminders[idx] = full;
        await this.cloud.push('reminders', full);

        this.renderer.renderList();
        this.closeEditModal();
        this.hmiNotif.showToast('Határidő frissítve!', 'success');
    }

    closeEditModal() {
        document.getElementById('editReminderModal').classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const remindersSystem = new RemindersApp();
    remindersSystem.boot();
});