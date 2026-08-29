import React, { useState, useEffect } from 'react';

export default function RemindersTab() {
    const [reminders, setReminders] = useState([]);
    const [currentFilter, setCurrentFilter] = useState('all');

    // Form state
    const [remTitle, setRemTitle] = useState('');
    const [remAmount, setRemAmount] = useState('');
    const [remCurrency, setRemCurrency] = useState('HUF');
    const [remDate, setRemDate] = useState('');
    const [remFreq, setRemFreq] = useState('once');

    // Edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editRemId, setEditRemId] = useState('');
    const [editRemTitle, setEditRemTitle] = useState('');
    const [editRemAmount, setEditRemAmount] = useState('');
    const [editRemCurrency, setEditRemCurrency] = useState('HUF');
    const [editRemDate, setEditRemDate] = useState('');
    const [editRemFreq, setEditRemFreq] = useState('once');

    useEffect(() => {
        const fetchReminders = () => {
            if (window.app && window.app.reminderManager) {
                setReminders([...(window.app.reminderManager.reminders || [])]);
            }
        };
        fetchReminders();

        let listener = null;
        if (window.app && typeof window.app.subscribeAppData === 'function') {
            listener = window.app.subscribeAppData((data) => {
                if (data.reminders) {
                    setReminders([...data.reminders]);
                }
            });
        }

        // Polling fallback
        const interval = setInterval(fetchReminders, 1000);
        return () => {
            clearInterval(interval);
            if (window.app && typeof window.app.unsubscribeAppData === 'function' && listener) {
                window.app.unsubscribeAppData(listener);
            }
        };
    }, []);

    const formatFrequency = (freq) => {
        switch (freq) {
            case 'monthly': return 'Havi';
            case 'quarterly': return 'Negyedéves';
            case 'yearly': return 'Éves';
            default: return 'Egyszeri';
        }
    };

    const handleNewReminder = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.app && window.app.remindersApp) {
            await window.app.remindersApp._handleNewReminder({
                title: remTitle,
                amount: parseFloat(remAmount) || 0,
                currency: remCurrency,
                due_date: remDate,
                frequency: remFreq
            });
            // Reset form
            setRemTitle('');
            setRemAmount('');
            setRemCurrency('HUF');
            setRemDate('');
            setRemFreq('once');
        }
    };

    const handleUpdateReminder = async () => {
        if (window.app && window.app.remindersApp) {
            await window.app.remindersApp._updateReminder({
                id: editRemId,
                title: editRemTitle,
                amount: parseFloat(editRemAmount) || 0,
                currency: editRemCurrency,
                due_date: editRemDate,
                frequency: editRemFreq
            });
            setIsEditModalOpen(false);
        }
    };

    const handleEditClick = (rem) => {
        setEditRemId(rem.id);
        setEditRemTitle(rem.title);
        setEditRemAmount(rem.amount || '');
        setEditRemCurrency(rem.currency || 'HUF');
        setEditRemDate(rem.due_date || '');
        setEditRemFreq(rem.frequency || 'once');
        setIsEditModalOpen(true);
    };

    const handleDeleteClick = (id) => {
        if (window.app && window.app.remindersApp) {
            window.app.remindersApp._handleDeleteReminder(id);
        }
    };

    const handleCompleteClick = (id) => {
        if (window.app && window.app.remindersApp) {
            window.app.remindersApp._handleCompleteReminder(id);
        }
    };

    const getStatusHTML = (rem, isCompleted, diffDays) => {
        if (isCompleted) {
            return <span className="inline-block bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-full">TELJESÍTVE</span>;
        } else if (diffDays < 0) {
            return <span className="inline-block bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full">LEJÁRT</span>;
        } else if (diffDays <= 5) {
            return <span className="inline-block bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full">HAMAROSAN</span>;
        } else {
            return <span className="inline-block bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full">AKTÍV</span>;
        }
    };

    const filteredReminders = reminders.filter(rem => {
        if (currentFilter === 'active') return rem.completed !== true;
        if (currentFilter === 'completed') return rem.completed === true;
        return true;
    });

    const sortedReminders = [...filteredReminders].sort((a, b) => {
        const da = new Date(a.due_date).getTime();
        const db = new Date(b.due_date).getTime();
        return da - db;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Űrlap */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
                <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide border-b pb-2 flex items-center gap-2">
                    <i className="fas fa-plus-circle text-emerald-500"></i> Új Esemény
                </h3>
                <form id="reactReminderForm" className="space-y-4" onSubmit={handleNewReminder}>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Esemény neve</label>
                        <input type="text"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-amber-500 font-medium"
                            placeholder="pl. Biztosítás"
                            value={remTitle} onChange={(e) => setRemTitle(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Összeg</label>
                            <input type="number"
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-amber-500 font-mono font-bold"
                                placeholder="0"
                                value={remAmount} onChange={(e) => setRemAmount(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Pénznem</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-amber-500 font-bold"
                                value={remCurrency} onChange={(e) => setRemCurrency(e.target.value)}>
                                <option value="HUF">HUF</option>
                                <option value="EUR">EUR</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Határidő</label>
                        <input type="date"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-amber-500 font-mono font-bold"
                            value={remDate} onChange={(e) => setRemDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Ismétlődés</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:border-amber-500 font-medium"
                            value={remFreq} onChange={(e) => setRemFreq(e.target.value)}>
                            <option value="once">Egyszeri</option>
                            <option value="monthly">Havi</option>
                            <option value="quarterly">Negyedéves</option>
                            <option value="yearly">Éves</option>
                        </select>
                    </div>
                    <button type="submit"
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-gray-900 rounded-xl text-sm font-black uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2">
                        <i className="fas fa-save"></i> Rögzítés
                    </button>
                </form>
            </div>

            {/* Lista */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b pb-2">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <i className="fas fa-list text-blue-500"></i> Határidők Listája
                    </h3>
                    <div className="flex bg-gray-100 p-1 rounded-xl text-[11px]">
                        <button
                            className={`px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all ${currentFilter === 'all' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                            onClick={() => setCurrentFilter('all')}>Mind</button>
                        <button
                            className={`px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all ${currentFilter === 'active' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                            onClick={() => setCurrentFilter('active')}>Aktív</button>
                        <button
                            className={`px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all ${currentFilter === 'completed' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                            onClick={() => setCurrentFilter('completed')}>Teljesített</button>
                    </div>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-gray-100 text-gray-700 uppercase font-black tracking-wider text-[10px] border-b border-gray-200">
                        <tr>
                            <th className="p-3">Státusz</th>
                            <th className="p-3">Esemény</th>
                            <th className="p-3">Gyakoriság</th>
                            <th className="p-3">Határidő</th>
                            <th className="p-3">Hátralévő</th>
                            <th className="p-3">Összeg</th>
                            <th className="p-3 text-right">Művelet</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedReminders.map(rem => {
                            const dueDate = new Date(rem.due_date);
                            dueDate.setHours(0, 0, 0, 0);
                            const diffTime = dueDate.getTime() - today.getTime();
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            const isCompleted = rem.completed === true;

                            return (
                                <tr key={rem.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-all group ${isCompleted ? 'opacity-75' : ''}`}>
                                    <td className="p-3">{getStatusHTML(rem, isCompleted, diffDays)}</td>
                                    <td className={`p-3 font-medium text-gray-800 ${isCompleted ? 'line-through' : ''}`}>{rem.title}</td>
                                    <td className="p-3 text-gray-600">{formatFrequency(rem.frequency)}</td>
                                    <td className="p-3 font-mono text-sm">{rem.due_date}</td>
                                    <td className={`p-3 font-mono text-sm ${diffDays < 0 && !isCompleted ? 'text-red-600' : ''}`}>
                                        {isCompleted ? 'Teljesítve' : (diffDays < 0 ? 'Múltbéli' : `${diffDays} nap`)}
                                    </td>
                                    <td className="p-3 font-bold">{parseFloat(rem.amount).toLocaleString('hu-HU')} {rem.currency || 'HUF'}</td>
                                    <td className="p-3 text-right flex gap-2 justify-end">
                                        {!isCompleted && (
                                            <button className="btn-complete-reminder p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition"
                                                title="Megjelölés teljesítve"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCompleteClick(rem.id); }}>
                                                <i className="fas fa-check"></i>
                                            </button>
                                        )}
                                        <button className="btn-edit-reminder p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditClick(rem); }}>
                                            <i className="fas fa-pen"></i>
                                        </button>
                                        <button className="btn-delete-reminder p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(rem.id); }}>
                                            <i className="fas fa-trash-can"></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 text-white">
                            <h3 className="text-lg font-bold">Határidő Szerkesztése</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Esemény neve</label>
                                <input type="text"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-2xl"
                                    value={editRemTitle} onChange={(e) => setEditRemTitle(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Összeg</label>
                                    <input type="number"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl"
                                        value={editRemAmount} onChange={(e) => setEditRemAmount(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Pénznem</label>
                                    <select className="w-full px-4 py-3 border border-gray-200 rounded-2xl"
                                        value={editRemCurrency} onChange={(e) => setEditRemCurrency(e.target.value)}>
                                        <option value="HUF">HUF</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Határidő</label>
                                <input type="date" className="w-full px-4 py-3 border border-gray-200 rounded-2xl"
                                    value={editRemDate} onChange={(e) => setEditRemDate(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Ismétlődés</label>
                                <select className="w-full px-4 py-3 border border-gray-200 rounded-2xl"
                                    value={editRemFreq} onChange={(e) => setEditRemFreq(e.target.value)}>
                                    <option value="once">Egyszeri</option>
                                    <option value="monthly">Havi</option>
                                    <option value="quarterly">Negyedéves</option>
                                    <option value="yearly">Éves</option>
                                </select>
                            </div>
                        </div>
                        <div className="border-t flex">
                            <button className="flex-1 py-4 text-gray-600 hover:bg-gray-100"
                                onClick={() => setIsEditModalOpen(false)}>Mégse</button>
                            <button className="flex-1 py-4 bg-amber-600 text-white hover:bg-amber-700"
                                onClick={handleUpdateReminder}>Mentés</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
