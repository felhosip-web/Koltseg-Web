import { db } from '../../db.js';
import { generateUUID } from '../../uuid-utils.js';

export class TimeTrackerModule {
    constructor(app) {
        this.app = app;
        this.projects = [];
        this.activeTimer = null;
        this.timeEntries = [];
        this.init();
    }

    async init() {
        await this.loadProjects();
        this.loadActiveTimer();
        if (this.activeTimer && !this.activeTimer.isPaused) {
            this.startTicker();
        }
    }

    async loadProjects() {
        this.projects = await db.projects.toArray();
    }

    async loadEntriesForDate(date) {
        return await db.timeEntries.where('date').equals(date).toArray();
    }

    loadActiveTimer() {
        const stored = localStorage.getItem('activeTimer');
        if (stored) {
            try {
                this.activeTimer = JSON.parse(stored);
            } catch (e) {
                this.activeTimer = null;
            }
        }
    }

    saveActiveTimer() {
        if (this.activeTimer) {
            localStorage.setItem('activeTimer', JSON.stringify(this.activeTimer));
        } else {
            localStorage.removeItem('activeTimer');
        }
    }

    startTicker() {
        if (this.ticker) clearInterval(this.ticker);
        this.ticker = setInterval(() => {
            this.updateActiveTimerUI();
        }, 1000);
    }

    stopTicker() {
        if (this.ticker) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
    }

    startTimer(projectId, task) {
        if (this.activeTimer) {
            this.app.hmiNotif?.showToast('Már fut egy időmérő!', 'warning');
            return;
        }
        this.activeTimer = {
            id: generateUUID(),
            projectId,
            task,
            startISO: new Date().toISOString(),
            elapsedPausedMs: 0,
            isPaused: false
        };
        this.saveActiveTimer();
        this.startTicker();
        this.renderTab();
    }

    pauseTimer() {
        if (!this.activeTimer || this.activeTimer.isPaused) return;
        const now = new Date().getTime();
        const start = new Date(this.activeTimer.startISO).getTime();
        this.activeTimer.elapsedPausedMs += (now - start);
        this.activeTimer.isPaused = true;
        this.saveActiveTimer();
        this.stopTicker();
        this.renderTab();
    }

    resumeTimer() {
        if (!this.activeTimer || !this.activeTimer.isPaused) return;
        this.activeTimer.startISO = new Date().toISOString();
        this.activeTimer.isPaused = false;
        this.saveActiveTimer();
        this.startTicker();
        this.renderTab();
    }

    async stopTimer() {
        if (!this.activeTimer) return;
        this.stopTicker();

        let totalElapsedMs = this.activeTimer.elapsedPausedMs;
        if (!this.activeTimer.isPaused) {
            const now = new Date().getTime();
            const start = new Date(this.activeTimer.startISO).getTime();
            totalElapsedMs += (now - start);
        }

        const durationMin = Math.max(1, Math.round(totalElapsedMs / 60000));

        const project = this.projects.find(p => p.id === this.activeTimer.projectId);
        const hourlyRateUsed = project?.hourlyRate || 0;
        const earnings = hourlyRateUsed ? Math.round((durationMin / 60) * hourlyRateUsed) : 0;

        const entry = {
            id: this.activeTimer.id,
            projectId: this.activeTimer.projectId,
            task: this.activeTimer.task,
            date: dayjs().format('YYYY-MM-DD'),
            start: new Date(new Date().getTime() - totalElapsedMs).toISOString(),
            end: new Date().toISOString(),
            durationMin,
            hourlyRateUsed,
            earnings,
            billable: hourlyRateUsed > 0,
            created: new Date().toISOString()
        };

        await db.timeEntries.add(entry);

        const durationStr = this.formatDuration(durationMin);
        const earningsStr = earnings ? ` = ${earnings.toLocaleString('hu-HU')} Ft` : '';
        this.app.hmiNotif?.showToast(`Mentve: ${durationStr}${earningsStr}`, 'success');

        this.activeTimer = null;
        this.saveActiveTimer();
        this.renderTab();

        if (earnings > 0) {
            this.promptSaveIncome(entry, project);
        }
    }

    promptSaveIncome(entry, project) {
        const confirmed = window.confirm(`Rögzíted bevételként a Költségvetésben?\n\nProjekt: ${project.name}\nFeladat: ${entry.task}\nÖsszeg: ${entry.earnings.toLocaleString('hu-HU')} Ft`);
        if (confirmed) {
            this.app.incomingManager.add('Munka', entry.date, entry.earnings).then(() => {
                this.app.hmiNotif?.showToast('Bevétel rögzítve!', 'success');
                if (this.app.activeTab === 'time') {
                    this.renderTab();
                }
            }).catch(e => {
                this.app.hmiNotif?.showToast('Hiba: ' + e.message, 'error');
            });
        }
    }

