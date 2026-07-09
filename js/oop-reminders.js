// js/oop-reminders.js - Teljes, végleges verzió (Értesítések + Teljesítés)
import { UIModalController } from './ui-modal-controller.js';

export class RemindersRenderer {
    constructor(app, hmiNotif) {
        this.app = app;
        this.hmiNotif = hmiNotif;
        this.lastRenderTime = 0;
        this.currentFilter = 'all';
    }

    renderList() {
        const now = Date.now();
        if (now - this.lastRenderTime < 80) return;
        this.lastRenderTime = now;

        const container = document.getElementById('remindersTableBody');
        if (!container) return;

        let reminders = this.app.reminderManager?.reminders || [];
        
        // Szűrés alkalmazása
        if (this.currentFilter === 'active') {
            reminders = reminders.filter(r => r.completed !== true);
        } else if (this.currentFilter === 'completed') {
            reminders = reminders.filter(r => r.completed === true);
        }

        if (reminders.length === 0) {
            container.innerHTML = `
                <tr><td colspan="7" class="text-center text-gray-400 py-12">
                    <i class="fas fa-calendar-times text-5xl mb-4 opacity-30"></i>
                    <p class="font-medium">Nincsenek a szűrésnek megfelelő határidők</p>
                </td></tr>`;
            this._updateFilterButtons();
            return;
        }

        let html = '';
        const today = dayjs();

        reminders
            .sort((a, b) => dayjs(a.due_date).diff(dayjs(b.due_date)))
            .forEach(rem => {
                const due = dayjs(rem.due_date);
                const diffDays = due.diff(today, 'day');
                const isCompleted = rem.completed === true;

                let statusHTML = '';
                if (isCompleted) {
                    statusHTML = `<span class="inline-block bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-full">TELJESÍTVE</span>`;
                } else if (diffDays < 0) {
                    statusHTML = `<span class="inline-block bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full">LEJÁRT</span>`;
                } else if (diffDays <= 5) {
                    statusHTML = `<span class="inline-block bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full">HAMAROSAN</span>`;
                } else {
                    statusHTML = `<span class="inline-block bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full">AKTÍV</span>`;
                }

                html += `
                    <tr class="border-b border-gray-100 hover:bg-gray-50 transition-all group ${isCompleted ? 'opacity-75' : ''}">
                        <td class="p-3">${statusHTML}</td>
                        <td class="p-3 font-medium text-gray-800 ${isCompleted ? 'line-through' : ''}">${rem.title}</td>
                        <td class="p-3 text-gray-600">${this._formatFrequency(rem.frequency)}</td>
                        <td class="p-3 font-mono text-sm">${rem.due_date}</td>
                        <td class="p-3 font-mono text-sm ${diffDays < 0 && !isCompleted ? 'text-red-600' : ''}">
                             ${isCompleted ? 'Teljesítve' : (diffDays < 0 ? 'Múltbéli' : diffDays + ' nap')}
                        </td>
                        <td class="p-3 font-bold">${rem.amount.toLocaleString('hu-HU')} ${rem.currency || 'HUF'}</td>
                        <td class="p-3 text-right flex gap-2 justify-end">
                            ${!isCompleted ? `
                            <button class="btn-complete-reminder p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition" data-id="${rem.id}" title="Megjelölés teljesítve">
                                <i class="fas fa-check"></i>
                            </button>` : ''}
                            <button class="btn-edit-reminder p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition" data-id="${rem.id}">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="btn-delete-reminder p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition" data-id="${rem.id}">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </td>
                    </tr>`;
            });

        container.innerHTML = html;
        this._attachEventListeners();
        this._updateFilterButtons();
    }

    _formatFrequency(freq) {
        switch (freq) {
            case 'monthly': return 'Havi';
            case 'quarterly': return 'Negyedéves';
            case 'yearly': return 'Éves';
            default: return 'Egyszeri';
        }
    }

