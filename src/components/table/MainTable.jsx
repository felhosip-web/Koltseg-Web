import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CategoryIcons } from '../../../js/category-icons.js';
import { parseCellKey, isValidMonth } from '../../../js/utils/cell-key-utils.js';
import { useAppStore } from '../../store/useAppStore.js';
import { appService } from '../../services/appService.js';
import { convertAmount, formatCurrency, getSecondaryCurrency } from '../../utils/currency-utils.js';

export default function MainTable() {
    const snapshot = useAppStore();
    const generateTestData = useAppStore(state => state.generateTestData);
    const [loadedMonths, setLoadedMonths] = useState(15);
    const wrapperRef = useRef(null);

    const entries = snapshot?.entries || [];
    let items = snapshot?.items || [];
    const rawMonths = snapshot?.months || [];

    // Ha a hónapok tömb üres, de léteznek bejegyzések, kanonikus parseCellKey segítségével levezetjük a hónapokat (csak érvényes naptári hónap: YYYY-MM 01-12)
    const months = React.useMemo(() => {
        if (rawMonths && rawMonths.length > 0) {
            return rawMonths.filter(m => isValidMonth(m));
        }
        if (entries.length > 0) {
            const derived = Array.from(new Set(
                entries.map(e => parseCellKey(e).month).filter(m => isValidMonth(m))
            )).sort();
            if (derived.length > 0) return derived;
        }
        return [];
    }, [rawMonths, entries]);

    const handleScroll = useCallback(() => {
        if (!wrapperRef.current || !snapshot) return;
        const wrapper = wrapperRef.current;
        if (wrapper.scrollLeft + wrapper.clientWidth > wrapper.scrollWidth - 400) {
            setLoadedMonths(prev => {
                const max = months.length;
                if (prev >= max) return prev;
                return Math.min(prev + 8, max);
            });
        }
    }, [snapshot, months]);

    // Ha a wrapper nem görgethető (nem lép fel overflow), de több hónap létezik mint a jelenleg betöltött, lépésenként felfedjük a maradék hónapokat
    useEffect(() => {
        if (!wrapperRef.current || months.length <= loadedMonths) return;
        const wrapper = wrapperRef.current;
        if (wrapper.clientWidth > 0 && wrapper.scrollWidth <= wrapper.clientWidth) {
            setLoadedMonths(prev => {
                if (prev >= months.length) return prev;
                return Math.min(prev + 8, months.length);
            });
        }
    }, [months.length, loadedMonths]);

    const visibleMonths = React.useMemo(() => {
        return months.slice(0, loadedMonths);
    }, [months, loadedMonths]);

    // Build an indexed lookup Map keyed by itemId + month, recomputed only when entries changes
    const cellEntriesMap = React.useMemo(() => {
        const map = new Map();
        entries.forEach(e => {
            const parsed = parseCellKey(e);
            if (parsed.itemId && parsed.month) {
                const key = `${parsed.itemId}_${parsed.month}`;
                let list = map.get(key);
                if (!list) {
                    list = [];
                    map.set(key, list);
                }
                list.push(e);
            }
        });
        return map;
    }, [entries]);

    // Ha a kategóriák tömb üres, de léteznek bejegyzések, kanonikus parseCellKey segítségével szintetikus átmeneti nézetet képezünk
    if ((!items || items.length === 0) && entries.length > 0) {
        const derivedItemMap = new Map();
        entries.forEach(e => {
            const parsed = parseCellKey(e);
            if (parsed.itemId && !derivedItemMap.has(parsed.itemId)) {
                derivedItemMap.set(parsed.itemId, {
                    id: parsed.itemId,
                    name: parsed.itemId,
                    color: '#dbeafe',
                    _isSynthetic: true
                });
            }
        });
        if (derivedItemMap.size > 0) {
            items = Array.from(derivedItemMap.values());
        }
    }

    const hasData = items.length > 0 && months.length > 0;

    if (snapshot?.isBootError) {
        return (
            <div id="mainTableContainer" className="bg-white rounded-2xl shadow-xl border border-red-200 overflow-visible p-8 text-center">
                <div className="text-xl font-bold text-red-600 mb-2">⚠️ Adatbetöltési hiba</div>
                <div className="text-gray-500 mb-4">Nem sikerült betölteni a helyi adatbázis rekordjait. Kérjük, frissítsd az oldalt!</div>
            </div>
        );
    }

    if (!snapshot || !hasData) {
        return (
            <div id="mainTableContainer" className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-visible p-0 md:p-2">
                 <div className="p-12 text-center text-gray-400">
                    <div className="text-xl font-bold mb-2">Nincs még adat</div>
                    <div className="mb-4">A táblázat üres — adj hozzá kategóriákat és hónapokat, vagy generálj tesztadatokat.</div>
                    <div className="flex items-center justify-center gap-3">
                        <button id="vtGenerateTestData" className="px-4 py-2 bg-emerald-600 text-white rounded-xl" onClick={async () => {
                            await generateTestData(30);
                        }}>Generálj tesztadatokat</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="mainTableContainer" className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-visible p-0 md:p-2">
            <div id="vtWrapper" ref={wrapperRef} onScroll={handleScroll} className="overflow-auto rounded-3xl border border-gray-200 bg-white shadow-sm relative" style={{ maxHeight: '76vh', contain: 'layout paint' }}>
                <table className="w-full border-collapse text-sm" id="vtTable">
                    <thead id="vtThead" className="bg-gray-50 sticky top-0 z-20">
                        <tr>
                            <th className="px-6 py-4 font-black text-gray-700 bg-gray-100 md:sticky md:left-0 z-10 md:z-30 min-w-[100px] w-[1%] whitespace-nowrap text-left">Kategória</th>
                            {visibleMonths.map(m => (
                                <th key={m} className="px-4 py-4 text-center border-l border-gray-200 min-w-[160px] whitespace-nowrap dblclick-month-purge cursor-pointer hover:bg-red-50/80 transition-colors" data-month={m} onDoubleClick={(e) => {
                                    appService.deleteMonthSequence(m);
                                }}>{m}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody id="vtTbody">
                        {items.map(item => (
                            <TableRow key={item.id} item={item} visibleMonths={visibleMonths} cellEntriesMap={cellEntriesMap} eurRate={snapshot.eurRate} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const TableRow = React.memo(({ item, visibleMonths, cellEntriesMap, eurRate }) => {
    return (
        <tr className="hover:bg-gray-50/80 transition-colors" style={{ height: '53px' }}>
            <CategoryCell item={item} />
            {visibleMonths.map(month => (
                <DataCell key={`${item.id}_${month}`} itemId={item.id} month={month} cellEntries={cellEntriesMap.get(`${item.id}_${month}`) || []} eurRate={eurRate} />
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
            onDoubleClick={async (e) => {
                if (e.target.closest('button')) return;
                if (item._isSynthetic) {
                    appService.showToast('Ez egy levezetett ideiglenes kategória. Hozz létre valódi kategóriát a szerkesztéshez.', 'info');
                    return;
                }
                const action = await appService.showCategoryActionsModal(item.name);
                if (action === 'rename') {
                    document.dispatchEvent(new CustomEvent('hmi-input-open', { detail: { type: 'rename', itemId: item.id, currentName: item.name } }));
                } else if (action === 'delete' || action === 'not_available') {
                    appService.deleteRowSequence(item.id, item.name);
                }
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

function DataCell({ itemId, month, cellEntries, eurRate }) {
    const cellBaseKey = `${itemId}_${month}`;
    const primaryCurrency = useAppStore(state => state.primaryCurrency || 'HUF');
    const secondaryCurrency = getSecondaryCurrency(primaryCurrency);

    let primaryTotal = 0;
    let secondaryTotal = 0;
    let hasStorno = false;
    let allStorno = cellEntries.length > 0;
    let stornoPrimary = 0;
    let stornoSecondary = 0;
    let hasEntries = cellEntries.length > 0;

    const rate = eurRate || 400;

    cellEntries.forEach(e => {
        const entryCurrency = e.currency || 'HUF';
        const pVal = convertAmount(e.amount, entryCurrency, primaryCurrency, rate);
        const sVal = convertAmount(e.amount, entryCurrency, secondaryCurrency, rate);

        if (e.isStorno) {
            hasStorno = true;
            stornoPrimary += pVal;
            stornoSecondary += sVal;
        } else {
            allStorno = false;
            primaryTotal += pVal;
            secondaryTotal += sVal;
        }
    });

    let style = {};
    const colorEntry = cellEntries.find(e => e.color && e.color !== 'transparent');
    if (colorEntry) style.backgroundColor = colorEntry.color;

    if (allStorno) {
        style.backgroundColor = 'rgba(254, 242, 242, 0.6)';
    }

    let content = null;
    if (!hasEntries || (!hasStorno && primaryTotal === 0)) {
        content = <span className="text-gray-300 text-xl font-light">-</span>;
    } else if (allStorno) {
        content = (
            <div className="text-xs font-mono leading-tight text-center text-red-500/70 opacity-65 flex flex-col items-center justify-center line-through decoration-red-500 decoration-1">
                <div className="flex items-center gap-1 mb-0.5 text-[9px] font-bold bg-red-100 text-red-600 px-1 rounded">
                    <i className="fas fa-ban"></i> SZTORNÓ
                </div>
                <div>{formatCurrency(stornoPrimary, primaryCurrency)}</div>
                <div className="text-[9px] font-normal">({formatCurrency(stornoSecondary, secondaryCurrency)})</div>
            </div>
        );
    } else {
        content = (
            <div className="text-xs font-mono leading-tight text-center relative">
                <div className="font-bold text-gray-800">
                    {formatCurrency(primaryTotal, primaryCurrency)}
                </div>
                <div className="text-[10px] text-gray-500 font-normal">
                    (≈ {formatCurrency(secondaryTotal, secondaryCurrency)})
                </div>
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
            data-itemid={itemId}
            data-month={month}
            style={style}
            onClick={(e) => {
                appService.handleCellClick(e.currentTarget);
            }}
        >
            {content}
        </td>
    );
}
