import React, { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { appService } from '../../services/appService';
import { formatCurrency, convertAmount, resolveDefaultCurrency } from '../../utils/currency-utils.js';

export default function IncomingTab() {
    const incomings = useAppStore(state => state.incomings || []);
    const primaryCurrency = useAppStore(state => state.primaryCurrency || 'HUF');
    const eurRate = useAppStore(state => state.eurRate || 400);

    // Modal state for creating/editing incoming items
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [modalSender, setModalSender] = useState('');
    const [modalNewSender, setModalNewSender] = useState('');
    const [modalDate, setModalDate] = useState('');
    const [modalAmount, setModalAmount] = useState('');
    const [modalCurrency, setModalCurrency] = useState(resolveDefaultCurrency(null, primaryCurrency));
    const [modalIsStorno, setModalIsStorno] = useState(false);

    const senders = useMemo(() => {
        return [...new Set(incomings.map(e => e?.sender).filter(Boolean))].sort();
    }, [incomings]);

    const dates = [...new Set(incomings.map(e => e?.date).filter(Boolean))].sort();

    const formatDate = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const openCreateModal = (prefillSender = '', prefillDate = '') => {
        const todayStr = new Date().toISOString().split('T')[0];
        setEditingId(null);
        setModalSender(prefillSender || (senders[0] || '__new__'));
        setModalNewSender('');
        setModalDate(prefillDate || todayStr);
        setModalAmount('');
        setModalCurrency(resolveDefaultCurrency(null, primaryCurrency));
        setModalIsStorno(false);
        setIsModalOpen(true);
    };

    const openEditModal = (entry) => {
        setEditingId(entry.id);
        setModalSender(entry.sender || '');
        setModalNewSender('');
        setModalDate(entry.date || '');
        setModalAmount(entry.amount ? String(entry.amount) : '');
        // Preserve entry's stored currency, falling back to HUF for legacy records
        setModalCurrency(entry.currency || 'HUF');
        setModalIsStorno(Boolean(entry.isStorno));
        setIsModalOpen(true);
    };

    useEffect(() => {
        const handleOpenNew = () => {
            openCreateModal();
        };
        const handleOpenCell = (evt) => {
            const data = evt.detail;
            if (!data) return;
            if (data.entryId) {
                const target = incomings.find(i => String(i.id) === String(data.entryId));
                if (target) {
                    openEditModal(target);
                    return;
                }
            }
            openCreateModal(data.sender, data.date);
        };

        window.addEventListener('incoming-open-new', handleOpenNew);
        window.addEventListener('incoming-open-cell', handleOpenCell);
        return () => {
            window.removeEventListener('incoming-open-new', handleOpenNew);
            window.removeEventListener('incoming-open-cell', handleOpenCell);
        };
    }, [incomings, primaryCurrency, senders]);

    const handleAddIncoming = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const appInst = appService.getAppInstance();
        if (appInst?.incomingManager?.addNewEntry) {
            appService.addNewIncomingEntry();
        } else {
            openCreateModal();
        }
    };

    const handleCellClick = (e, sender, date, entryId, amount) => {
        e.preventDefault();
        e.stopPropagation();
        const appInst = appService.getAppInstance();
        if (appInst?.incomingManager?._handleCellClick) {
            const fakeElement = {
                dataset: {
                    sender,
                    date,
                    entryId: entryId || '',
                    amount: amount || ''
                }
            };
            appService.handleIncomingCellClick(fakeElement);
        } else {
            if (entryId) {
                const entry = incomings.find(item => String(item.id) === String(entryId));
                if (entry) {
                    openEditModal(entry);
                    return;
                }
            }
            openCreateModal(sender, date);
        }
    };

    const handleModalSave = async () => {
        const isNew = modalSender === '__new__' || !modalSender || senders.length === 0;
        const finalSender = (isNew ? modalNewSender : modalSender).trim();
        if (!finalSender) {
            appService.showToast('Az utaló neve nem lehet üres!', 'error');
            return;
        }
        const parsedAmount = parseFloat(modalAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            appService.showToast('Érvénytelen összeg!', 'error');
            return;
        }
        if (!modalDate || !/^\d{4}-\d{2}-\d{2}$/.test(modalDate)) {
            appService.showToast('Érvénytelen dátum!', 'error');
            return;
        }

        await appService.saveIncomingEntry({
            id: editingId,
            sender: finalSender,
            date: modalDate,
            amount: parsedAmount,
            currency: modalCurrency,
            isStorno: modalIsStorno
        });

        setIsModalOpen(false);
        appService.showToast(editingId ? 'Bejövő utalás frissítve!' : 'Új bejövő utalás rögzítve!', 'success');
    };

    const handleModalDelete = async () => {
        if (!editingId) return;
        const confirmed = await appService.showConfirm({
            title: 'Tétel törlése',
            message: 'Biztosan törölni szeretnéd ezt a bejövő utalást?',
            type: 'danger',
            confirmText: 'Törlés'
        });
        if (confirmed) {
            await appService.deleteIncomingEntry(editingId);
            setIsModalOpen(false);
            appService.showToast('Bejövő utalás törölve!', 'success');
        }
    };

    const handleDeleteColumn = (e, date) => {
        e.preventDefault();
        e.stopPropagation();
        appService.deleteIncomingColumn(date);
    };

    const handleDeleteRow = (e, sender) => {
        e.preventDefault();
        e.stopPropagation();
        appService.deleteIncomingRow(sender);
    };

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <i className="fas fa-arrow-down text-emerald-500"></i> Bejövő utalások
                </h3>
                <button id="btnAddIncoming" onClick={handleAddIncoming}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition shadow-sm">
                    <i className="fas fa-plus-circle"></i> Bejövő tétel
                </button>
            </div>

            <div id="incomingTableContainer" className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-x-auto p-4">
                {(senders.length === 0 || dates.length === 0) ? (
                    <div className="text-center py-12 text-gray-400">
                        <i className="fas fa-inbox text-4xl block mb-3"></i>
                        <p>Még nincs rögzített bejövő utalás</p>
                        <p className="text-sm mt-1">Kattints a "Bejövő tétel" gombra az első rögzítéséhez</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="p-3 text-left font-bold text-gray-600 text-xs uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                                        Kitől
                                    </th>
                                    {dates.map(date => (
                                        <th key={date} className="p-3 text-center font-bold text-gray-600 text-xs uppercase tracking-wider min-w-[100px] group relative" data-date={date}>
                                            {formatDate(date)}
                                            <button className="incoming-delete-col opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 w-4 h-4 bg-red-100 text-red-500 rounded-full text-[8px] hover:bg-red-200 transition"
                                                    data-date={date} title="Oszlop törlése (dátum)" onClick={(e) => handleDeleteColumn(e, date)}>
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </th>
                                    ))}
                                    <th className="p-3 text-center font-bold text-gray-600 text-xs uppercase tracking-wider bg-gray-50">
                                        Összesen
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {senders.map(sender => {
                                    const senderEntries = incomings.filter(e => e.sender === sender);
                                    const total = senderEntries
                                        .filter(e => !e.isStorno)
                                        .reduce((sum, e) => {
                                            const converted = convertAmount(e.amount || 0, e.currency || 'HUF', primaryCurrency, eurRate);
                                            return sum + (converted !== null ? converted : 0);
                                        }, 0);

                                    return (
                                        <tr key={sender} className="border-b border-gray-100 hover:bg-gray-50 transition group">
                                            <td className="p-3 font-medium text-gray-700 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
                                                <div className="flex items-center justify-between">
                                                    <span>
                                                        {sender === 'Munka' && <i className="fas fa-stopwatch text-purple-500 mr-1" title="Időmérő bevétel"></i>}
                                                        {sender}
                                                    </span>
                                                    <button className="incoming-delete-row opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition text-xs px-1"
                                                            data-sender={sender} title="Sor törlése" onClick={(e) => handleDeleteRow(e, sender)}>
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            </td>
                                            {dates.map(date => {
                                                const entry = senderEntries.find(e => e.date === date);
                                                const amount = entry ? entry.amount : '';
                                                const entryId = entry ? entry.id : null;
                                                const isStorno = entry && entry.isStorno;
                                                const entryCurrency = entry?.currency || 'HUF';

                                                let cellClass = 'p-2 text-center incoming-cell cursor-pointer hover:bg-blue-50 transition rounded-lg';
                                                if (amount && isStorno) {
                                                    cellClass += ' bg-red-50/50';
                                                }

                                                return (
                                                    <td key={date} className={cellClass}
                                                         data-sender={sender}
                                                         data-date={date}
                                                         data-entry-id={entryId || ''}
                                                         data-amount={amount}
                                                         onClick={(e) => handleCellClick(e, sender, date, entryId, amount)}>
                                                        {amount ? (
                                                            isStorno ? (
                                                                <span className="line-through text-red-500/70 opacity-60 flex items-center justify-center gap-1" title="Sztornózott bejövő utalás">
                                                                    <i className="fas fa-ban text-[10px]"></i> {formatCurrency(amount, entryCurrency)}
                                                                </span>
                                                            ) : (
                                                                formatCurrency(amount, entryCurrency)
                                                            )
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-3 text-center font-bold text-blue-600 bg-gray-50">
                                                {formatCurrency(total, primaryCurrency)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-gray-100 border-t-2 border-gray-300">
                                    <td className="p-3 font-bold text-gray-700 sticky left-0 bg-gray-100 z-10">
                                        ÖSSZESEN
                                    </td>
                                    {dates.map(date => {
                                        const total = incomings
                                            .filter(e => e.date === date && !e.isStorno)
                                            .reduce((sum, e) => {
                                                const converted = convertAmount(e.amount || 0, e.currency || 'HUF', primaryCurrency, eurRate);
                                                return sum + (converted !== null ? converted : 0);
                                            }, 0);
                                        return (
                                            <td key={date} className="p-3 text-center font-bold text-gray-700">
                                                {total ? formatCurrency(total, primaryCurrency) : '—'}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 text-center font-bold text-blue-700 bg-gray-100">
                                        {formatCurrency(
                                            incomings
                                                .filter(e => !e.isStorno)
                                                .reduce((sum, e) => {
                                                    const converted = convertAmount(e.amount || 0, e.currency || 'HUF', primaryCurrency, eurRate);
                                                    return sum + (converted !== null ? converted : 0);
                                                }, 0),
                                            primaryCurrency
                                        )}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal for creating/editing incoming items */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex justify-between items-center">
                            <h3 className="text-lg font-bold">
                                {editingId ? 'Bejövő Utalás Módosítása' : 'Új Bejövő Utalás'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-white hover:text-gray-200">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Kitől érkezett (Utaló)</label>
                                <select className="w-full px-4 py-3 border border-gray-200 rounded-2xl mb-2 text-sm font-bold text-gray-700 bg-white"
                                    value={modalSender} onChange={e => setModalSender(e.target.value)}>
                                    {senders.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                    <option value="__new__">+ Új utaló partner hozzáadása</option>
                                </select>
                                {(modalSender === '__new__' || senders.length === 0) && (
                                    <input type="text"
                                        placeholder="Add meg az új partner nevét..."
                                        className="w-full px-4 py-3 border border-emerald-300 rounded-2xl text-sm font-semibold"
                                        value={modalNewSender} onChange={e => setModalNewSender(e.target.value)} />
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Összeg</label>
                                    <input type="number"
                                        placeholder="0"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl font-bold font-mono text-sm"
                                        value={modalAmount} onChange={e => setModalAmount(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Deviza</label>
                                    <select className="w-full px-4 py-3 border border-gray-200 rounded-2xl font-bold text-sm bg-white"
                                        value={modalCurrency} onChange={e => setModalCurrency(e.target.value)}>
                                        <option value="HUF">HUF</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Dátum</label>
                                <input type="date"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-2xl font-mono text-sm"
                                    value={modalDate} onChange={e => setModalDate(e.target.value)} />
                            </div>
                            {editingId && (
                                <div className="flex items-center gap-2 pt-2">
                                    <input type="checkbox" id="incomingIsStorno"
                                        checked={modalIsStorno} onChange={e => setModalIsStorno(e.target.checked)}
                                        className="w-4 h-4 text-rose-600 rounded" />
                                    <label htmlFor="incomingIsStorno" className="text-xs font-bold text-rose-700 cursor-pointer">
                                        Sztornó (érvénytelenített utalás)
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="border-t flex bg-gray-50">
                            {editingId && (
                                <button className="py-4 px-4 text-red-600 hover:bg-red-50 border-r text-sm font-bold"
                                    onClick={handleModalDelete}>
                                    <i className="fas fa-trash-alt mr-1"></i> Törlés
                                </button>
                            )}
                            <button className="flex-1 py-4 text-gray-600 hover:bg-gray-100 text-sm font-bold"
                                onClick={() => setIsModalOpen(false)}>Mégse</button>
                            <button className="flex-1 py-4 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-bold"
                                onClick={handleModalSave}>Mentés</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
