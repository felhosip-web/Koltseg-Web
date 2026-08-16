const fs = require('fs');

const content = `// js/modules/calendar.js - v1.1.0 - Naptár Modul
export const calendarModuleScript = \`
return {
    id: 'plugin_calendar',
    name: 'Naptár Modul',
    version: '1.1.0',
    category: 'productivity',
    author: 'KöltségWeb Lab',
    description: 'Modern naptár nézet események és emlékeztetők kezelésére.',
    icon: 'fas fa-calendar-alt text-blue-500',
    hasTab: true,
    changelog: [
        'Teljesen új, modern UI/UX naptár nézet',
        'Események hozzáadása és törlése napokhoz',
        'Offline-first adattárolás támogatása'
    ],
    tabConfig: {
        id: 'tab_plugin_calendar',
        title: 'Naptár',
        icon: 'fas fa-calendar-alt',
        render: (app) => {
            const view = document.getElementById('moduleView_tab_plugin_calendar');
            if (!view) return;

            view.innerHTML = \\\`
                <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
                    <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <i class="fas fa-calendar-alt text-blue-500"></i> Naptár
                            </h3>
                            <p class="text-xs text-gray-500 mt-1">Események és határidők áttekintése - <span class="text-blue-600 font-bold">v1.1.0</span></p>
                        </div>
                        <div class="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 self-start md:self-auto">
                            <button id="calPrevMonth" class="p-2 rounded-lg text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <div id="calCurrentMonthLabel" class="px-4 font-bold text-sm text-slate-800 min-w-[120px] text-center capitalize">
                                -
                            </div>
                            <button id="calNextMonth" class="p-2 rounded-lg text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Naptár Grid -->
                    <div class="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                        <!-- Napok fejléce -->
                        <div class="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                            <div class="py-2">Hét</div>
                            <div class="py-2">Ked</div>
                            <div class="py-2">Sze</div>
                            <div class="py-2">Csü</div>
                            <div class="py-2">Pén</div>
                            <div class="py-2 text-red-400">Szo</div>
                            <div class="py-2 text-red-400">Vas</div>
                        </div>
                        <!-- Napok hálója -->
                        <div id="calDaysGrid" class="grid grid-cols-7 auto-rows-[minmax(60px,auto)] sm:auto-rows-[minmax(80px,auto)] bg-slate-200 gap-[1px]">
                            <!-- JavaScript fogja feltölteni -->
                        </div>
                    </div>

                    <!-- Kijelölt nap részletei (Kezdetben rejtett) -->
                    <div id="calDayDetails" class="mt-6 hidden bg-white rounded-xl border border-blue-100 shadow-sm p-4 animate-fade-in">
                        <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                            <h4 id="calDayDetailsTitle" class="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <i class="fas fa-calendar-day text-blue-500"></i> <span id="calSelectedDateText">Kijelölt nap</span>
                            </h4>
                            <button id="calCloseDetails" class="text-slate-400 hover:text-red-500 transition-colors p-1">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div id="calEventsList" class="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
                            <!-- Események ide kerülnek -->
                        </div>

                        <div class="flex gap-2">
                            <input type="text" id="calNewEventInput" placeholder="Új esemény hozzáadása..." class="flex-1 bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                            <button id="calAddEventBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2 whitespace-nowrap">
                                <i class="fas fa-plus"></i> <span class="hidden sm:inline">Hozzáadás</span>
                            </button>
                        </div>
                    </div>
                </div>
            \\\`;

            // Belső állapot
            let currentDate = new Date();
            let selectedDateStr = null;

            // Adatok betöltése
            let events = app.pluginStorage ? app.pluginStorage.getItems('plugin_calendar_events') : JSON.parse(localStorage.getItem('plugin_calendar_events') || '[]');

            const saveEvents = () => {
                if (app.pluginStorage) {
                    // Ha a pluginStorage használatban van, az clearAll/saveItem ciklussal a legbiztosabb
                    app.pluginStorage.clearAll('plugin_calendar_events');
                    events.forEach(e => app.pluginStorage.saveItem('plugin_calendar_events', e));
                } else {
                    localStorage.setItem('plugin_calendar_events', JSON.stringify(events));
                }
            };

            const getEventsForDate = (dateStr) => {
                return events.filter(e => e.date === dateStr);
            };

            // Hónap nevek magyarul
            const monthNames = ['Január', 'Február', 'Március', 'Április', 'Május', 'Június', 'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December'];

            const renderGrid = () => {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();

                document.getElementById('calCurrentMonthLabel').textContent = \\\`\\\${year}. \\\${monthNames[month]}\\\`;

                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);

                // 1 = Hétfő, 0 = Vasárnap (Javascript Date szerint a Vasárnap a 0.)
                // Magyar naptárban Hétfő az első nap.
                let firstDayIndex = firstDay.getDay() - 1;
                if (firstDayIndex === -1) firstDayIndex = 6; // Vasárnap

                const daysInMonth = lastDay.getDate();
                const gridEl = document.getElementById('calDaysGrid');
                gridEl.innerHTML = '';

                const today = new Date();
                const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
                const todayDate = today.getDate();

                // Üres cellák a hónap elején
                for (let i = 0; i < firstDayIndex; i++) {
                    gridEl.innerHTML += '<div class="bg-slate-50 opacity-50"></div>';
                }

                // Napok cellái
                for (let i = 1; i <= daysInMonth; i++) {
                    const dStr = \\\`\\\${year}-\\\${String(month + 1).padStart(2, '0')}-\\\${String(i).padStart(2, '0')}\\\`;
                    const dayEvents = getEventsForDate(dStr);
                    const isToday = isCurrentMonth && i === todayDate;
                    const isSelected = selectedDateStr === dStr;

                    let bgClass = 'bg-white';
                    if (isSelected) bgClass = 'bg-blue-50 ring-2 ring-blue-400 ring-inset';
                    else if (isToday) bgClass = 'bg-blue-50/50';

                    let dayNumClass = 'text-slate-700';
                    if (isToday) dayNumClass = 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto shadow-sm shadow-blue-200';
                    else if (isSelected) dayNumClass = 'text-blue-700 font-bold';

                    const hasEventIndicator = dayEvents.length > 0 ? '<div class="w-1.5 h-1.5 rounded-full bg-blue-500 mx-auto mt-1"></div>' : '';

                    // Kis indikátorok az eseményekhez mobilon, max 2 db
                    let eventDotsHtml = '';
                    if (dayEvents.length > 0) {
                        eventDotsHtml = '<div class="flex justify-center gap-1 mt-1">';
                        for(let j=0; j<Math.min(dayEvents.length, 3); j++) {
                            eventDotsHtml += '<div class="w-1.5 h-1.5 rounded-full bg-blue-400"></div>';
                        }
                        if (dayEvents.length > 3) {
                             eventDotsHtml += '<div class="w-1.5 h-1.5 rounded-full bg-slate-400"></div>';
                        }
                        eventDotsHtml += '</div>';
                    }

                    gridEl.innerHTML += \\\`
                        <div class="cal-day-cell \\\${bgClass} p-1 sm:p-2 cursor-pointer hover:bg-blue-50 transition-colors flex flex-col" data-date="\\\${dStr}">
                            <div class="text-center text-xs sm:text-sm font-medium mb-1">
                                <span class="\\\${dayNumClass} inline-block">\\\${i}</span>
                            </div>
                            <div class="flex-1 flex flex-col justify-end">
                                \\\${eventDotsHtml}
                            </div>
                        </div>
                    \\\`;
                }

                // Üres cellák a hónap végén (opcionális, hogy kitöltse a rácsot, 42 cella max)
                const totalCells = firstDayIndex + daysInMonth;
                const remainingCells = (7 - (totalCells % 7)) % 7;
                for (let i = 0; i < remainingCells; i++) {
                    gridEl.innerHTML += '<div class="bg-slate-50 opacity-50"></div>';
                }

                // Eseménykezelők a napokra
                document.querySelectorAll('.cal-day-cell').forEach(cell => {
                    cell.addEventListener('click', () => {
                        const dateStr = cell.getAttribute('data-date');
                        selectedDateStr = dateStr;
                        renderGrid(); // Újrarajzoljuk a kiválasztás frissítéséhez
                        openDayDetails(dateStr);
                    });
                });
            };

            const openDayDetails = (dateStr) => {
                const detailsEl = document.getElementById('calDayDetails');
                const titleEl = document.getElementById('calSelectedDateText');

                // Dátum formázása
                const [y, m, d] = dateStr.split('-');
                titleEl.textContent = \\\`\\\${y}. \\\${monthNames[parseInt(m)-1]} \\\${parseInt(d)}.\\\`;

                detailsEl.classList.remove('hidden');
                renderEventsList(dateStr);
            };

            const renderEventsList = (dateStr) => {
                const listEl = document.getElementById('calEventsList');
                const dayEvents = getEventsForDate(dateStr);

                if (dayEvents.length === 0) {
                    listEl.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Nincsenek események ezen a napon.</p>';
                    return;
                }

                listEl.innerHTML = dayEvents.map(ev => \\\`
                    <div class="flex items-center justify-between p-2 sm:p-3 bg-slate-50 border border-slate-100 rounded-lg group hover:border-blue-200 transition-colors">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                            <span class="text-sm text-slate-700 truncate">\\\${ev.title}</span>
                        </div>
                        <button class="cal-del-event text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" data-id="\\\${ev.id}">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                \\\`).join('');

                // Törlés eseménykezelők
                listEl.querySelectorAll('.cal-del-event').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const id = btn.getAttribute('data-id');
                        events = events.filter(ev => ev.id !== id);
                        saveEvents();
                        renderEventsList(dateStr);
                        renderGrid(); // Frissíteni kell a rácsot is az indikátorok miatt
                        if(app.hmiNotif) app.hmiNotif.showToast('Esemény törölve', 'info');
                    });
                });
            };

            // Kezdeti render
            renderGrid();

            // Navigáció eseménykezelők
            document.getElementById('calPrevMonth')?.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() - 1);
                selectedDateStr = null;
                document.getElementById('calDayDetails').classList.add('hidden');
                renderGrid();
            });

            document.getElementById('calNextMonth')?.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() + 1);
                selectedDateStr = null;
                document.getElementById('calDayDetails').classList.add('hidden');
                renderGrid();
            });

            document.getElementById('calCloseDetails')?.addEventListener('click', () => {
                document.getElementById('calDayDetails').classList.add('hidden');
                selectedDateStr = null;
                renderGrid(); // Leveszi a kijelölést
            });

            // Új esemény hozzáadása
            const inputEl = document.getElementById('calNewEventInput');
            const addBtn = document.getElementById('calAddEventBtn');

            const addEvent = () => {
                const text = inputEl.value.trim();
                if (!text || !selectedDateStr) return;

                const newEvent = {
                    id: 'calev_' + Date.now(),
                    date: selectedDateStr,
                    title: text,
                    timestamp: new Date().toISOString()
                };

                events.push(newEvent);
                saveEvents();

                inputEl.value = '';
                renderEventsList(selectedDateStr);
                renderGrid(); // Frissíteni kell a rácsot is

                if(app.hmiNotif) app.hmiNotif.showToast('Esemény hozzáadva', 'success');
            };

            addBtn?.addEventListener('click', addEvent);
            inputEl?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addEvent();
                }
            });
        }
    }
};
\`;
`;

fs.writeFileSync('js/modules/calendar.js', content);