    _updateFilterButtons() {
        const filterGroup = document.getElementById('reminderFilterGroup');
        if (filterGroup) {
            filterGroup.querySelectorAll('button').forEach(btn => {
                const filter = btn.dataset.filter;
                if (filter === this.currentFilter) {
                    btn.className = "px-3 py-1.5 rounded-lg font-bold bg-white text-gray-800 shadow-sm transition-all";
                } else {
                    btn.className = "px-3 py-1.5 rounded-lg font-bold text-gray-500 hover:text-gray-800 transition-all";
                }
            });
        }
    }

    _attachEventListeners() {
        // Szűrő gombok kattintása
        const filterGroup = document.getElementById('reminderFilterGroup');
        if (filterGroup) {
            filterGroup.querySelectorAll('button').forEach(btn => {
                btn.onclick = (e) => {
                    this.currentFilter = btn.dataset.filter;
                    this.renderList();
                };
            });
        }

        // Teljesítés
        document.querySelectorAll('.btn-complete-reminder').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const rem = this.app.reminderManager.reminders.find(r => r.id === id);
                if (!rem) return;

                // 1. Megjelölés teljesítettnek
                await this.app.reminderManager.markAsCompleted(id);
                this.renderList();
                this.app.updateReminderStatus?.();

                // 2. Intelligens Költség-rögzítés felajánlása
                const logAsExpense = await this.hmiNotif.showConfirm({
                    title: '💸 Kiadás rögzítése?',
                    message: `Szeretnéd a(z) "${rem.title}" (${rem.amount.toLocaleString('hu-HU')} ${rem.currency || 'HUF'}) határidőt kiadásként is automatikusan rögzíteni a táblázatban?`,
                    type: 'success',
                    confirmText: 'Igen, rögzítsük',
                    cancelText: 'Nem szükséges'
                });

                if (logAsExpense) {
                    const categories = this.app.items?.items || [];
                    if (categories.length === 0) {
                        this.hmiNotif.showToast('Nincsenek kategóriák rögzítve az adatlapon!', 'error');
                        return;
                    }

                    // Kategóriaválasztó modal megjelenítése
                    const categoryNames = categories.map(c => c.name);
                    const selectedCatName = await this.hmiNotif.showSelectModal({
                        title: 'Válaszd ki a kategóriát',
                        options: categoryNames,
                        placeholder: 'Kategória kiválasztása...'
                    });

                    if (selectedCatName) {
                        const selectedCat = categories.find(c => c.name === selectedCatName);
                        if (selectedCat) {
                            const month = rem.due_date.substring(0, 7); // Pl.: "2026-07"
                            const cellBaseKey = `${selectedCat.id}_${month}`;
                            const cellKey = `${cellBaseKey}_${Date.now()}`;

                            const entryData = {
                                cellKey,
                                amount: rem.amount,
                                currency: rem.currency || 'HUF',
                                paymentMethod: 'Kártya',
                                note: rem.title,
                                color: 'transparent',
                                timestamp: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };

                            await this.app.entries.saveEntry(entryData);
                            await this.app.entries.load();
                            
                            // Fő táblázat frissítése
                            if (this.app.renderer) {
                                this.app.renderer.render();
                                this.app.renderer.renderSummary?.();
                                this.app.renderer.updateFooterStatus('Határidő teljesítve és kiadásként rögzítve!', false);
                            }
                            this.hmiNotif.showToast('Kiadás sikeresen rögzítve!', 'success');
                        }
                    }
                } else {
                    this.hmiNotif.showToast('Határidő teljesítettnek jelölve!', 'success');
                }
            });
        });

        // Szerkesztés
        document.querySelectorAll('.btn-edit-reminder').forEach(btn => {
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

        // Törlés
        document.querySelectorAll('.btn-delete-reminder').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const rem = this.app.reminderManager.reminders.find(r => r.id === id);
                if (!rem) return;

                const confirmed = await this.hmiNotif.showConfirm({
                    title: 'Határidő törlése',
                    message: `Biztosan törli a "${rem.title}" határidőt?`,
                    type: 'warning',
                    confirmText: 'Törlés'
                });

                if (confirmed) {
                    await this.app.reminderManager.delete(id);
                    this.renderList();
                    this.app.updateReminderStatus?.();
                }
            });
        });
    }


    // ==================== ÉRTESÍTÉSEK ====================
    _sendNotification(reminder) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        new Notification("Új határidő", {
            body: `${reminder.title} - ${reminder.amount} ${reminder.currency || 'HUF'}\n${reminder.due_date}`,
            icon: "/icons/icon-192.png",
            tag: `reminder-${reminder.id}`
        });
    }

    _sendCompletionNotification(reminder) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        new Notification("Határidő teljesítve", {
            body: `${reminder.title} sikeresen teljesítve!`,
            icon: "/icons/icon-192.png"
        });
    }
  destroy() {
    // Event listener-ek eltávolítása (ha dinamikusan kötöttük)
    this.lastRenderTime = 0;
    console.log('[RemindersRenderer] Takarítva');
 }
}

