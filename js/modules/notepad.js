export const notepadModuleScript = `
return {
    id: 'plugin_notepad',
    name: 'Jegyzetek és Emlékeztetők',
    version: '1.0.0',
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
                                if (app.hmiNotif) {
                                    app.hmiNotif.showToast(\`🔔 Emlékeztető: \${note.title}\`, 'info', 5000);
                                }
                                if (app.pushManager && app.pushManager.isSubscribed) {
                                    app.pushManager.showLocalNotification(\`🔔 Emlékeztető\`, {
                                        body: note.title,
                                        icon: '/icons/icon-192.png'
                                    });
                                }
                                note.snoozed = true;
                                changed = true;
                            }
                        }
                    });
                    if (changed) {
                        localStorage.setItem('plugin_notepad_notes', JSON.stringify(bgNotes));
                        // Attempt to update UI if it's currently rendered
                        const activeView = document.getElementById('moduleView_tab_custom_notepad');
                        if (activeView && activeView.innerHTML.includes('addNoteForm')) {
                             // We are active, better to reload notes
                             // Unfortunately we can't easily re-render from the background interval without a global ref,
                             // but we can refresh local notes list and let the next interaction sync it
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
                            if (app.hmiNotif) {
                                app.hmiNotif.showToast(\`🔔 Emlékeztető: \${note.title}\`, 'info', 5000);
                            }
                            // Push ha van
                            if (app.pushManager && app.pushManager.isSubscribed) {
                                app.pushManager.showLocalNotification(\`🔔 Emlékeztető\`, {
                                    body: note.title,
                                    icon: '/icons/icon-192.png'
                                });
                            }

                            // Auto-snooze so we don't spam
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
                view.innerHTML = \`
                    <div class="p-4 space-y-4 max-w-2xl mx-auto pb-24">
                        <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6">
                            <h3 class="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                                <i class="fas fa-plus-circle text-yellow-500"></i> Új Jegyzet / Emlékeztető
                            </h3>
                            <form id="addNoteForm" class="space-y-3">
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cím</label>
                                    <input type="text" id="noteTitle" required class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium" placeholder="Emlékeztető címe...">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Leírás</label>
                                    <textarea id="noteContent" class="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-2.5 font-medium min-h-[60px]" placeholder="Opcionális leírás..."></textarea>
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
                                            <option value="monthly">Havonta</option>
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
                            \${notes.length === 0 ? '<div class="text-center text-slate-400 text-xs py-8">Nincsenek jegyzetek.</div>' : ''}
                            \${notes.map(note => {
                                const isOverdue = note.reminderTime && new Date(note.reminderTime) < new Date() && !note.completed;
                                const statusColor = note.completed ? 'bg-slate-50 border-slate-200 opacity-70' :
                                                    (isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200');
                                const titleColor = note.completed ? 'text-slate-500 line-through' : 'text-slate-800';

                                const escapeHtml = (unsafe) => {
                                    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                                };

                                return \`
                                <div class="\${statusColor} border rounded-2xl p-4 shadow-sm transition-all" data-id="\${note.id}">
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

                                        <div class="flex flex-col gap-2 shrink-0">
                                            \${!note.completed ? \`
                                                <button type="button" class="btn-complete-note w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition" data-id="\${note.id}" title="Nyugtázás">
                                                    <i class="fas fa-check text-xs"></i>
                                                </button>
                                                \${note.reminderTime ? \`
                                                <button type="button" class="btn-snooze-note w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition" data-id="\${note.id}" title="Szundiztatás (1 óra)">
                                                    <i class="fas fa-bed text-xs"></i>
                                                </button>
                                                \` : ''}
                                            \` : ''}
                                            <button type="button" class="btn-delete-note w-8 h-8 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition" data-id="\${note.id}" title="Törlés">
                                                <i class="fas fa-trash text-xs"></i>
                                            </button>
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

                    if (title) {
                        notes.unshift({
                            id: 'note_' + Date.now(),
                            title,
                            content,
                            reminderTime: time || null,
                            repeat: repeat || 'none',
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
                                if (note.repeat === 'weekly') d.setDate(d.getDate() + 7);
                                if (note.repeat === 'monthly') d.setMonth(d.getMonth() + 1);

                                const pad = n => n<10 ? '0'+n : n;
                                const dtString = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());

                                notes.unshift({
                                    id: 'note_' + Date.now() + '_rep',
                                    title: note.title,
                                    content: note.content,
                                    reminderTime: dtString,
                                    repeat: note.repeat,
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

                // Snooze Note (1 hour)
                view.querySelectorAll('.btn-snooze-note').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        const note = notes.find(n => n.id === id);
                        if (note && note.reminderTime) {
                            const d = new Date();
                            d.setHours(d.getHours() + 1);

                            // Adjust string for local timezone input datetime-local
                            const pad = n => n<10 ? '0'+n : n;
                            const dtString = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());

                            note.reminderTime = dtString;
                            note.snoozed = false; // reset snooze flag

                            saveNotes();
                            renderUI();
                            if (app.hmiNotif) app.hmiNotif.showToast('Szundiztatva 1 órával!', 'info');
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
            };

            window.notepadRenderUI = renderUI;
            renderUI();
        }
    }
};
`;
