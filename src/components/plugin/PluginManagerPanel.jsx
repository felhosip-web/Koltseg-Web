import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { appService } from '../../services/appService.js';

/**
 * Custom hook to subscribe to PluginRegistry reactive lifecycle updates.
 */
function usePluginRegistryTick() {
    const subscribe = useCallback((onStoreChange) => {
        return appService.subscribePluginRegistry(onStoreChange);
    }, []);

    const getSnapshot = useCallback(() => {
        const mgr = appService.getPluginManagerService();
        return mgr?.registry ? mgr.registry.list().map(r => `${r.manifest.id}:${r.state}`).join(',') : '';
    }, []);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Plugin Manager UI Component (PLG3-P2)
 * Provides lifecycle toggling, metadata display, storage metrics inspection, and storage purging.
 * @returns {JSX.Element}
 */
export default function PluginManagerPanel() {
    const registryTick = usePluginRegistryTick();
    const [plugins, setPlugins] = useState([]);
    const [storageMetricsMap, setStorageMetricsMap] = useState({});
    const [loadingMetrics, setLoadingMetrics] = useState({});
    const [processingIds, setProcessingIds] = useState(new Set());
    const [purgeConfirmPlugin, setPurgeConfirmPlugin] = useState(null);
    const [purgeResult, setPurgeResult] = useState(null);
    const [actionError, setActionError] = useState(null);

    // Refresh plugin summary list and storage metrics
    const refreshPlugins = useCallback(async () => {
        const summary = appService.listInstalledPluginsSummary();
        setPlugins(summary);

        const metricsTemp = {};
        const loadingTemp = {};

        for (const p of summary) {
            loadingTemp[p.id] = true;
        }
        setLoadingMetrics(loadingTemp);

        for (const p of summary) {
            try {
                const metrics = await appService.getPluginStorageMetrics(p.id);
                metricsTemp[p.id] = metrics;
            } catch (err) {
                metricsTemp[p.id] = { totalRecords: 0, collections: {}, isLoaded: false, error: err?.message };
            }
            loadingTemp[p.id] = false;
        }

        setStorageMetricsMap(metricsTemp);
        setLoadingMetrics({ ...loadingTemp });
    }, []);

    useEffect(() => {
        refreshPlugins();
    }, [registryTick, refreshPlugins]);

    // Toggle plugin enabled/disabled state
    const handleToggleState = async (pluginId, currentState) => {
        if (processingIds.has(pluginId)) return;

        setActionError(null);
        setProcessingIds(prev => new Set(prev).add(pluginId));

        const targetEnabled = currentState === 'disposed' || currentState === 'registered';

        try {
            const success = await appService.togglePluginState(pluginId, targetEnabled);

            if (!success) {
                const errMsg = `Sikertelen állapotváltás a(z) "${pluginId}" bővítménynél.`;
                setActionError(errMsg);
                appService.showToast(errMsg, 'error');
            } else {
                appService.showToast(`Bővítmény (${pluginId}) ${targetEnabled ? 'bekapcsolva' : 'kikapcsolva'}!`, targetEnabled ? 'success' : 'info');
            }
        } catch (err) {
            const errMsg = `Hiba az állapotváltás során: ${err?.message || String(err)}`;
            setActionError(errMsg);
            appService.showToast(errMsg, 'error');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(pluginId);
                return next;
            });
            await refreshPlugins();
        }
    };

    // Open purge confirm dialog
    const handleOpenPurgeConfirm = (plugin) => {
        setPurgeResult(null);
        setActionError(null);
        setPurgeConfirmPlugin(plugin);
    };

    // Confirm and execute storage purge
    const handleExecutePurge = async () => {
        if (!purgeConfirmPlugin || processingIds.has(purgeConfirmPlugin.id)) return;

        const pluginId = purgeConfirmPlugin.id;
        setProcessingIds(prev => new Set(prev).add(pluginId));
        setActionError(null);

        try {
            const outcome = await appService.purgePluginStorageData(pluginId);
            setPurgeResult(outcome);

            if (outcome.success) {
                appService.showToast(`Bővítmény (${pluginId}) adatai törölve (${outcome.localPurgedCount} rekord).`, 'success');
            } else {
                const errMsg = `Adattörlés részben vagy teljesen sikertelen (${outcome.failedCount} hibás rekord).`;
                setActionError(errMsg);
                appService.showToast(errMsg, 'error');
            }
        } catch (err) {
            const errMsg = `Törlési hiba: ${err?.message || String(err)}`;
            setActionError(errMsg);
            appService.showToast(errMsg, 'error');
            setPurgeResult({
                success: false,
                attemptedCount: 0,
                localPurgedCount: 0,
                failedCount: 1,
                tombstoneStatus: 'not_applicable',
                syncStatus: 'not_applicable',
                errors: [errMsg]
            });
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(pluginId);
                return next;
            });
            await refreshPlugins();
        }
    };

    const closePurgeModal = () => {
        setPurgeConfirmPlugin(null);
        setPurgeResult(null);
    };

    return (
        <div className="space-y-6">
            {/* Header / Overview Title */}
            <div className="flex flex-wrap items-center justify-between bg-purple-50/70 p-4 rounded-2xl border border-purple-200 gap-3">
                <div>
                    <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-2">
                        <i className="fas fa-plug text-purple-600 text-sm"></i> Bővítmény Menedzser (PLG3 Plugin Architecture)
                    </h4>
                    <p className="text-xs text-purple-700 mt-1">
                        Kezeld a telepített modulokat, futtatási állapotokat, jogosultságokat és elszeparált adattárolókat.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refreshPlugins}
                    className="px-3.5 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    aria-label="Bővítmény lista frissítése"
                >
                    <i className="fas fa-sync-alt"></i> Lista Frissítése
                </button>
            </div>

            {/* Action / Global Error Alert */}
            {actionError && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs text-red-700 flex items-center gap-2" role="alert">
                    <i className="fas fa-exclamation-triangle text-red-500 shrink-0"></i>
                    <span>{actionError}</span>
                </div>
            )}

            {/* Plugin Cards List */}
            {plugins.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400">
                    <i className="fas fa-puzzle-piece text-4xl mb-3 text-slate-300"></i>
                    <p className="text-xs font-semibold">Nincsenek telepített vagy regisztrált bővítmények.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {plugins.map((plugin) => {
                        const isProcessing = processingIds.has(plugin.id);
                        const metrics = storageMetricsMap[plugin.id];
                        const isLoadingMetric = loadingMetrics[plugin.id];
                        const isActive = plugin.state === 'active' || plugin.state === 'initialized';
                        const isDisposed = plugin.state === 'disposed';

                        let stateBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                        let stateLabel = 'Regisztrált';
                        if (plugin.state === 'active') {
                            stateBadgeClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                            stateLabel = 'Aktív';
                        } else if (plugin.state === 'initialized') {
                            stateBadgeClass = 'bg-blue-100 text-blue-700 border-blue-200';
                            stateLabel = 'Inicializálva';
                        } else if (plugin.state === 'disposed') {
                            stateBadgeClass = 'bg-amber-100 text-amber-700 border-amber-200';
                            stateLabel = 'Kikapcsolva (Disposed)';
                        }

                        return (
                            <div
                                key={plugin.id}
                                className={`p-5 rounded-2xl border ${
                                    isDisposed ? 'bg-slate-50/80 border-slate-200' : 'bg-white border-purple-100 shadow-sm'
                                } transition-all space-y-4`}
                                data-plugin-card={plugin.id}
                            >
                                {/* Plugin Header Info */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl text-lg shrink-0 mt-0.5">
                                            <i className={plugin.uiIcon || 'fas fa-plug'}></i>
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h5 className="text-sm font-extrabold text-slate-800">{plugin.name}</h5>
                                                <span className="text-[10px] font-mono text-slate-400">({plugin.id})</span>
                                                <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-100">
                                                    v{plugin.version}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                {plugin.description || 'Nincs megadva leírás.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Toggle Switch */}
                                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border ${stateBadgeClass}`}>
                                            {stateLabel}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleState(plugin.id, plugin.state)}
                                            disabled={isProcessing}
                                            aria-label={`${plugin.name} bővítmény ${isActive ? 'kikapcsolása' : 'bekapcsolása'}`}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm ${
                                                isActive
                                                    ? 'bg-amber-500 hover:bg-amber-600 text-white disabled:bg-amber-300'
                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-300'
                                            }`}
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <i className="fas fa-spinner animate-spin"></i>
                                                    <span>Folyamatban...</span>
                                                </>
                                            ) : isActive ? (
                                                <>
                                                    <i className="fas fa-power-off"></i>
                                                    <span>Kikapcsolás</span>
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-play"></i>
                                                    <span>Bekapcsolás</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Declarative Permissions & UI Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                            Deklarált Jogosultságok:
                                        </span>
                                        {plugin.permissions && plugin.permissions.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {plugin.permissions.map((perm) => (
                                                    <span
                                                        key={perm}
                                                        className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200"
                                                    >
                                                        <i className="fas fa-shield-alt mr-1 text-purple-500"></i>
                                                        {perm}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">Nincsenek különleges jogosultságok deklarálva.</span>
                                        )}
                                    </div>

                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                            Felületi Integráció (UI):
                                        </span>
                                        {plugin.hasUI ? (
                                            <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                                                <i className="fas fa-desktop text-emerald-500"></i>
                                                Interaktív UI komponens elérhető ({plugin.uiTitle || plugin.name})
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 italic flex items-center gap-1.5">
                                                <i className="fas fa-cogs text-slate-400"></i>
                                                Háttérbeli / UI nélküli bővítmény
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Plugin Error Presentation */}
                                {plugin.error && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-1">
                                        <div className="font-bold flex items-center gap-1.5 text-red-800">
                                            <i className="fas fa-exclamation-circle text-red-600"></i>
                                            <span>Bővítmény hiba ({plugin.error.name || 'Hiba'}):</span>
                                        </div>
                                        <p className="font-mono text-[11px] bg-white/70 p-2 rounded-lg border border-red-100 leading-normal break-words">
                                            {plugin.error.message || String(plugin.error)}
                                        </p>
                                    </div>
                                )}

                                {/* Plugin Storage Information & Purge Option */}
                                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                            <i className="fas fa-database text-purple-500"></i> Ismertség és Tárhely Statisztika:
                                        </span>

                                        {isLoadingMetric ? (
                                            <span className="text-slate-400 italic flex items-center gap-1.5">
                                                <i className="fas fa-spinner animate-spin"></i> Tárhely adatok lekérdezése...
                                            </span>
                                        ) : metrics && metrics.isLoaded ? (
                                            <div className="space-y-1">
                                                <div className="font-semibold text-slate-700 flex items-center gap-2">
                                                    <span>Összes rekord: <strong>{metrics.totalRecords} db</strong></span>
                                                    {metrics.totalRecords === 0 && (
                                                        <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-normal">
                                                            Üres tároló
                                                        </span>
                                                    )}
                                                </div>
                                                {metrics.collections && Object.keys(metrics.collections).length > 0 && (
                                                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 font-mono pt-1">
                                                        {Object.entries(metrics.collections).map(([col, count]) => (
                                                            <span key={col} className="bg-white px-2 py-0.5 rounded border border-slate-200">
                                                                {col}: <strong>{count}</strong>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-amber-700 font-medium flex items-center gap-1.5">
                                                <i className="fas fa-exclamation-circle text-amber-500"></i>
                                                A tárhely nem érhető el vagy nem lett betöltve (isLoaded: false).
                                            </span>
                                        )}
                                    </div>

                                    {/* Purge Storage Data Button */}
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPurgeConfirm(plugin)}
                                        disabled={isProcessing}
                                        aria-label={`${plugin.name} adatok törlése`}
                                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 self-start sm:self-center disabled:opacity-50"
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                        <span>Adatok Törlése (Purge)</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Purge Confirmation & Outcome Modal */}
            {purgeConfirmPlugin && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4 modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="purgeModalTitle"
                >
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                            <div className="w-10 h-10 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center text-lg shrink-0">
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <div>
                                <h4 id="purgeModalTitle" className="text-sm font-extrabold text-slate-800">
                                    Adatok Végleges Törlése
                                </h4>
                                <p className="text-xs text-slate-500">Költseg-Web Bővítmény Tárhely Purge</p>
                            </div>
                        </div>

                        {!purgeResult ? (
                            <>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    Biztosan törölni szeretnéd a(z) <strong>"{purgeConfirmPlugin.name}"</strong> ({purgeConfirmPlugin.id}) összes elszeparált adatrekordját az IndexedDB és Cloud Sync tárhelyekről?
                                </p>
                                <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">
                                    ⚠️ Ez a művelet nem vonható vissza!
                                </p>

                                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={closePurgeModal}
                                        disabled={processingIds.has(purgeConfirmPlugin.id)}
                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                                    >
                                        Mégse
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExecutePurge}
                                        disabled={processingIds.has(purgeConfirmPlugin.id)}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow"
                                    >
                                        {processingIds.has(purgeConfirmPlugin.id) ? (
                                            <>
                                                <i className="fas fa-spinner animate-spin"></i>
                                                <span>Törlés folyamatban...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-trash-alt"></i>
                                                <span>Végleges Purge Törlés</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Purge Outcome DTO Presentation */
                            <div className="space-y-3">
                                <div
                                    className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                                        purgeResult.success
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                            : 'bg-red-50 border-red-200 text-red-900'
                                    }`}
                                >
                                    <div className="font-extrabold flex items-center gap-2">
                                        <i
                                            className={`fas ${
                                                purgeResult.success ? 'fa-check-circle text-emerald-600' : 'fa-times-circle text-red-600'
                                            } text-base`}
                                        ></i>
                                        <span>
                                            {purgeResult.success
                                                ? 'Adattörlés Sikeresen Befejeződött!'
                                                : 'Adattörlés Részben vagy Teljesen Sikertelen!'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                                        <div className="bg-white/80 p-2 rounded-xl border border-slate-200">
                                            Próbált: <strong>{purgeResult.attemptedCount}</strong>
                                        </div>
                                        <div className="bg-white/80 p-2 rounded-xl border border-slate-200">
                                            Törölve: <strong>{purgeResult.localPurgedCount}</strong>
                                        </div>
                                        <div className="bg-white/80 p-2 rounded-xl border border-slate-200">
                                            Hibás: <strong>{purgeResult.failedCount}</strong>
                                        </div>
                                        <div className="bg-white/80 p-2 rounded-xl border border-slate-200">
                                            Sync: <strong>{purgeResult.syncStatus}</strong>
                                        </div>
                                    </div>

                                    {purgeResult.errors && purgeResult.errors.length > 0 && (
                                        <div className="pt-2 text-[10px] text-red-700 space-y-1">
                                            <span className="font-bold block">Részletes hibák:</span>
                                            <ul className="list-disc list-inside space-y-0.5 font-mono">
                                                {purgeResult.errors.map((err, idx) => (
                                                    <li key={idx}>{err}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={closePurgeModal}
                                        className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow"
                                    >
                                        Bezárás
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
