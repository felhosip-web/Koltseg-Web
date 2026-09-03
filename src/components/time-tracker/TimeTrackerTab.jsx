import React, { useState, useEffect } from 'react';
import { db } from '../../../js/db.js';
import { useAppStore } from '../../store/useAppStore.js';

export default function TimeTrackerTab() {
    const snapshot = useAppStore();
    const [projects, setProjects] = useState([]);
    const [activeTimer, setActiveTimer] = useState(null);
    const [todayEntries, setTodayEntries] = useState([]);
    const [stats, setStats] = useState({
        todayMinutes: 0,
        todayEarnings: 0,
        weekMinutes: 0,
        weekEarnings: 0,
        monthMinutes: 0,
        monthEarnings: 0
    });

    const [timerString, setTimerString] = useState('00:00:00');
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [taskName, setTaskName] = useState('');

    useEffect(() => {
        if (!snapshot || !snapshot.isLoaded) return;
        
        if (snapshot.timeTracker) {
            setProjects(snapshot.timeTracker.projects || []);
            setActiveTimer(snapshot.timeTracker.activeTimer || null);
        }

        const loadDbData = async () => {
            if (snapshot.dayjs) {
                try {
                    const today = snapshot.dayjs().format('YYYY-MM-DD');
                    const entries = await db.timeEntries.where('date').equals(today).toArray();

                    let todayMinutes = 0;
                    let todayEarnings = 0;
                    entries.forEach(e => {
                        todayMinutes += e.durationMin;
                        todayEarnings += e.earnings;
                    });

                    const startOfWeek = snapshot.dayjs().startOf('week').format('YYYY-MM-DD');
                    const endOfWeek = snapshot.dayjs().endOf('week').format('YYYY-MM-DD');
                    const weekEntries = await db.timeEntries.where('date').between(startOfWeek, endOfWeek, true, true).toArray();
                    let weekMinutes = 0;
                    let weekEarnings = 0;
                    weekEntries.forEach(e => {
                        weekMinutes += e.durationMin;
                        weekEarnings += e.earnings;
                    });

                    const startOfMonth = snapshot.dayjs().startOf('month').format('YYYY-MM-DD');
                    const endOfMonth = snapshot.dayjs().endOf('month').format('YYYY-MM-DD');
                    const monthEntries = await db.timeEntries.where('date').between(startOfMonth, endOfMonth, true, true).toArray();
                    let monthMinutes = 0;
                    let monthEarnings = 0;
                    monthEntries.forEach(e => {
                        monthMinutes += e.durationMin;
                        monthEarnings += e.earnings;
                    });

                    setTodayEntries(entries);
                    setStats({
                        todayMinutes,
                        todayEarnings,
                        weekMinutes,
                        weekEarnings,
                        monthMinutes,
                        monthEarnings
                    });
                } catch(e) {
                    console.warn('Error loading time tracker DB entries in React', e);
                }
            }
        };
        
        loadDbData();
    }, [snapshot]);

    useEffect(() => {
        let interval;
        if (activeTimer) {
            const updateTimerStr = () => {
                let totalElapsedMs = activeTimer.elapsedPausedMs || 0;
                if (!activeTimer.isPaused) {
                    const now = new Date().getTime();
                    const start = new Date(activeTimer.startISO).getTime();
                    totalElapsedMs += (now - start);
                }
                const diffSec = Math.floor(totalElapsedMs / 1000);
                const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
                const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
                const s = String(diffSec % 60).padStart(2, '0');
                setTimerString(`${h}:${m}:${s}`);
            };

            updateTimerStr();
            interval = setInterval(updateTimerStr, 1000);
        } else {
            setTimerString('00:00:00');
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [activeTimer]);

    const formatDuration = (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0) return `${h}ó ${m}p`;
        return `${m}p`;
    };

    const handleStartTimer = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedProjectId) {
            window.app.hmiNotif?.showToast('Kérlek válassz projektet!', 'warning');
            return;
        }
        if (!taskName) {
            window.app.hmiNotif?.showToast('Írd be mit csinálsz!', 'warning');
            return;
        }
        if (window.app.timeTracker) {
            window.app.timeTracker.startTimer(selectedProjectId, taskName);
            setTaskName(''); // Reset task input after start
        }
    };

    const handlePauseTimer = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app.timeTracker) window.app.timeTracker.pauseTimer();
    };

    const handleResumeTimer = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app.timeTracker) window.app.timeTracker.resumeTimer();
    };

    const handleStopTimer = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app.timeTracker) window.app.timeTracker.stopTimer();
    };

    const handleNewProject = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app.timeTracker) window.app.timeTracker.showProjectModal();
    };

    const handleManualAdd = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (projects.length === 0) {
            window.app.hmiNotif?.showToast('Előbb hozz létre egy projektet!', 'warning');
            return;
        }
        if (window.app.timeTracker) window.app.timeTracker.showEntryModal();
    };

    const handleEditEntry = async (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target.closest('.btn-delete-entry')) return; // Avoid triggering on delete
        if (window.app.timeTracker) {
            const entry = await db.timeEntries.get(id);
            if (entry) window.app.timeTracker.showEntryModal(entry);
        }
    };

    const handleDeleteEntry = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app.timeTracker && typeof window.app.timeTracker.deleteEntry === 'function') {
            window.app.timeTracker.deleteEntry(id);
        }
    };

    const handleDeleteProject = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.app.timeTracker && typeof window.app.timeTracker.deleteProject === 'function') {
            window.app.timeTracker.deleteProject(id);
        }
    };

    const activeProject = activeTimer ? projects.find(p => p.id === activeTimer.projectId) : null;

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto pb-24 animate-fade-in">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                <i className="fas fa-stopwatch text-purple-500"></i> Időmérő
            </h1>

            {activeTimer && (
                <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl mb-6 text-center shadow-sm">
                    <h2 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">Aktív időmérő</h2>
                    <div id="active-timer-display" className={`text-4xl font-mono font-bold text-blue-900 mb-2 ${activeTimer.isPaused ? 'opacity-50' : ''}`}>
                        {timerString}
                    </div>
                    <div className="text-sm text-blue-700 mb-4 font-medium">
                        {activeProject?.name || 'Ismeretlen'} - {activeTimer.task}
                    </div>
                    <div className="flex justify-center gap-3">
                        {activeTimer.isPaused ? (
                            <button id="btnResumeTimer" onClick={handleResumeTimer} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-sm transition">
                                <i className="fas fa-play"></i> ▶ Folytatás
                            </button>
                        ) : (
                            <button id="btnPauseTimer" onClick={handlePauseTimer} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-sm transition">
                                <i className="fas fa-pause"></i> ⏸ Szünet
                            </button>
                        )}
                        <button id="btnStopTimer" onClick={handleStopTimer} className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-sm transition">
                            <i className="fas fa-stop"></i> ⏹ Stop + Mentés
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-3">
                <select
                    id="timerProjectSelect"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1 font-medium">
                    <option value="">Válassz projektet...</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <input
                    type="text"
                    id="timerTaskInput"
                    placeholder="Mit csinálsz épp?"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1 font-medium" />
                <button id="btnStartTimer" onClick={handleStartTimer} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl px-5 py-2 font-bold transition flex items-center gap-2 justify-center shadow-sm">
                    <i className="fas fa-play"></i> ▶ Indítás
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 text-center">
                    <div className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-1">Ma</div>
                    <div className="text-base font-bold text-purple-900">{formatDuration(stats.todayMinutes)} • {stats.todayEarnings.toLocaleString('hu-HU')} Ft</div>
                </div>
                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-center">
                    <div className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1">Ezen a héten</div>
                    <div className="text-base font-bold text-indigo-900">{formatDuration(stats.weekMinutes)} • {stats.weekEarnings.toLocaleString('hu-HU')} Ft</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                    <div className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Ebben a hónapban</div>
                    <div className="text-base font-bold text-blue-900">{formatDuration(stats.monthMinutes)} • {stats.monthEarnings.toLocaleString('hu-HU')} Ft</div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-gray-700 text-sm flex justify-between">
                    <span>Mai bejegyzések</span>
                    <button id="btnManualAdd" onClick={handleManualAdd} className="text-purple-600 hover:text-purple-800 transition flex items-center gap-1"><i className="fas fa-plus"></i> Kézi</button>
                </div>
                <div>
                    {todayEntries.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm italic">Nincs ma mért idő. Indíts egy projektet!</div>
                    ) : (
                        todayEntries.map(e => {
                            const p = projects.find(proj => proj.id === e.projectId);
                            return (
                                <div key={e.id} onClick={(ev) => handleEditEntry(ev, e.id)} className="flex justify-between items-center p-3 border-b border-gray-100 last:border-0 bg-white group hover:bg-gray-50 cursor-pointer entry-row" data-id={e.id}>
                                    <div>
                                        <div className="text-sm font-bold text-gray-800">{p?.name || 'Ismeretlen'}</div>
                                        <div className="text-xs text-gray-500">{e.task}</div>
                                    </div>
                                    <div className="text-right flex items-center gap-3">
                                        <div>
                                            <div className="text-sm font-mono text-gray-600">{formatDuration(e.durationMin)}</div>
                                            {e.earnings > 0 ? (
                                                <div className="font-bold text-emerald-600">{e.earnings.toLocaleString('hu-HU')} Ft</div>
                                            ) : (
                                                <div className="font-bold text-gray-400">— Ft</div>
                                            )}
                                        </div>
                                        <button onClick={(ev) => handleDeleteEntry(ev, e.id)} className="text-gray-400 hover:text-rose-500 transition btn-delete-entry hidden group-hover:block" data-id={e.id} title="Törlés"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div onClick={() => setProjectsOpen(!projectsOpen)} className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-gray-700 text-sm flex justify-between items-center cursor-pointer hover:bg-gray-100 transition" id="toggleProjectsBtn">
                    <span>Projektek ({projects.length})</span>
                    <i className={`fas fa-chevron-down text-gray-400 transition-transform ${projectsOpen ? 'rotate-180' : ''}`}></i>
                </div>
                {projectsOpen && (
                    <div id="projectsListContainer">
                        <div className="p-3 bg-white border-b border-gray-50">
                            <button id="btnNewProject" onClick={handleNewProject} className="w-full py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 transition shadow-sm border border-purple-100">
                                + Új projekt
                            </button>
                        </div>
                        {projects.length === 0 ? (
                            <div className="p-6 text-center text-gray-400 text-sm italic">Nincsenek projektek. Kattints az Új projekt gombra!</div>
                        ) : (
                            projects.map(p => (
                                <div key={p.id} className="p-4 border-b border-gray-100 last:border-0 flex justify-between items-center text-sm hover:bg-gray-50 transition group">
                                    <div>
                                        <span className="font-bold text-gray-800">{p.name}</span>
                                        {p.client && <span className="text-xs text-gray-500 ml-1">({p.client})</span>}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs font-bold">
                                            {p.hourlyRate ? `${p.hourlyRate.toLocaleString('hu-HU')} Ft/óra` : 'Nincs óradíj'}
                                        </div>
                                        <button onClick={(e) => handleDeleteProject(e, p.id)} className="text-gray-400 hover:text-rose-500 transition hidden group-hover:block btn-delete-project" data-id={p.id} title="Törlés"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