// ==================== REMINDERS APP (BOOT) ====================
export class RemindersApp {
    constructor() {}

    async boot(app) {
        this.app = app;
        this.hmiNotif = app.hmiNotif;
        this.renderer = app.remindersRenderer || new RemindersRenderer(app, this.hmiNotif);

        // Form bekötése
        const form = document.getElementById('reminderForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this._handleNewReminder();
            });
        }

        // Szerkesztő modal gombok
        document.getElementById('btnCancelEditReminder')?.addEventListener('click', () => {
            document.getElementById('editReminderModal').classList.add('hidden');
        });

        document.getElementById('btnSaveEditReminder')?.addEventListener('click', () => {
            this._updateReminder();
        });

        this.renderer.renderList();
        console.log('[REMINDERS] Reminders subsystem booted successfully.');
    }

    async _handleNewReminder() {
        const title = document.getElementById('remTitleInput').value.trim();
        const amount = parseFloat(document.getElementById('remAmountInput').value);
        const currency = document.getElementById('remCurrencySelect').value;
        const due_date = document.getElementById('remDateInput').value;
        const frequency = document.getElementById('remFreqSelect').value;

        if (!title || !title.length) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'A határidő címe nem lehet üres!');
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'Az összegnek nagyobbnak kell lennie nullánál!');
            return;
        }

        if (!due_date || Number.isNaN(new Date(due_date).getTime())) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'Érvénytelen határidő dátum!');
            return;
        }

        await this.app.reminderManager.add({ title, amount, currency, due_date, frequency });
        
        document.getElementById('reminderForm').reset();
        this.renderer.renderList();
        this.app.updateReminderStatus?.();
        this.hmiNotif.showToast('Határidő rögzítve!', 'success');
    }

    async _updateReminder() {
        const id = parseInt(document.getElementById('editRemId').value);
        const title = document.getElementById('editRemTitle').value.trim();
        const amount = parseFloat(document.getElementById('editRemAmount').value);
        const currency = document.getElementById('editRemCurrency').value;
        const due_date = document.getElementById('editRemDate').value;
        const frequency = document.getElementById('editRemFreq').value;

        if (!title || !title.length) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'A határidő címe nem lehet üres!');
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'Az összegnek nagyobbnak kell lennie nullánál!');
            return;
        }

        if (!due_date || Number.isNaN(new Date(due_date).getTime())) {
            await this.hmiNotif.showInfo('Hiányzó adatok', 'Érvénytelen határidő dátum!');
            return;
        }

        const rem = this.app.reminderManager.reminders.find(r => r.id === id);
        if (rem) {
            Object.assign(rem, { title, amount, currency, due_date, frequency, updated_at: new Date().toISOString() });
            await this.app.reminderManager.db.save('reminders', rem);
            await this.app.reminderManager.syncService.push('reminders', rem);
        }

        document.getElementById('editReminderModal').classList.add('hidden');
        this.renderer.renderList();
        this.app.updateReminderStatus?.();
        this.hmiNotif.showToast('Határidő frissítve!', 'success');
    }
}
