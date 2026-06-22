// js/oop-reminders.js - Teljesen átdolgozott verzió
export class ReminderManager {
    constructor(db, cloud) {
        this.db = db;
        this.cloud = cloud;
        this.reminders = [];
    }

    async load() {
        this.reminders = await this.db.getAll('reminders');
        await this.autoGenerateRecurring();
        return this.reminders;
    }

    async autoGenerateRecurring() {
        const today = dayjs();
        let updated = false;

        for (const rem of this.reminders) {
            if (rem.frequency === 'once' || !rem.active) continue;

            let due = dayjs(rem.due_date);
            while (due.isBefore(today, 'day') || due.isSame(today, 'day')) {
                rem.due_date = due.format('YYYY-MM-DD');
                rem.next_due_date = this._calculateNextDue(due, rem.frequency).format('YYYY-MM-DD');
                await this.db.save('reminders', rem);
                await this.cloud.push('reminders', rem);
                updated = true;
                due = dayjs(rem.next_due_date);
            }
        }
        if (updated) this.reminders = await this.db.getAll('reminders');
    }

    _calculateNextDue(current, freq) {
        switch (freq) {
        case 'monthly': return current.add(1, 'month');
        case 'quarterly': return current.add(3, 'month');
        case 'yearly': return current.add(1, 'year');
        default: return current;
        }
    }

    async add(reminder) {
        reminder.active = true;
        reminder.next_due_date = reminder.due_date;
        reminder.id = await this.db.save('reminders', reminder);
        this.reminders.push(reminder);
        await this.cloud.push('reminders', reminder);
    }

    async markAsCompleted(id) {
        const rem = this.reminders.find(r => r.id === id);
        if (!rem) return;
        
        if (rem.frequency === 'once') {
            rem.active = false;
        } else {
            rem.due_date = rem.next_due_date;
            rem.next_due_date = this._calculateNextDue(dayjs(rem.due_date), rem.frequency).format('YYYY-MM-DD');
        }
        
        await this.db.save('reminders', rem);
        await this.cloud.push('reminders', rem);
    }

    async update(id, data) {
        const rem = this.reminders.find(r => r.id === id);
        if (rem) {
            Object.assign(rem, data);
            await this.db.save('reminders', rem);
            await this.cloud.push('reminders', rem);
        }
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
            container.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">Nincsenek aktív határidők.</td></tr>';
            return;
        }

        let html = '';
        list.forEach(rem => {
            const due = dayjs(rem.due_date);
            const diff = due.diff(dayjs(), 'day');
            let status = {text: 'AKTÍV', color: 'bg-emerald-500'};
            if (!rem.active) status = {text: 'TELJESÍTETT', color: 'bg-gray-400'};
            else if (diff < 0) status = {text: 'LEJÁRT', color: 'bg-red-500'};
            else if (diff <= 7) status = {text: 'ESKEDÉKES', color: 'bg-amber-500'};

            html += `<tr class="border-b hover:bg-gray-50">
                <td class="p-3"><span class="${status.color} text-white text-xs px-3 py-1 rounded-full font-bold">${status.text}</span></td>
                <td class="p-3 font-medium">${rem.title}</td>
                <td class="p-3">${rem.frequency === 'monthly' ? 'Havi' : rem.frequency === 'quarterly' ? 'Negyedéves' : rem.frequency === 'yearly' ? 'Éves' : 'Egyszeri'}</td>
                <td class="p-3 font-mono">${rem.due_date}</td>
                <td class="p-3 font-mono">${diff >= 0 ? diff + ' nap' : 'Késésben'}</td>
                <td class="p-3 font-bold">${rem.amount.toLocaleString()} ${rem.currency}</td>
                <td class="p-3 text-right flex gap-2">
                    <button class="btn-complete-reminder text-emerald-600 hover:text-emerald-700" data-id="${rem.id}">✓</button>
                    <button class="btn-edit-reminder text-blue-600 hover:text-blue-700" data-id="${rem.id}"><i class="fas fa-pen"></i></button>
                    <button class="btn-delete-reminder text-red-600 hover:text-red-700" data-id="${rem.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        container.innerHTML = html;

        // Event listeners
        container.querySelectorAll('.btn-complete-reminder').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.app.reminderManager.markAsCompleted(+btn.dataset.id);
                this.renderList();
                this.app.updateReminderStatus();
            });
        });

        container.querySelectorAll('.btn-edit-reminder').forEach(btn => {
            btn.addEventListener('click', () => this.openEditModal(+btn.dataset.id));
        });

        container.querySelectorAll('.btn-delete-reminder').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (await this.hmiNotif.showConfirm('Törlés', 'Biztosan törlöd?', true)) {
                    await this.app.reminderManager.delete(+btn.dataset.id);
                    this.renderList();
                    this.app.updateReminderStatus();
                }
            });
        });
    }

    openEditModal(id) {
        const rem = this.app.reminderManager.reminders.find(r => r.id === id);
        if (!rem) return;

        document.getElementById('editRemId').value = rem.id;
        document.getElementById('editRemTitle').value = rem.title;
        document.getElementById('editRemAmount').value = rem.amount;
        document.getElementById('editRemCurrency').value = rem.currency || 'HUF';
        document.getElementById('editRemDate').value = rem.due_date;
        document.getElementById('editRemFreq').value = rem.frequency || 'once';

        document.getElementById('editReminderModal').classList.remove('hidden');
    }
}