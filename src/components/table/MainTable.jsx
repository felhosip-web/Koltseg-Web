import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CategoryIcons } from '../../../js/category-icons.js';

export default function MainTable() {
    const [snapshot, setSnapshot] = useState(null);
    const [loadedMonths, setLoadedMonths] = useState(15);
    const wrapperRef = useRef(null);

    useEffect(() => {
        if (!window.app) return;

        const handleDataUpdate = () => {
            if (window.app && typeof window.app.getAppSnapshot === 'function') {
                setSnapshot(window.app.getAppSnapshot());
            }
        };

        handleDataUpdate();

        let unsubscribe = null;
        if (window.app && typeof window.app.subscribeAppData === 'function') {
             unsubscribe = window.app.subscribeAppData(handleDataUpdate);
        } else {
             window.addEventListener('app-data-updated', handleDataUpdate);
             unsubscribe = () => window.removeEventListener('app-data-updated', handleDataUpdate);
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const handleScroll = useCallback(() => {
        if (!wrapperRef.current || !snapshot) return;
        const wrapper = wrapperRef.current;
        if (wrapper.scrollLeft + wrapper.clientWidth > wrapper.scrollWidth - 400) {
            setLoadedMonths(prev => {
                const max = snapshot.months.length;
                if (prev >= max) return prev;
                return Math.min(prev + 8, max);
            });
        }
    }, [snapshot]);

    if (!snapshot || !snapshot.items || snapshot.items.length === 0 || !snapshot.months || snapshot.months.length === 0) {
        return (
            <div id="mainTableContainer" className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-visible p-0 md:p-2">
                 <div className="p-12 text-center text-gray-400">
                    <div className="text-xl font-bold mb-2">Nincs még adat</div>
                    <div className="mb-4">A táblázat üres — adj hozzá kategóriákat és hónapokat, vagy generálj tesztadatokat.</div>
                    <div className="flex items-center justify-center gap-3">
                        <button id="vtGenerateTestData" className="px-4 py-2 bg-emerald-600 text-white rounded-xl" onClick={async () => {
                            try {
                                if (window.app && typeof window.app.generateTestData === 'function') {
                                    await window.app.generateTestData(30);
                                    await window.app.items.load();
                                    await window.app.months.load();
                                    await window.app.entries.load();
                                    window.dispatchEvent(new Event('app-data-updated'));
                                    window.app.hmiNotif?.showToast('Tesztadatok létrehozva', 'success');
                                }
                            } catch(e) {
                                console.error(e);
                                window.app.hmiNotif?.showToast('Tesztadat generálás sikertelen', 'error');
                            }
                        }}>Generálj tesztadatokat</button>
                    </div>
                </div>
            </div>
        );
    }

    const visibleMonths = snapshot.months.slice(0, loadedMonths);

    return (
        <div id="mainTableContainer" className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-visible p-0 md:p-2">
            <div id="vtWrapper" ref={wrapperRef} onScroll={handleScroll} className="overflow-auto rounded-3xl border border-gray-200 bg-white shadow-sm relative" style={{ maxHeight: '76vh', contain: 'layout paint' }}>
                <table className="w-full border-collapse text-sm" id="vtTable">
                    <thead id="vtThead" className="bg-gray-50 sticky top-0 z-20">
                        <tr>
                            <th className="px-6 py-4 font-black text-gray-700 bg-gray-100 md:sticky md:left-0 z-10 md:z-30 min-w-[100px] w-[1%] whitespace-nowrap text-left">Kategória</th>
                            {visibleMonths.map(m => (
                                <th key={m} className="px-4 py-4 text-center border-l border-gray-200 min-w-[160px] whitespace-nowrap dblclick-month-purge cursor-pointer hover:bg-red-50/80 transition-colors" data-month={m} onDoubleClick={(e) => {
                                    if (window.app?.uiController?.handleMonthDeleteSequence) {
                                        window.app.uiController.handleMonthDeleteSequence(m);
                                    }
                                }}>{m}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody id="vtTbody">
                        {snapshot.items.map(item => (
                            <TableRow key={item.id} item={item} visibleMonths={visibleMonths} entries={snapshot.entries} eurRate={snapshot.eurRate} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const TableRow = React.memo(({ item, visibleMonths, entries, eurRate }) => {
    return (
        <tr className="hover:bg-gray-50/80 transition-colors" style={{ height: '53px' }}>
            <CategoryCell item={item} />
            {visibleMonths.map(month => (
                <DataCell key={`${item.id}_${month}`} itemId={item.id} month={month} entries={entries} eurRate={eurRate} />
            ))}
        </tr>
    );
});

function CategoryCell({ item }) {
    const iconData = CategoryIcons.getIconData(item.name);
    const hasCustomColor = item.color && item.color !== '#dbeafe';
    const bgColor = hasCustomColor ? item.color + '15' : '';
    const borderStyle = hasCustomColor ? `1.5px solid ${item.color}` : '';
    const iconColorStyle = hasCustomColor ? item.color : '';

    return (
        <td className="px-6 py-4 font-bold text-gray-900 bg-gray-50 border-r border-gray-100 md:sticky md:left-0 md:z-10 dblclick-row-purge cursor-pointer hover:bg-red-50 transition-colors min-w-[100px] w-[1%] whitespace-nowrap"
            data-itemid={item.id} data-itemname={item.name}
            onDoubleClick={(e) => {
                if (e.target.closest('button')) return;
                window.app?.uiController?.handleRowDeleteSequence(item.id, item.name);
            }}
        >
            <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all shadow-sm ${bgColor ? '' : iconData.bgClass}`}
                     style={{ backgroundColor: bgColor || undefined, border: borderStyle || undefined }}>
                    <i className={`${iconData.iconClass} text-xs ${bgColor ? '' : iconData.textClass}`} style={{ color: iconColorStyle || undefined }}></i>
                </div>
                <span>{item.name}</span>
            </div>
        </td>
    );
}

function DataCell({ itemId, month, entries, eurRate }) {
    const cellBaseKey = `${itemId}_${month}`;
    const cellEntries = entries.filter(e => {
        if (!e.cellKey) return false;
        return e.cellKey === cellBaseKey || e.cellKey.startsWith(cellBaseKey + '_');
    });

    let huf = 0, eur = 0;
    let hasStorno = false;
    let allStorno = cellEntries.length > 0;
    let stornoHuf = 0, stornoEur = 0;

    cellEntries.forEach(e => {
        if (e.isStorno) {
            hasStorno = true;
            if (e.currency === 'EUR') stornoEur += e.amount;
            else stornoHuf += e.amount;
        } else {
            allStorno = false;
            if (e.currency === 'EUR') eur += e.amount;
            else huf += e.amount;
        }
    });

    let style = {};
    const colorEntry = cellEntries.find(e => e.color && e.color !== 'transparent');
    if (colorEntry) style.backgroundColor = colorEntry.color;

    if (allStorno) {
        style.backgroundColor = 'rgba(254, 242, 242, 0.6)';
    }

    const rate = eurRate || 400;
    const convertedHuf = Math.round(eur * rate);
    const convertedStornoHuf = Math.round(stornoEur * rate);

    let content = null;
    if (huf + eur === 0) {
        if (allStorno) {
            content = (
                <div className="text-xs font-mono leading-tight text-center text-red-500/70 opacity-65 flex flex-col items-center justify-center line-through decoration-red-500 decoration-1">
                    <div className="flex items-center gap-1 mb-0.5 text-[9px] font-bold bg-red-100 text-red-600 px-1 rounded">
                        <i className="fas fa-ban"></i> SZTORNÓ
                    </div>
                    {stornoHuf > 0 && <div>{stornoHuf.toLocaleString('hu-HU')} Ft</div>}
                    {stornoEur > 0 && (
                        <div>
                            {stornoEur} EUR
                            <div className="text-[9px] font-normal">({convertedStornoHuf.toLocaleString('hu-HU')} Ft)</div>
                        </div>
                    )}
                </div>
            );
        } else {
            content = <span className="text-gray-300 text-xl font-light">-</span>;
        }
    } else {
        content = (
            <div className="text-xs font-mono leading-tight text-center relative">
                {huf > 0 && <div>{huf.toLocaleString('hu-HU')} Ft</div>}
                {eur > 0 && (
                    <div className="text-emerald-700">
                        {eur} EUR
                        <div className="text-[10px] text-gray-500 font-normal">({convertedHuf.toLocaleString('hu-HU')} Ft)</div>
                    </div>
                )}
                {hasStorno && (
                    <div className="absolute -top-1 -right-1 text-red-500 text-[10px] bg-red-50 rounded-full w-4 h-4 flex items-center justify-center border border-red-100 shadow-sm" title="Részben sztornózott tételt tartalmaz!">
                        <i className="fas fa-ban"></i>
                    </div>
                )}
            </div>
        );
    }

    return (
        <td className="cell-interactive px-4 py-4 text-center border-l border-gray-100 cursor-pointer w-40 min-w-[160px] max-w-[160px]"
            data-cellbasekey={cellBaseKey}
            style={style}
            onClick={(e) => {
                if (window.app?.uiController?.handleCellClick) {
                    window.app.uiController.handleCellClick(e.currentTarget);
                }
            }}
        >
            {content}
        </td>
    );
}
