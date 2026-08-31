import React, { useState, useEffect } from 'react';

export default function IncomingTab() {
    const [incomings, setIncomings] = useState([]);
    const [senders, setSenders] = useState([]);

    useEffect(() => {
        const fetchIncomings = () => {
            if (window.app && window.app.incomingManager) {
                setIncomings([...(window.app.incomingManager.incomings || [])]);
                setSenders([...(window.app.incomingManager.getSenders?.() || [])]);
            }
        };
        fetchIncomings();

        const hasAppDataSubscription = window.app && typeof window.app.subscribeAppData === 'function';
        let listener = null;
        if (hasAppDataSubscription) {
            listener = window.app.subscribeAppData((data) => {
                if (data.incomings) {
                    setIncomings([...data.incomings]);
                }
                if (window.app.incomingManager) {
                     setSenders([...(window.app.incomingManager.getSenders?.() || [])]);
                }
            });
        }

        const interval = hasAppDataSubscription ? null : setInterval(fetchIncomings, 1000);

        return () => {
            if (listener && window.app && typeof window.app.unsubscribeAppData === 'function') {
                window.app.unsubscribeAppData(listener);
            }
            if (interval) {
                clearInterval(interval);
            }
        };
    }, []);

    const dates = [...new Set(incomings.map(e => e.date))].sort();

    const formatDate = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const handleAddIncoming = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.app?.incomingRenderer?.addNewEntry?.();
    };

    const handleCellClick = (e, sender, date, entryId, amount) => {
        e.preventDefault();
        e.stopPropagation();
        const fakeElement = {
            dataset: {
                sender: sender,
                date: date,
                entryId: entryId || '',
                amount: amount || ''
            }
        };
        window.app?.incomingRenderer?._handleCellClick?.(fakeElement);
    };

    const handleDeleteColumn = (e, date) => {
        e.preventDefault();
        e.stopPropagation();
        window.app?.incomingRenderer?.deleteColumn?.(date);
    };

    const handleDeleteRow = (e, sender) => {
        e.preventDefault();
        e.stopPropagation();
        window.app?.incomingRenderer?.deleteRow?.(sender);
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
                                    const total = senderEntries.filter(e => !e.isStorno).reduce((sum, e) => sum + e.amount, 0);

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
                                                                    <i className="fas fa-ban text-[10px]"></i> {amount.toLocaleString('hu-HU')} Ft
                                                                </span>
                                                            ) : (
                                                                `${amount.toLocaleString('hu-HU')} Ft`
                                                            )
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-3 text-center font-bold text-blue-600 bg-gray-50">
                                                {total.toLocaleString('hu-HU')} Ft
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-gray-100 border-t-2 border-gray-300">
                                    <td className="p-3 font-bold text-gray-700 sticky left-0 bg-gray-100 z-10">
                                        ÖSSZESEN
                                    </td>
                                    {dates.map(date => {
                                        const total = incomings.filter(e => e.date === date && !e.isStorno).reduce((sum, e) => sum + e.amount, 0);
                                        return (
                                            <td key={date} className="p-3 text-center font-bold text-gray-700">
                                                {total ? total.toLocaleString('hu-HU') + ' Ft' : '—'}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 text-center font-bold text-blue-700 bg-gray-100">
                                        {incomings.filter(e => !e.isStorno).reduce((sum, e) => sum + e.amount, 0).toLocaleString('hu-HU')} Ft
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
