export class DashboardV2 {
    constructor(app) {
        this.app = app;
    }

    _safeJSONParse(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            return [];
        }
    }

    getTodayFocus() {
        // 1. Get notes
        const notes = this.app.notepadNotes || this._safeJSONParse('plugin_notepad_notes');

        // 2. Get calendar events
        let calendarEvents = this.app.calendarEvents;
        if (!calendarEvents || calendarEvents.length === 0) {
            calendarEvents = this._safeJSONParse('plugin_calendar_events');
        }
        if (!calendarEvents || calendarEvents.length === 0) {
            calendarEvents = this._safeJSONParse('calendar_events');
        }

        // 3. Get shopping list items
        const shoppingItems = this.app.shoppingItems || this._safeJSONParse('plugin_shopping_list_items');

        // 4. Get fuel/km entries
        const kmEntries = this.app.fuelLogs || this._safeJSONParse('plugin_fuel_logs');

        // 5. Get transactions
        const transactions = this.app.entries?.entries || this._safeJSONParse('koltseg_transactions') || this._safeJSONParse('transactions');

        console.log('DashboardV2 keys found:', { notes, calendarEvents, shoppingItems, kmEntries, transactions });

        const urgentItems = [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Process Notes
        if (Array.isArray(notes)) {
            notes.forEach(note => {
                if (note.reminderTime && !note.completed) {
                    const reminderDate = new Date(note.reminderTime);
                    const isToday = reminderDate.toISOString().split('T')[0] === todayStr;
                    const isOverdue = reminderDate < now;
                    if (isToday || isOverdue) {
                        urgentItems.push({
                            type: 'note',
                            title: note.title,
                            desc: 'Emlékeztető' + (isOverdue ? ' (Lejárt)' : ''),
                            time: reminderDate.getTime(),
                            icon: 'fas fa-sticky-note',
                            color: isOverdue ? 'text-red-500 bg-red-50' : 'text-amber-500 bg-amber-50',
                            module: 'notepad'
                        });
                    }
                }
            });
        }

        // Process Calendar
        if (Array.isArray(calendarEvents)) {
            calendarEvents.forEach(evt => {
                if (evt.date === todayStr || (evt.start && evt.start.startsWith(todayStr))) {
                    urgentItems.push({
                        type: 'calendar',
                        title: evt.title || evt.name,
                        desc: 'Mai esemény',
                        time: new Date(evt.date || evt.start).getTime(),
                        icon: 'fas fa-calendar-day',
                        color: 'text-blue-500 bg-blue-50',
                        module: 'calendar'
                    });
                }
            });
        }

        // Process Shopping List (Pending)
        let pendingShoppingCount = 0;
        if (Array.isArray(shoppingItems)) {
             pendingShoppingCount = shoppingItems.filter(i => !i.checked).length;
             if (pendingShoppingCount > 0) {
                 urgentItems.push({
                    type: 'shopping',
                    title: `Bevásárlás (${pendingShoppingCount} tétel)`,
                    desc: 'Függőben lévő tételek',
                    time: now.getTime() - 1000, // Slightly lower priority than overdue
                    icon: 'fas fa-shopping-cart',
                    color: 'text-indigo-500 bg-indigo-50',
                    module: 'shopping_list'
                });
             }
        }

        // Sort by time (oldest first for overdue, but let's just do time ascending for urgency)
        urgentItems.sort((a, b) => a.time - b.time);

        return urgentItems.slice(0, 5);
    }

    async getTimeWidget() {
        const stats = await window.app.timeTracker.getWeeklyStats()
        return `<div class="card"><h3>⏱ Ezen a héten</h3><p>${stats.hours}ó • ${stats.earnings} Ft</p></div>`
    }

    getMonthlyStats() {
        const stats = {
            monthlyExpense: 0,
            monthlyKm: 0,
            monthlyFuelCost: 0,
            pendingShopping: 0,
            overdueNotes: 0,
            totalNotes: 0
        };

        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

        // Expenses
        const transactions = this.app.entries?.entries || this._safeJSONParse('koltseg_transactions') || this._safeJSONParse('transactions');
        const eurRate = this.app.config?.eurRate || 400;
        if (Array.isArray(transactions)) {
            transactions.forEach(t => {
                if (!t.isStorno && t.cellKey && t.cellKey.startsWith(currentMonth)) {
                    stats.monthlyExpense += (t.currency === 'EUR' ? t.amount * eurRate : t.amount);
                }
            });
        }

        // KM Entries
        const kmEntries = this.app.fuelLogs || this._safeJSONParse('plugin_fuel_logs');
        if (Array.isArray(kmEntries)) {
            kmEntries.forEach(log => {
                if (log.timestamp && log.timestamp.startsWith(currentMonth) && log.odo) {
                    stats.monthlyKm += 0; // Requires diff logic, will simplify: we just sum distance if available or calculate from min/max
                }
            });

            const currentMonthLogs = kmEntries.filter(l => l.timestamp && l.timestamp.startsWith(currentMonth) && l.odo > 0).sort((a, b) => a.odo - b.odo);
            if (currentMonthLogs.length >= 2) {
                stats.monthlyKm = currentMonthLogs[currentMonthLogs.length - 1].odo - currentMonthLogs[0].odo;
            }
            stats.monthlyFuelCost = stats.monthlyKm * 40; // Default 40 Ft / km estimation if real price isn't calculated
        }

        // Shopping
        const shoppingItems = this.app.shoppingItems || this._safeJSONParse('plugin_shopping_list_items');
        if (Array.isArray(shoppingItems)) {
            stats.pendingShopping = shoppingItems.filter(i => !i.checked).length;
        }

        // Notes
        const notes = this.app.notepadNotes || this._safeJSONParse('plugin_notepad_notes');
        if (Array.isArray(notes)) {
            stats.totalNotes = notes.length;
            stats.overdueNotes = notes.filter(n => n.reminderTime && !n.completed && new Date(n.reminderTime) < now).length;
        }


        // Time Tracker
        stats.weeklyTimeTracker = { minutes: 0, earnings: 0 };
        // We fetch this async ideally, but dashboard is sync render initially.
        // Dexie operations are async. We'll populate this if pre-loaded or 0.
        // To properly support this, we would need to make getMonthlyStats async or just use local cache.
        // Since Dexie is async, we can render 0 initially and trigger a re-render or update DOM.
        // For simplicity in this demo, let's leave it 0 and update DOM later if needed, or if app loaded it.
        return stats;
    }

    getRecentTimeline() {
        const timeline = [];
        const pushIfValid = (arr) => { if(Array.isArray(arr)) timeline.push(...arr) };

        // We will mock/build standard objects for the timeline

        const transactions = this.app.entries?.entries || this._safeJSONParse('koltseg_transactions') || this._safeJSONParse('transactions');
        if (Array.isArray(transactions)) {
            transactions.forEach(t => {
                if (t.timestamp || t.cellKey) {
                    timeline.push({
                        time: new Date(t.timestamp || t.cellKey).getTime(),
                        title: t.desc || 'Kiadás',
                        module: 'cost',
                        icon: 'fas fa-receipt',
                        color: 'text-rose-500 bg-rose-50'
                    });
                }
            });
        }

        const notes = this.app.notepadNotes || this._safeJSONParse('plugin_notepad_notes');
        if (Array.isArray(notes)) {
            notes.forEach(n => {
                timeline.push({
                    time: n.id && n.id.includes('_') ? parseInt(n.id.split('_')[1]) || Date.now() : Date.now(), // Fallback
                    title: n.title,
                    module: 'notepad',
                    icon: 'fas fa-sticky-note',
                    color: 'text-amber-500 bg-amber-50'
                });
            });
        }

        const kmEntries = this.app.fuelLogs || this._safeJSONParse('plugin_fuel_logs');
        if (Array.isArray(kmEntries)) {
            kmEntries.forEach(log => {
                timeline.push({
                    time: new Date(log.timestamp).getTime(),
                    title: `Tankolás: ${log.liters}L`,
                    module: 'fuel_log',
                    icon: 'fas fa-gas-pump',
                    color: 'text-emerald-500 bg-emerald-50'
                });
            });
        }

        timeline.sort((a, b) => b.time - a.time);
        return timeline.slice(0, 10);
    }

    timeAgo(ts) {
        if (!ts || isNaN(ts)) return 'Nemrég';
        const seconds = Math.floor((new Date() - ts) / 1000);

        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " éve";

        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " hónapja";

        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " napja";

        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " órája";

        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " perce";

        return "Épp most";
    }

    navigateTo(module) {
        if (module === 'cost') {
            this.app.switchTab('table');
        } else {
            // Use moduleManager to launch plugin
            if (this.app.moduleManager) {
                // Determine correct module ID
                let modId = module;
                if (module === 'notepad') modId = 'plugin_notepad';
                if (module === 'shopping_list') modId = 'plugin_shopping_list';
                if (module === 'calendar') modId = 'plugin_calendar';
                if (module === 'fuel_log') modId = 'plugin_fuel_log';

                this.app.moduleManager.launchModuleInModal(modId);
            }
        }
    }

    render() {
        const focusItems = this.getTodayFocus();
        const stats = this.getMonthlyStats();
        const timeline = this.getRecentTimeline();

        // 1. Header Logic
        const now = new Date();
        const hour = now.getHours();
        let greeting = "Jó napot";
        if (hour < 9) greeting = "Jó reggelt";
        else if (hour > 18) greeting = "Jó estét";

        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        const dateStr = now.toLocaleDateString('hu-HU', dateOptions);

        // 2. Focus HTML
        let focusHtml = '';
        if (focusItems.length === 0) {
            focusHtml = `
                <div class="bg-emerald-50 text-emerald-600 rounded-2xl p-4 text-center font-medium border border-emerald-100 shadow-sm flex flex-col items-center gap-2">
                    <i class="fas fa-check-circle text-3xl"></i>
                    Minden rendben, nincs sürgős dolgod! 🎉
                </div>
            `;
        } else {
            focusHtml = focusItems.map(item => `
                <div class="flex items-center gap-4 p-3 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer dash-nav-item" data-module="${item.module}">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center ${item.color}">
                        <i class="${item.icon} text-lg"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-bold text-gray-800 truncate">${item.title}</h4>
                        <p class="text-xs text-gray-500 truncate">${item.desc}</p>
                    </div>
                    <i class="fas fa-chevron-right text-gray-300"></i>
                </div>
            `).join('');
        }

        // 3. Timeline HTML
        let timelineHtml = '';
        if (timeline.length === 0) {
             timelineHtml = '<div class="text-center text-sm text-gray-400 py-4">Nincs friss aktivitás.</div>';
        } else {
             timelineHtml = timeline.map((item, idx) => `
                <div class="relative pl-6 pb-4 ${idx !== timeline.length - 1 ? 'border-l-2 border-gray-100' : ''} dash-nav-item cursor-pointer group" data-module="${item.module}">
                    <div class="absolute -left-2 top-0 w-4 h-4 rounded-full border-2 border-white ${item.color.split(' ')[1]} flex items-center justify-center shadow-sm">
                        <div class="w-1.5 h-1.5 rounded-full ${item.color.split(' ')[0].replace('text-', 'bg-')}"></div>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-3 border border-gray-100 group-hover:bg-white group-hover:shadow-sm transition">
                        <h5 class="text-xs font-bold text-gray-800 truncate mb-1">${item.title}</h5>
                        <div class="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                            <i class="far fa-clock"></i> ${this.timeAgo(item.time)}
                        </div>
                    </div>
                </div>
             `).join('');
        }

        return `
            <div class="space-y-6 pb-20 max-w-7xl mx-auto animate-fade-in">
                <!-- Header -->
                <header class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                            <i class="fas fa-user-astronaut text-xl"></i>
                        </div>
                        <div>
                            <h2 class="text-2xl font-black text-gray-800 tracking-tight">${greeting}! ☀️</h2>
                            <p class="text-sm font-medium text-gray-500 capitalize">${dateStr}</p>
                        </div>
                    </div>
                </header>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    <!-- Left Column: Focus & Grid -->
                    <div class="lg:col-span-2 space-y-6">
                        <!-- TODAY FOCUS -->
                        <section>
                            <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-bolt text-amber-500"></i> Fókusz (Ma)
                            </h3>
                            <div class="space-y-3">
                                ${focusHtml}
                            </div>
                        </section>

                        <!-- MONTHLY CARDS GRID -->
                        <section>
                            <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-chart-pie text-blue-500"></i> Havi Áttekintés
                            </h3>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <!-- Card 1: Havi kiadás -->
                                <div class="bg-gradient-to-br from-rose-50 to-red-50 p-4 rounded-2xl border border-rose-100 shadow-sm cursor-pointer hover:shadow-md transition dash-nav-item" data-module="cost">
                                    <div class="text-rose-500 mb-2"><i class="fas fa-wallet text-xl"></i></div>
                                    <div class="text-xs font-bold text-rose-800 uppercase tracking-wide opacity-80">Havi Kiadás</div>
                                    <div class="text-lg font-black text-rose-900 mt-1">${stats.monthlyExpense.toLocaleString('hu-HU')} Ft</div>
                                </div>

                                <!-- Card 2: Havi KM -->
                                <div class="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-100 shadow-sm cursor-pointer hover:shadow-md transition dash-nav-item" data-module="fuel_log">
                                    <div class="text-emerald-500 mb-2"><i class="fas fa-car text-xl"></i></div>
                                    <div class="text-xs font-bold text-emerald-800 uppercase tracking-wide opacity-80">Havi KM</div>
                                    <div class="text-lg font-black text-emerald-900 mt-1">${stats.monthlyKm} km</div>
                                    <div class="text-[10px] text-emerald-700 mt-1 opacity-70">~${stats.monthlyFuelCost.toLocaleString('hu-HU')} Ft</div>
                                </div>

                                <!-- Card 3: Bevásárlás -->
                                <div class="bg-gradient-to-br from-indigo-50 to-blue-50 p-4 rounded-2xl border border-indigo-100 shadow-sm cursor-pointer hover:shadow-md transition dash-nav-item" data-module="shopping_list">
                                    <div class="text-indigo-500 mb-2"><i class="fas fa-shopping-basket text-xl"></i></div>
                                    <div class="text-xs font-bold text-indigo-800 uppercase tracking-wide opacity-80">Bevásárlás</div>
                                    <div class="text-lg font-black text-indigo-900 mt-1">${stats.pendingShopping} db</div>
                                    <div class="text-[10px] text-indigo-700 mt-1 opacity-70">Függő tétel</div>
                                </div>


                                <!-- Card 5: Időmérő -->
                                <div class="bg-gradient-to-br from-purple-50 to-fuchsia-50 p-4 rounded-2xl border border-purple-100 shadow-sm cursor-pointer hover:shadow-md transition dash-nav-item" data-module="time" id="dashTimeTrackerCard">
                                    <div class="text-purple-500 mb-2"><i class="fas fa-stopwatch text-xl"></i></div>
                                    <div class="text-xs font-bold text-purple-800 uppercase tracking-wide opacity-80">Eheti Munka</div>
                                    <div class="text-lg font-black text-purple-900 mt-1" id="dashTimeTrackerTime">0h 0m</div>
                                    <div class="text-[10px] text-purple-700 mt-1 opacity-70" id="dashTimeTrackerEarn">0 Ft</div>
                                </div>
                                <!-- Card 4: Jegyzetek -->
                                <div class="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-100 shadow-sm cursor-pointer hover:shadow-md transition dash-nav-item" data-module="notepad">
                                    <div class="text-amber-500 mb-2"><i class="fas fa-sticky-note text-xl"></i></div>
                                    <div class="text-xs font-bold text-amber-800 uppercase tracking-wide opacity-80">Jegyzetek</div>
                                    <div class="text-lg font-black text-amber-900 mt-1">${stats.overdueNotes > 0 ? `<span class="text-red-600">${stats.overdueNotes}</span> / ` : ''}${stats.totalNotes} db</div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <!-- Right Column: Quick Actions & Timeline -->
                    <div class="space-y-6">
                        <!-- QUICK ACTIONS -->
                        <section>
                            <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-paper-plane text-purple-500"></i> Gyorsműveletek
                            </h3>
                            <div class="grid grid-cols-2 gap-3">
                                <button class="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-blue-300 hover:shadow-md transition flex items-center gap-3 dash-action-btn" data-action="new_cost">
                                    <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i class="fas fa-plus"></i></div>
                                    <span class="text-xs font-bold text-gray-700">Kiadás</span>
                                </button>
                                <button class="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-amber-300 hover:shadow-md transition flex items-center gap-3 dash-action-btn" data-action="new_note">
                                    <div class="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><i class="fas fa-plus"></i></div>
                                    <span class="text-xs font-bold text-gray-700">Jegyzet</span>
                                </button>
                                <button class="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-emerald-300 hover:shadow-md transition flex items-center gap-3 dash-action-btn" data-action="new_km">
                                    <div class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><i class="fas fa-plus"></i></div>
                                    <span class="text-xs font-bold text-gray-700">Tankolás</span>
                                </button>
                                <button class="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-indigo-300 hover:shadow-md transition flex items-center gap-3 dash-action-btn" data-action="new_shopping">
                                    <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><i class="fas fa-plus"></i></div>
                                    <span class="text-xs font-bold text-gray-700">Bevásárlás</span>
                                </button>
                            </div>
                        </section>

                        <!-- RECENT TIMELINE -->
                        <section class="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                            <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <i class="fas fa-history text-gray-400"></i> Legutóbbi Aktivitás
                            </h3>
                            <div class="mt-2 pl-2">
                                ${timelineHtml}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        `;
    }

    attachEvents() {
        // Load Time Tracker data async
        if (window.app && window.app.timeTracker) {
            import('../db.js').then(({db}) => {
                const dayjs = window.dayjs; // assuming dayjs is global
                const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
                const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');
                db.timeEntries.where('date').between(startOfWeek, endOfWeek, true, true).toArray().then(weekEntries => {
                    let weekMinutes = 0;
                    let weekEarnings = 0;
                    weekEntries.forEach(e => {
                        weekMinutes += e.durationMin;
                        weekEarnings += e.earnings;
                    });

                    const elTime = document.getElementById('dashTimeTrackerTime');
                    const elEarn = document.getElementById('dashTimeTrackerEarn');
                    if(elTime) {
                        const h = Math.floor(weekMinutes / 60);
                        const m = weekMinutes % 60;
                        elTime.textContent = h > 0 ? `${h}ó ${m}p` : `${m}p`;
                    }
                    if(elEarn) {
                        elEarn.textContent = `${weekEarnings.toLocaleString('hu-HU')} Ft`;
                    }
                });
            }).catch(e => console.error(e));
        }

        // Add event listener for Time Tracker Card
        const ttCard = document.getElementById('dashTimeTrackerCard');
        if (ttCard) {
            ttCard.addEventListener('click', () => {
                if(window.app && window.app.showView) window.app.showView('time');
            });
        }

        const container = document.getElementById('tab-dashboard');
        if (!container) return;

        // Navigation clicks
        container.querySelectorAll('.dash-nav-item').forEach(el => {
            el.addEventListener('click', () => {
                const mod = el.getAttribute('data-module');
                if (mod) this.navigateTo(mod);
            });
        });

        // Quick Actions
        container.querySelectorAll('.dash-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'new_cost') {
                    document.getElementById('btnNewItem')?.click();
                } else if (action === 'new_note') {
                    this.navigateTo('notepad');
                    setTimeout(() => {
                        document.getElementById('btnQuickNoteTrigger')?.click(); // Assuming standard fallback
                    }, 300);
                } else if (action === 'new_km') {
                    this.navigateTo('fuel_log');
                } else if (action === 'new_shopping') {
                    this.navigateTo('shopping_list');
                }
            });
        });
    }
}
