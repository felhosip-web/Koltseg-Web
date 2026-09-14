import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, ArrowDownUp, Save, CheckCircle, XCircle, AlertTriangle, Database, Cloud } from 'lucide-react';

export const SyncDiffViewer = ({ diffData, onConfirm, onCancel, mode }) => {
    const [selectedTable, setSelectedTable] = useState('');
    const [viewMode, setViewMode] = useState('all'); // 'all', 'localOnly', 'cloudOnly', 'modified'
    const [tables, setTables] = useState([]);

    useEffect(() => {
        if (diffData) {
            const tbls = Object.keys(diffData).filter(t => diffData[t] && (diffData[t].local?.length > 0 || diffData[t].cloud?.length > 0 || diffData[t].diffs?.length > 0));
            setTables(tbls);
            if (tbls.length > 0 && !selectedTable) {
                setSelectedTable(tbls[0]);
            }
        }
    }, [diffData]);

    if (!diffData || tables.length === 0) {
        return (
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-800 mb-2">Nincs szinkronizálandó eltérés</h3>
                <p className="text-gray-500 text-sm">A helyi és a felhő adatok megegyeznek.</p>
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition"
                    >
                        Vissza
                    </button>
                </div>
            </div>
        );
    }

    const currentDiff = diffData[selectedTable] || { local: [], cloud: [], diffs: [] };

    const stats = {
        localOnly: currentDiff.diffs?.filter(d => d.type === 'local_only').length || 0,
        cloudOnly: currentDiff.diffs?.filter(d => d.type === 'cloud_only').length || 0,
        modified: currentDiff.diffs?.filter(d => d.type === 'modified').length || 0,
        total: currentDiff.diffs?.length || 0
    };

    const getFilteredDiffs = () => {
        if (!currentDiff.diffs) return [];
        if (viewMode === 'all') return currentDiff.diffs;
        if (viewMode === 'localOnly') return currentDiff.diffs.filter(d => d.type === 'local_only');
        if (viewMode === 'cloudOnly') return currentDiff.diffs.filter(d => d.type === 'cloud_only');
        if (viewMode === 'modified') return currentDiff.diffs.filter(d => d.type === 'modified');
        return currentDiff.diffs;
    };

    const renderActionIcon = (type, mode) => {
        if (mode === 'push') {
            if (type === 'local_only') return <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold border border-emerald-200 flex items-center gap-1"><ArrowRight className="w-3 h-3"/> FELTÖLTÉS</span>;
            if (type === 'cloud_only') return <span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded font-bold border border-rose-200 flex items-center gap-1"><XCircle className="w-3 h-3"/> FELHŐBŐL TÖRLÉS</span>;
            if (type === 'modified') return <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold border border-amber-200 flex items-center gap-1"><Save className="w-3 h-3"/> FELÜLÍRÁS FELHŐBEN</span>;
        } else if (mode === 'pull') {
            if (type === 'cloud_only') return <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold border border-emerald-200 flex items-center gap-1"><ArrowLeft className="w-3 h-3"/> LETÖLTÉS</span>;
            if (type === 'local_only') return <span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded font-bold border border-rose-200 flex items-center gap-1"><XCircle className="w-3 h-3"/> HELYI TÖRLÉS</span>;
            if (type === 'modified') return <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold border border-amber-200 flex items-center gap-1"><Save className="w-3 h-3"/> HELYI FELÜLÍRÁS</span>;
        }
        return <span className="text-xs text-gray-500 font-mono">{type}</span>;
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden">
            {/* Header / Table selector */}
            <div className="bg-gray-50 border-b border-gray-200 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto">
                    {tables.map(table => (
                        <button
                            key={table}
                            onClick={() => setSelectedTable(table)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${selectedTable === table ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                        >
                            {table}
                            <span className="ml-1 opacity-75">
                                ({diffData[table]?.diffs?.length || 0})
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 text-xs font-medium">
                    <button onClick={() => setViewMode('all')} className={`px-2 py-1 rounded ${viewMode === 'all' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Összes ({stats.total})</button>
                    <button onClick={() => setViewMode('localOnly')} className={`px-2 py-1 rounded ${viewMode === 'localOnly' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Csak Helyi ({stats.localOnly})</button>
                    <button onClick={() => setViewMode('cloudOnly')} className={`px-2 py-1 rounded ${viewMode === 'cloudOnly' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>Csak Felhő ({stats.cloudOnly})</button>
                    <button onClick={() => setViewMode('modified')} className={`px-2 py-1 rounded ${viewMode === 'modified' ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:text-gray-700'}`}>Módosult ({stats.modified})</button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-0 bg-gray-50/50 min-h-[300px] max-h-[500px]">
                {getFilteredDiffs().length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
                        <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">Nincs megjeleníthető eltérés ebben a nézetben.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-100 text-gray-700 sticky top-0 text-xs uppercase font-bold shadow-sm z-10">
                            <tr>
                                <th className="px-4 py-2 border-b border-gray-200 w-1/4"><div className="flex items-center gap-1"><Database className="w-3 h-3"/> Helyi</div></th>
                                <th className="px-4 py-2 border-b border-gray-200 text-center w-1/4">Művelet ({mode.toUpperCase()})</th>
                                <th className="px-4 py-2 border-b border-gray-200 w-1/4"><div className="flex items-center gap-1"><Cloud className="w-3 h-3"/> Felhő</div></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {getFilteredDiffs().map((diff, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition">
                                    <td className="px-4 py-3 align-top font-mono text-[10px] break-all bg-white">
                                        {diff.local ? (
                                            <div className="text-gray-700">
                                                {JSON.stringify(diff.local, null, 2)}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 italic">-- Nincs --</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-middle text-center bg-gray-50/50">
                                        {renderActionIcon(diff.type, mode)}
                                    </td>
                                    <td className="px-4 py-3 align-top font-mono text-[10px] break-all bg-white">
                                        {diff.cloud ? (
                                            <div className="text-gray-700">
                                                {JSON.stringify(diff.cloud, null, 2)}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 italic">-- Nincs --</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 p-4 flex items-center justify-between">
                <div className="text-xs text-gray-500 font-medium">
                    <AlertTriangle className="w-4 h-4 inline text-amber-500 mr-1" />
                    Kérjük, ellenőrizd az eltéréseket a művelet végrehajtása előtt.
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                    >
                        Mégse
                    </button>
                    <button
                        onClick={() => onConfirm(mode)}
                        className={`px-5 py-2 text-sm font-bold text-white rounded-lg transition shadow flex items-center gap-2 ${mode === 'push' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {mode === 'push' ? <ArrowRight className="w-4 h-4"/> : <ArrowLeft className="w-4 h-4" />}
                        {mode === 'push' ? 'Feltöltés Végrehajtása' : 'Letöltés Végrehajtása'}
                    </button>
                </div>
            </div>
        </div>
    );
};
