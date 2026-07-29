export const notepadModuleScript = `
return {
    id: 'plugin_notepad',
    name: 'Jegyzetek és Emlékeztetők',
    version: '2.0.0',
    category: 'custom',
    author: 'Jules',
    description: 'Dinamikus modul beállítható határidők, jegyzetek kezeléséhez, nyugtázás és ismétlődés funkcióval. Helyi és push értesítésekkel (toast).',
    icon: 'fas fa-sticky-note text-yellow-500',
    hasTab: true,
    tabConfig: {
        id: 'tab_custom_notepad',
        title: 'Jegyzetek',
        icon: 'fas fa-sticky-note',
        render: (app) => {
            const view = document.getElementById('moduleView_tab_custom_notepad');
            if (!view) return;

            let notes = JSON.parse(localStorage.getItem('plugin_notepad_notes') || '[]');
            let searchQuery = '';

            const saveNotes = () => {
                localStorage.setItem('plugin_notepad_notes', JSON.stringify(notes));
            };

            // Global background alarm initialization to ensure alarms fire regardless of whether tab is opened
            if (!window.notepadGlobalAlarmInit) {
                window.notepadGlobalAlarmInit = true;
                const checkAlarmsBg = () => {
                    let bgNotes = JSON.parse(localStorage.getItem('plugin_notepad_notes') || '[]');
                    const now = new Date().getTime();
                    let changed = false;
                    bgNotes.forEach(note => {
                        if (note.reminderTime && !note.completed && !note.snoozed) {
                            const rTime = new Date(note.reminderTime).getTime();
                            if (now >= rTime) {
                                const dndEnabled = localStorage.getItem('notepad_dnd') === 'true';
                                const hour = new Date().getHours();
                                const isQuietHours = hour >= 22 || hour < 7;

                                if (!dndEnabled || !isQuietHours) {
                                    if (app.hmiNotif) {
                                        app.hmiNotif.showToast(\`🔔 Emlékeztető: \${note.title}\`, 'info', 5000);
                                    }
                                    if (app.pushManager && app.pushManager.isSubscribed) {
                                        app.pushManager.showLocalNotification(\`🔔 Emlékeztető\`, {
                                            body: note.title,
                                            icon: '/icons/icon-192.png'
                                        });
                                    }
                                }
                                note.snoozed = true;
                                changed = true;
                            }
                        }
                    });
                    if (changed) {
                        localStorage.setItem('plugin_notepad_notes', JSON.stringify(bgNotes));
                        const activeView = document.getElementById('moduleView_tab_custom_notepad');
                        if (activeView && activeView.innerHTML.includes('addNoteForm')) {
                             if (window.notepadRenderUI) window.notepadRenderUI();
                        }
                    }
                };
                if (window.notepadAlarmInterval) clearInterval(window.notepadAlarmInterval);
                window.notepadAlarmInterval = setInterval(checkAlarmsBg, 60000);
                setTimeout(checkAlarmsBg, 1000);
            }

            const checkAlarms = () => {
                const now = new Date().getTime();
                let changed = false;
                notes.forEach(note => {
                    if (note.reminderTime && !note.completed && !note.snoozed) {
                        const rTime = new Date(note.reminderTime).getTime();
                        if (now >= rTime) {
                            const dndEnabled = localStorage.getItem('notepad_dnd') === 'true';
                            const hour = new Date().getHours();
                            const isQuietHours = hour >= 22 || hour < 7;

                            if (!dndEnabled || !isQuietHours) {
                                if (app.hmiNotif) {
                                    app.hmiNotif.showToast(\`🔔 Emlékeztető: \${note.title}\`, 'info', 5000);
                                }
                                if (app.pushManager && app.pushManager.isSubscribed) {
                                    app.pushManager.showLocalNotification(\`🔔 Emlékeztető\`, {
                                        body: note.title,
                                        icon: '/icons/icon-192.png'
                                    });
                                }
                            }
                            note.snoozed = true;
                            changed = true;
                        }
                    }
                });
                if (changed) {
                    saveNotes();
                    renderUI();
                }
            };

            const renderUI = () => {
                notes = JSON.parse(localStorage.getItem('plugin_notepad_notes') || '[]'); // refresh notes before render

                // Sorting: pinned > priority > reminder
                notes.sort((a, b) => {
                    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

                    const pMap = { high: 3, medium: 2, low: 1 };
                    const pa = pMap[a.priority || 'medium'];
                    const pb = pMap[b.priority || 'medium'];
                    if (pa !== pb) return pb - pa;

                    if (a.reminderTime && b.reminderTime) return new Date(a.reminderTime) - new Date(b.reminderTime);
                    if (a.reminderTime) return -1;
                    if (b.reminderTime) return 1;
                    return 0;
                });

                const filteredNotes = notes.filter(n => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
                });

                view.innerHTML = \`
                    <div class="p-4 space-y-4 max-w-2xl mx-auto pb-24">
                        <div class="mb-4">
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <i class="fas fa-search text-slate-400 text-xs"></i>
                                </div>
                                <input type="text" id="noteSearchInput" class="bg-white border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-9 p-2.5 font-medium shadow-sm" placeholder="Keresés jegyzetekben..." value="\${searchQuery}">
                            </div>
                        </div>

                        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                            <div class="flex items-center gap-2">
                                <i class="fas fa-moon text-indigo-400"></i>
                                <span class="text-xs font-bold text-slate-700">Ne zavarj (22:00 - 07:00)</span>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="notepadDndToggle" class="sr-only peer" \${localStorage.getItem('notepad_dnd') === 'true' ? 'checked' : ''}>
                                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                            </label>
                        </div>

                        <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6">
                            <h3 class="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                                <i class="fas fa-plus-circle text-yellow-500"></i> Új Jegyzet / Emlékeztető
                            </h3>
                            <form id="addNoteForm" class="space-y-3">
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cím</label>
                                        <input type="text" id="noteTitle" required class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium" placeholder="Emlékeztető címe...">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Prioritás</label>
                                        <select id="notePriority" class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium">
                                            <option value="low">🟢 Ráér</option>
                                            <option value="medium" selected>🟡 Közepes</option>
                                            <option value="high">🔴 Sürgős</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Leírás</label>
                                        <textarea id="noteContent" class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium min-h-[60px]" placeholder="Opcionális leírás..."></textarea>
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Kiadás Kategória (Opc.)</label>
                                        <select id="noteExpenseCategory" class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium">
                                            <option value="">Nincs kiválasztva</option>
                                            \${(app.items && app.items.items ? app.items.items.map(cat => \`<option value="\${cat.id}">\${cat.name}</option>\`).join('') : '')}
                                        </select>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Határidő</label>
                                        <input type="datetime-local" id="noteReminderTime" class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ismétlődés</label>
                                        <select id="noteRepeat" class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium">
                                            <option value="none">Nincs</option>
                                            <option value="daily">Naponta</option>
                                            <option value="weekly">Hetente</option>
                                            <option value="weekdays">Hétköznap (H-P)</option>
                                            <option value="monthly">Havonta</option>
                                            <option value="every_monday">Minden Hétfőn</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="pt-2">
                                    <button type="submit" class="w-full text-white bg-yellow-500 hover:bg-yellow-600 focus:ring-4 focus:outline-none focus:ring-yellow-300 font-bold rounded-xl text-xs px-5 py-3 text-center transition shadow-sm">
                                        <i class="fas fa-save mr-1"></i> Jegyzet Mentése
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div class="space-y-3" id="notesContainer">
                            \${filteredNotes.length === 0 ? '<div class="text-center text-slate-400 text-xs py-8">' + (searchQuery ? 'Nincs találat.' : 'Nincsenek jegyzetek.') + '</div>' : ''}
                            \${filteredNotes.map(note => {
                                const isOverdue = note.reminderTime && new Date(note.reminderTime) < new Date() && !note.completed;
                                let statusColor = note.completed ? 'bg-slate-50 border-slate-200 opacity-70' :
                                                    (isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200');
                                if (note.pinned && !note.completed) {
                                    statusColor = 'bg-yellow-50 border-yellow-200';
                                }

                                const titleColor = note.completed ? 'text-slate-500 line-through' : 'text-slate-800';

                                let priorityBorder = '';
                                if (!note.completed) {
                                    if (note.priority === 'high') priorityBorder = 'border-l-4 border-l-red-500';
                                    else if (note.priority === 'low') priorityBorder = 'border-l-4 border-l-green-400';
                                    else priorityBorder = 'border-l-4 border-l-yellow-400';
                                }

                                const escapeHtml = (unsafe) => {
                                    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                                };

                                return \`
                                <div class="\${statusColor} \${priorityBorder} border rounded-2xl p-4 shadow-sm transition-all relative group" data-id="\${note.id}">
                                    \${note.pinned ? '<div class="absolute top-2 right-2 text-yellow-500 text-[10px]"><i class="fas fa-thumbtack"></i></div>' : ''}
                                    <div class="flex justify-between items-start gap-2">
                                        <div class="flex-1 min-w-0">
                                            <h4 class="text-sm font-bold \${titleColor} truncate flex items-center gap-2">
                                                \${note.completed ? '<i class="fas fa-check-circle text-emerald-500"></i>' : ''}
                                                \${escapeHtml(note.title)}
                                            </h4>
                                            \${note.content ? \`<p class="text-xs text-slate-500 mt-1 line-clamp-2">\${escapeHtml(note.content)}</p>\` : ''}

                                            \${note.reminderTime ? \`
                                                <div class="flex items-center gap-2 mt-2 text-[10px] font-bold \${isOverdue ? 'text-rose-600' : 'text-slate-400'} uppercase">
                                                    <i class="far fa-clock"></i>
                                                    \${new Date(note.reminderTime).toLocaleString('hu-HU', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                                                    \${note.repeat !== 'none' ? \`<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1"><i class="fas fa-sync-alt"></i> \${note.repeat}</span>\` : ''}
                                                </div>
                                            \` : ''}
                                        </div>

                                        <div class="flex flex-col gap-2 shrink-0 items-end">
                                            <div class="flex flex-row gap-2">
                                                <button type="button" class="btn-create-expense px-2 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center gap-1 transition text-[10px] font-bold uppercase" data-id="\${note.id}" title="Kiadásként rögzít">
                                                    <i class="fas fa-plus"></i> Kiadásként
                                                </button>
                                                <button type="button" class="btn-pin-note w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex items-center justify-center transition" data-id="\${note.id}" title="Rögzítés felülre">
                                                    <i class="fas \${note.pinned ? 'fa-thumbtack text-yellow-500' : 'fa-thumbtack'} text-xs"></i>
                                                </button>
                                                \${!note.completed ? \`
                                                    <button type="button" class="btn-complete-note w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition" data-id="\${note.id}" title="Nyugtázás">
                                                        <i class="fas fa-check text-xs"></i>
                                                    </button>
                                                    \${note.reminderTime ? \`
                                                    <div class="relative inline-block text-left group/snooze">
                                                        <button type="button" class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition" title="Szundiztatás">
                                                            <i class="fas fa-bed text-xs"></i>
                                                        </button>
                                                        <div class="hidden group-hover/snooze:block absolute right-0 top-full mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-lg z-10 py-1 text-xs">
                                                            <a href="#" class="block px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 btn-snooze-opt" data-id="\${note.id}" data-val="10m">10 perc</a>
                                                            <a href="#" class="block px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 btn-snooze-opt" data-id="\${note.id}" data-val="30m">30 perc</a>
                                                            <a href="#" class="block px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 btn-snooze-opt" data-id="\${note.id}" data-val="1h">1 óra</a>
                                                            <a href="#" class="block px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 btn-snooze-opt" data-id="\${note.id}" data-val="tomorrow9">Holnap 9:00</a>
                                                            <div class="border-t border-slate-100 my-1"></div>
                                                            <div class="px-4 py-2">
                                                                <input type="datetime-local" class="w-full text-[10px] p-1 border rounded custom-snooze-input" data-id="\${note.id}">
                                                                <button class="w-full mt-1 bg-blue-500 text-white rounded p-1 btn-snooze-custom" data-id="\${note.id}">OK</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    \` : ''}
                                                \` : ''}
                                                <button type="button" class="btn-delete-note w-8 h-8 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition" data-id="\${note.id}" title="Törlés">
                                                    <i class="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                \`;
                            }).join('')}
                        </div>
                    </div>
                \`;

                // Add Note
                document.getElementById('addNoteForm')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const title = document.getElementById('noteTitle').value.trim();
                    const content = document.getElementById('noteContent').value.trim();
                    const time = document.getElementById('noteReminderTime').value;
                    const repeat = document.getElementById('noteRepeat').value;
                    const priority = document.getElementById('notePriority').value || 'medium';
                    const expenseCategoryId = document.getElementById('noteExpenseCategory').value;

                    if (title) {
                        notes.unshift({
                            id: 'note_' + Date.now(),
                            title,
                            content,
                            reminderTime: time || null,
                            repeat: repeat || 'none',
                            priority,
                            expenseCategoryId,
                            pinned: false,
                            completed: false,
                            snoozed: false
                        });
                        saveNotes();
                        renderUI();
                        if (app.hmiNotif) app.hmiNotif.showToast('Jegyzet sikeresen mentve!', 'success');
                    }
                });

                // Complete Note
                view.querySelectorAll('.btn-complete-note').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        const note = notes.find(n => n.id === id);
                        if (note) {
                            note.completed = true;

                            // Ha ismétlődő, hozzunk létre egy újat a jövőben
                            if (note.repeat !== 'none' && note.reminderTime) {
                                const d = new Date(note.reminderTime);

                                if (note.repeat === 'daily') d.setDate(d.getDate() + 1);
                                else if (note.repeat === 'weekly') d.setDate(d.getDate() + 7);
                                else if (note.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
                                else if (note.repeat === 'weekdays') {
                                    d.setDate(d.getDate() + 1);
                                    if (d.getDay() === 6) d.setDate(d.getDate() + 2); // if sat, go to mon
                                    else if (d.getDay() === 0) d.setDate(d.getDate() + 1); // if sun, go to mon
                                }
                                else if (note.repeat === 'every_monday') {
                                    d.setDate(d.getDate() + 1);
                                    while (d.getDay() !== 1) {
                                        d.setDate(d.getDate() + 1);
                                    }
                                }

                                const pad = n => n<10 ? '0'+n : n;
                                const dtString = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());

                                notes.unshift({
                                    id: 'note_' + Date.now() + '_rep',
                                    title: note.title,
                                    content: note.content,
                                    reminderTime: dtString,
                                    repeat: note.repeat,
                                    priority: note.priority,
                                    expenseCategoryId: note.expenseCategoryId,
                                    pinned: note.pinned,
                                    completed: false,
                                    snoozed: false
                                });
                                if (app.hmiNotif) app.hmiNotif.showToast('Következő ismétlődés beütemezve!', 'info');
                            } else {
                                if (app.hmiNotif) app.hmiNotif.showToast('Jegyzet nyugtázva!', 'success');
                            }

                            saveNotes();
                            renderUI();
                        }
                    });
                });

                // Snooze Note options
                view.querySelectorAll('.btn-snooze-opt').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const id = btn.getAttribute('data-id');
                        const val = btn.getAttribute('data-val');
                        const note = notes.find(n => n.id === id);
                        if (note && note.reminderTime) {
                            const d = new Date();
                            if (val === '10m') d.setMinutes(d.getMinutes() + 10);
                            else if (val === '30m') d.setMinutes(d.getMinutes() + 30);
                            else if (val === '1h') d.setHours(d.getHours() + 1);
                            else if (val === 'tomorrow9') {
                                d.setDate(d.getDate() + 1);
                                d.setHours(9, 0, 0, 0);
                            }

                            const pad = n => n<10 ? '0'+n : n;
                            const dtString = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());

                            note.reminderTime = dtString;
                            note.snoozed = false;

                            saveNotes();
                            renderUI();
                            if (app.hmiNotif) app.hmiNotif.showToast('Szundiztatva!', 'info');
                        }
                    });
                });

                view.querySelectorAll('.btn-snooze-custom').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        const input = view.querySelector(\`.custom-snooze-input[data-id="\${id}"]\`);
                        if (input && input.value) {
                            const note = notes.find(n => n.id === id);
                            if (note) {
                                note.reminderTime = input.value;
                                note.snoozed = false;
                                saveNotes();
                                renderUI();
                                if (app.hmiNotif) app.hmiNotif.showToast('Egyéni szundi beállítva!', 'info');
                            }
                        }
                    });
                });

                // Expense Integration
                view.querySelectorAll('.btn-create-expense').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        const note = notes.find(n => n.id === id);
                        if (note) {
                            const combinedText = (note.title + ' ' + (note.content || '')).replace(/\u00A0/g, ' ');

                            // Regex to find amounts like 15000, 15 000, 15000 Ft, etc.
                            const amountMatch = combinedText.match(/(\d+[\s]*000| \d+)\s*(Ft|HUF|€)?/i);
                            let amount = '';
                            if (amountMatch && amountMatch[1]) {
                                amount = amountMatch[1].replace(/\s/g, '');
                            }

                            if (!amount) {
                                amount = prompt('Kérjük, add meg az összeget (Ft):', '');
                                if (!amount) return; // User cancelled
                            }

                            const expenseData = {
                                amount: parseInt(amount, 10),
                                description: note.title,
                                category: note.expenseCategoryId || null,
                                noteId: note.id
                            };

                            // 1. Dispatch custom event
                            window.dispatchEvent(new CustomEvent('create-expense-from-note', { detail: expenseData }));

                            // 2. Direct fallback (if expense module is globally available)
                            let success = false;

                            if (window.expenseManager) {
                                window.expenseManager.create(expenseData);
                                success = true;
                            }

                            if (app.hmiNotif) {
                                app.hmiNotif.showToast('Kiadás sikeresen létrehozva a jegyzetből!', 'success');
                            }
                        }
                    });
                });

                // Pin Note
                view.querySelectorAll('.btn-pin-note').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        const note = notes.find(n => n.id === id);
                        if (note) {
                            note.pinned = !note.pinned;
                            saveNotes();
                            renderUI();
                        }
                    });
                });

                // Delete Note
                view.querySelectorAll('.btn-delete-note').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        notes = notes.filter(n => n.id !== id);
                        saveNotes();
                        renderUI();
                        if (app.hmiNotif) app.hmiNotif.showToast('Jegyzet törölve!', 'success');
                    });
                });

                // DND Toggle
                const dndToggle = document.getElementById('notepadDndToggle');
                if (dndToggle) {
                    dndToggle.addEventListener('change', (e) => {
                        localStorage.setItem('notepad_dnd', e.target.checked ? 'true' : 'false');
                        if (app.hmiNotif) app.hmiNotif.showToast(e.target.checked ? 'Ne zavarj bekapcsolva (22:00-07:00)' : 'Ne zavarj kikapcsolva', 'info');
                    });
                }

                // Search setup
                const searchInput = document.getElementById('noteSearchInput');
                if (searchInput) {
                    // search focus handling with timeout
                    searchInput.addEventListener('input', (e) => {
                         searchQuery = e.target.value;

                         // debounced render to avoid losing focus too quickly
                         if (window.searchTimeout) clearTimeout(window.searchTimeout);
                         window.searchTimeout = setTimeout(() => {
                             renderUI();
                             const newSearch = document.getElementById('noteSearchInput');
                             if (newSearch) {
                                 newSearch.focus();
                                 newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
                             }
                         }, 300);
                    });
                }
            };

            window.notepadRenderUI = renderUI;
            renderUI();
        }
    }
};
`;