    formatDuration(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0) {
            return `${h}ó ${m}p`;
        }
        return `${m}p`;
    }

    updateActiveTimerUI() {
        const el = document.getElementById('active-timer-display');
        if (el && this.activeTimer) {
            let totalElapsedMs = this.activeTimer.elapsedPausedMs;
            if (!this.activeTimer.isPaused) {
                const now = new Date().getTime();
                const start = new Date(this.activeTimer.startISO).getTime();
                totalElapsedMs += (now - start);
            }
            const diffSec = Math.floor(totalElapsedMs / 1000);
            const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
            const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
            const s = String(diffSec % 60).padStart(2, '0');
            el.textContent = `${h}:${m}:${s}`;
        }
    }

    async renderTab() {
        const container = document.getElementById('tab-time');
        if (!container) return;

        const today = dayjs().format('YYYY-MM-DD');
        const entries = await this.loadEntriesForDate(today);

        let todayMinutes = 0;
        let todayEarnings = 0;
        entries.forEach(e => {
            todayMinutes += e.durationMin;
            todayEarnings += e.earnings;
        });

        // Current week stats
        const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
        const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');
        const weekEntries = await db.timeEntries.where('date').between(startOfWeek, endOfWeek, true, true).toArray();
        let weekMinutes = 0;
        let weekEarnings = 0;
        weekEntries.forEach(e => {
            weekMinutes += e.durationMin;
            weekEarnings += e.earnings;
        });

        // Current month stats
        const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
        const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');
        const monthEntries = await db.timeEntries.where('date').between(startOfMonth, endOfMonth, true, true).toArray();
        let monthMinutes = 0;
        let monthEarnings = 0;
        monthEntries.forEach(e => {
            monthMinutes += e.durationMin;
            monthEarnings += e.earnings;
        });

        let activeTimerHtml = '';
        if (this.activeTimer) {
            const project = this.projects.find(p => p.id === this.activeTimer.projectId);
            let totalElapsedMs = this.activeTimer.elapsedPausedMs;
            if (!this.activeTimer.isPaused) {
                const now = new Date().getTime();
                const start = new Date(this.activeTimer.startISO).getTime();
                totalElapsedMs += (now - start);
            }
            const diffSec = Math.floor(totalElapsedMs / 1000);
            const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
            const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
            const s = String(diffSec % 60).padStart(2, '0');

            activeTimerHtml = `
                <div class="bg-blue-50 border border-blue-200 p-6 rounded-2xl mb-6 text-center shadow-sm">
                    <h2 class="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">Aktív időmérő</h2>
                    <div id="active-timer-display" class="text-4xl font-mono font-bold text-blue-900 mb-2 ${this.activeTimer.isPaused ? 'opacity-50' : ''}">${h}:${m}:${s}</div>
                    <div class="text-sm text-blue-700 mb-4 font-medium">${project?.name || 'Ismeretlen'} - ${this.activeTimer.task}</div>
                    <div class="flex justify-center gap-3">
                        ${this.activeTimer.isPaused
                            ? `<button id="btnResumeTimer" class="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-sm transition"><i class="fas fa-play"></i> ▶ Folytatás</button>`
                            : `<button id="btnPauseTimer" class="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-sm transition"><i class="fas fa-pause"></i> ⏸ Szünet</button>`
                        }
                        <button id="btnStopTimer" class="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-sm transition">
                            <i class="fas fa-stop"></i> ⏹ Stop + Mentés
                        </button>
                    </div>
                </div>
            `;
        }

        const projectOptions = this.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

        let entriesHtml = entries.map(e => {
            const p = this.projects.find(p => p.id === e.projectId);
            const earnStr = e.earnings > 0 ? `<div class="font-bold text-emerald-600">${e.earnings.toLocaleString('hu-HU')} Ft</div>` : '<div class="font-bold text-gray-400">— Ft</div>';
            return `
                <div class="flex justify-between items-center p-3 border-b border-gray-100 last:border-0 bg-white group hover:bg-gray-50 cursor-pointer entry-row" data-id="${e.id}">
                    <div>
                        <div class="text-sm font-bold text-gray-800">${p?.name || 'Ismeretlen'}</div>
                        <div class="text-xs text-gray-500">${e.task}</div>
                    </div>
                    <div class="text-right flex items-center gap-3">
                        <div>
                            <div class="text-sm font-mono text-gray-600">${this.formatDuration(e.durationMin)}</div>
                            ${earnStr}
                        </div>
                        <button class="text-gray-400 hover:text-rose-500 transition btn-delete-entry hidden group-hover:block" data-id="${e.id}" title="Törlés"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        if (entries.length === 0) {
            entriesHtml = `<div class="p-4 text-center text-gray-400 text-sm italic">Nincs ma mért idő. Indíts egy projektet!</div>`;
        }

        const html = `
            <div class="p-4 md:p-6 max-w-3xl mx-auto pb-24 animate-fade-in">
                <h1 class="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                    <i class="fas fa-stopwatch text-purple-500"></i> Időmérő
                </h1>

                ${activeTimerHtml}

                <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-3">
                    <select id="timerProjectSelect" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1 font-medium">
                        <option value="">Válassz projektet...</option>
                        ${projectOptions}
                    </select>
                    <input type="text" id="timerTaskInput" placeholder="Mit csinálsz épp?" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1 font-medium">
                    <button id="btnStartTimer" class="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl px-5 py-2 font-bold transition flex items-center gap-2 justify-center shadow-sm">
                        <i class="fas fa-play"></i> ▶ Indítás
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-purple-50 p-4 rounded-2xl border border-purple-100 text-center">
                        <div class="text-xs font-bold text-purple-800 uppercase tracking-wider mb-1">Ma</div>
                        <div class="text-base font-bold text-purple-900">${this.formatDuration(todayMinutes)} • ${todayEarnings.toLocaleString('hu-HU')} Ft</div>
                    </div>
                    <div class="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-center">
                        <div class="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1">Ezen a héten</div>
                        <div class="text-base font-bold text-indigo-900">${this.formatDuration(weekMinutes)} • ${weekEarnings.toLocaleString('hu-HU')} Ft</div>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                        <div class="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Ebben a hónapban</div>
                        <div class="text-base font-bold text-blue-900">${this.formatDuration(monthMinutes)} • ${monthEarnings.toLocaleString('hu-HU')} Ft</div>
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
                    <div class="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-gray-700 text-sm flex justify-between">
                        <span>Mai bejegyzések</span>
                        <button id="btnManualAdd" class="text-purple-600 hover:text-purple-800 transition flex items-center gap-1"><i class="fas fa-plus"></i> Kézi</button>
                    </div>
                    <div>
                        ${entriesHtml}
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-gray-700 text-sm flex justify-between items-center cursor-pointer hover:bg-gray-100 transition" id="toggleProjectsBtn">
                        <span>Projektek (${this.projects.length})</span>
                        <i class="fas fa-chevron-down text-gray-400"></i>
                    </div>
                    <div id="projectsListContainer" class="hidden">
                        <div class="p-3 bg-white border-b border-gray-50">
                            <button id="btnNewProject" class="w-full py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 transition shadow-sm border border-purple-100">
                                + Új projekt
                            </button>
                        </div>
                        ${this.projects.map(p => `
                            <div class="p-4 border-b border-gray-100 last:border-0 flex justify-between items-center text-sm hover:bg-gray-50 transition group">
                                <div><span class="font-bold text-gray-800">${p.name}</span> <span class="text-xs text-gray-500">${p.client ? `(${p.client})` : ''}</span></div>
                                <div class="flex items-center gap-4">
                                    <div class="font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs font-bold">${p.hourlyRate ? `${p.hourlyRate.toLocaleString('hu-HU')} Ft/óra` : 'Nincs óradíj'}</div>
                                    <button class="text-gray-400 hover:text-rose-500 transition hidden group-hover:block btn-delete-project" data-id="${p.id}" title="Törlés"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        `).join('')}
                        ${this.projects.length === 0 ? '<div class="p-6 text-center text-gray-400 text-sm italic">Nincsenek projektek. Kattints az Új projekt gombra!</div>' : ''}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.attachEvents();
    }

    attachEvents() {
        document.getElementById('btnStartTimer')?.addEventListener('click', () => {
            const projectId = document.getElementById('timerProjectSelect').value;
            const task = document.getElementById('timerTaskInput').value.trim();
            if (!projectId) {
                this.app.hmiNotif?.showToast('Kérlek válassz projektet!', 'warning');
                return;
            }
            if (!task) {
                this.app.hmiNotif?.showToast('Írd be mit csinálsz!', 'warning');
                return;
            }
            this.startTimer(projectId, task);
        });

        document.getElementById('btnPauseTimer')?.addEventListener('click', () => this.pauseTimer());
        document.getElementById('btnResumeTimer')?.addEventListener('click', () => this.resumeTimer());
        document.getElementById('btnStopTimer')?.addEventListener('click', () => this.stopTimer());

        document.getElementById('toggleProjectsBtn')?.addEventListener('click', () => {
            document.getElementById('projectsListContainer')?.classList.toggle('hidden');
        });

        document.getElementById('btnNewProject')?.addEventListener('click', () => {
            this.showProjectModal();
        });

        document.getElementById('btnManualAdd')?.addEventListener('click', () => {
            if(this.projects.length === 0) {
                 this.app.hmiNotif?.showToast('Előbb hozz létre egy projektet!', 'warning');
                 return;
            }
            this.showEntryModal();
        });

        document.querySelectorAll('.entry-row').forEach(row => {
            row.addEventListener('click', async (e) => {
                if (e.target.closest('.btn-delete-entry')) return;
                const id = row.getAttribute('data-id');
                const entry = await db.timeEntries.get(id);
                if (entry) this.showEntryModal(entry);
            });
        });

        document.querySelectorAll('.btn-delete-entry').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                if (confirm('Biztosan törlöd a bejegyzést?')) {
                    await db.timeEntries.delete(id);
                    this.renderTab();
                }
            });
        });

        document.querySelectorAll('.btn-delete-project').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                if (confirm('Biztosan törlöd a projektet? (A hozzá tartozó időmérők megmaradnak, de ismeretlen projektként jelennek meg)')) {
                    await db.projects.delete(id);
                    await this.loadProjects();
                    this.renderTab();
                }
            });
        });
    }

    showProjectModal() {
        const id = 'timeProjectModal';
        const modalHtml = `
            <div id="${id}" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
                <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
                    <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition p-2 close-modal">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                    <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <i class="fas fa-folder text-purple-500"></i> Új Projekt
                    </h3>

                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Projekt neve</label>
                            <input type="text" id="projName" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Ügyfél (opcionális)</label>
                            <input type="text" id="projClient" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Óradíj (Ft/óra) - szabadon állítható</label>
                            <input type="number" step="any" min="0" id="projRate" placeholder="pl. 8000" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition font-mono">
                        </div>
                        <button id="btnSaveProj" class="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-md hover:bg-purple-700 transition mt-2">
                            Mentés
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(id);

        const close = () => modal.remove();
        modal.querySelector('.close-modal').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if(e.target === modal) close(); });

        document.getElementById('btnSaveProj').addEventListener('click', async () => {
            const name = document.getElementById('projName').value.trim();
            if (!name) return this.app.hmiNotif?.showToast('A projekt neve kötelező!', 'warning');
            const client = document.getElementById('projClient').value.trim();
            const rateStr = document.getElementById('projRate').value;
            const hourlyRate = rateStr ? parseFloat(rateStr) : 0;

            const p = { id: generateUUID(), name, client, hourlyRate, color: '#a855f7', created: new Date().toISOString() };
            await db.projects.add(p);
            await this.loadProjects();
            this.renderTab();
            close();
            this.app.hmiNotif?.showToast('Projekt mentve!', 'success');
        });
    }

    showEntryModal(existingEntry = null) {
        const id = 'timeEntryModal';
        const projectOptions = this.projects.map(p => `<option value="${p.id}" ${existingEntry && existingEntry.projectId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');

        let initialRate = '';
        let initialEarn = '';
        let initialDur = '60'; // default 60 min

        if (existingEntry) {
            initialDur = String(existingEntry.durationMin);
            initialRate = existingEntry.hourlyRateUsed > 0 ? String(existingEntry.hourlyRateUsed) : '';
            initialEarn = existingEntry.earnings > 0 ? String(existingEntry.earnings) : '';
        } else if (this.projects.length > 0) {
            const p = this.projects[0];
            if (p.hourlyRate) {
                initialRate = String(p.hourlyRate);
                initialEarn = String(Math.round(1 * p.hourlyRate)); // default 1h
            }
        }

        const title = existingEntry ? 'Bejegyzés szerkesztése' : 'Kézi bejegyzés';

        const modalHtml = `
            <div id="${id}" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
                <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
                    <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition p-2 close-modal">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                    <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <i class="fas fa-edit text-purple-500"></i> ${title}
                    </h3>

                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Projekt</label>
                            <select id="entProject" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition font-medium">
                                ${projectOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Feladat</label>
                            <input type="text" id="entTask" value="${existingEntry?.task || ''}" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Dátum</label>
                                <input type="date" id="entDate" value="${existingEntry?.date || dayjs().format('YYYY-MM-DD')}" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Kezdés</label>
                                <input type="time" id="entStart" value="${existingEntry ? dayjs(existingEntry.start).format('HH:mm') : dayjs().format('HH:mm')}" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition font-mono">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Befejezés</label>
                                <input type="time" id="entEnd" value="${existingEntry ? dayjs(existingEntry.end).format('HH:mm') : dayjs().add(1, 'hour').format('HH:mm')}" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Időtartam (perc)</label>
                                <input type="number" min="1" id="entDuration" value="${initialDur}" class="w-full px-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-500 transition font-mono font-bold text-indigo-700">
                            </div>
                        </div>

                        <div class="bg-purple-50 p-4 rounded-xl border border-purple-100 mt-4 space-y-3">
                            <div>
                                <label class="block text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">Óradíj (Ft/óra)</label>
                                <input type="number" step="any" min="0" id="entRate" value="${initialRate}" placeholder="pl. 10000" class="w-full px-4 py-2 border border-purple-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">Összeg (Ft)</label>
                                <input type="number" step="any" min="0" id="entEarn" value="${initialEarn}" placeholder="— Ft" class="w-full px-4 py-2 border border-purple-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition font-mono font-bold text-emerald-600 text-lg">
                            </div>
                        </div>

                        <button id="btnSaveEnt" class="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-md hover:bg-emerald-600 transition mt-4">
                            Mentés
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(id);

        const close = () => modal.remove();
        modal.querySelector('.close-modal').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if(e.target === modal) close(); });

        const elProject = document.getElementById('entProject');
        const elDuration = document.getElementById('entDuration');
        const elRate = document.getElementById('entRate');
        const elEarn = document.getElementById('entEarn');

        const recalcFromRate = () => {
            const dur = parseFloat(elDuration.value) || 0;
            const rate = parseFloat(elRate.value);
            if (isNaN(rate) || rate <= 0) {
                elEarn.value = '';
            } else {
                elEarn.value = Math.round((dur / 60) * rate);
            }
        };

        const recalcFromEarn = () => {
            const dur = parseFloat(elDuration.value) || 0;
            const earn = parseFloat(elEarn.value);
            if (isNaN(earn) || earn <= 0 || dur <= 0) {
                elRate.value = '';
            } else {
                elRate.value = Math.round((earn / (dur / 60)) * 100) / 100;
            }
        };

        elRate.addEventListener('input', recalcFromRate);
        elEarn.addEventListener('input', recalcFromEarn);
        elDuration.addEventListener('input', recalcFromRate);

        elProject.addEventListener('change', () => {
            if (!existingEntry) {
                const pid = elProject.value;
                const p = this.projects.find(x => x.id === pid);
                if (p && p.hourlyRate) {
                    elRate.value = p.hourlyRate;
                    recalcFromRate();
                } else {
                    elRate.value = '';
                    elEarn.value = '';
                }
            }
        });

        document.getElementById('btnSaveEnt').addEventListener('click', async () => {
            const projectId = elProject.value;
            const task = document.getElementById('entTask').value.trim() || 'Kézi bejegyzés';
            const date = document.getElementById('entDate').value;
            const durationMin = parseInt(elDuration.value) || 0;
            if (durationMin <= 0) return this.app.hmiNotif?.showToast('Érvénytelen időtartam!', 'warning');

            const rate = parseFloat(elRate.value) || 0;
            const earnings = parseFloat(elEarn.value) || 0;

            const entry = {
                id: existingEntry ? existingEntry.id : generateUUID(),
                projectId,
                task,
                date,
                start: existingEntry ? existingEntry.start : new Date().toISOString(),
                end: existingEntry ? existingEntry.end : new Date().toISOString(),
                durationMin,
                hourlyRateUsed: rate,
                earnings,
                billable: earnings > 0,
                created: existingEntry ? existingEntry.created : new Date().toISOString()
            };

            if (existingEntry) {
                await db.timeEntries.put(entry);
                this.app.hmiNotif?.showToast('Bejegyzés frissítve!', 'success');
            } else {
                await db.timeEntries.add(entry);
                this.app.hmiNotif?.showToast('Bejegyzés mentve!', 'success');
                if (earnings > 0) {
                    const p = this.projects.find(x => x.id === projectId);
                    this.promptSaveIncome(entry, p);
                }
            }
            this.renderTab();
            close();
        });
    }
}
