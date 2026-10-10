import React, { useState, useEffect, useRef } from 'react';
import { appService } from '../../services/appService.js';
import { PluginErrorBoundary } from './PluginErrorBoundary.jsx';
import { createPluginContext } from '../../services/plugin/PluginCapabilityFactory.js';

/**
 * React Plugin Host Component (PLG2)
 * Renders trusted first-party plugins within a narrow, isolated UI boundary.
 * Enforces strict capability and context isolation during plugin switching and async resolution.
 *
 * @param {Object} props
 * @param {string} props.pluginId - Plugin ID to resolve and render
 * @param {Object} [props.registry] - Optional custom PluginRegistry
 * @param {Object} [props.uiRegistry] - Optional custom PluginUIRegistry
 * @returns {JSX.Element} Plugin Host container
 */
export function PluginHost({ pluginId, registry: customRegistry, uiRegistry: customUIRegistry }) {
    const [resolvedState, setResolvedState] = useState({
        boundPluginId: null,
        status: 'loading', // 'loading' | 'ready' | 'error' | 'disposed' | 'no_ui' | 'unknown'
        errorMessage: null,
        context: null
    });

    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Resolve registries
    const appInstance = appService.getAppInstance();
    const registry = customRegistry || appInstance?.pluginRegistry || appInstance?.pluginRuntime?.registry;
    const uiRegistry = customUIRegistry || appInstance?.pluginUIRegistry || appService.getPluginUIRegistry();

    useEffect(() => {
        let isCurrentEffect = true;

        async function resolvePlugin() {
            if (!pluginId) {
                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'unknown',
                        errorMessage: 'Nincs megadva bővítmény azonosító.',
                        context: null
                    });
                }
                return;
            }

            if (!registry || typeof registry.get !== 'function') {
                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'error',
                        errorMessage: 'A bővítmény-kezelő (PluginRegistry) nem érhető el.',
                        context: null
                    });
                }
                return;
            }

            // 1. Resolve plugin record from registry
            const record = registry.get(pluginId);
            if (!record) {
                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'unknown',
                        errorMessage: `A megadott bővítmény ("${pluginId}") nem található a regiszterben.`,
                        context: null
                    });
                }
                return;
            }

            // 2. Check if plugin is disposed
            if (record.state === 'disposed') {
                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'disposed',
                        errorMessage: `A bővítmény ("${pluginId}") ki lett kapcsolva (disposed).`,
                        context: null
                    });
                }
                return;
            }

            // 3. Resolve UI contract
            const uiEntry = uiRegistry ? uiRegistry.getUI(pluginId) : null;
            if (!uiEntry || !uiEntry.hasUI || !uiEntry.component) {
                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'no_ui',
                        errorMessage: `A bővítmény ("${pluginId}") nem rendelkezik megjeleníthető felülettel.`,
                        context: null
                    });
                }
                return;
            }

            // 4. Handle initialization if not yet active
            try {
                if (record.state === 'registered' || record.state === 'initialized') {
                    if (isCurrentEffect && isMountedRef.current) {
                        setResolvedState({
                            boundPluginId: pluginId,
                            status: 'loading',
                            errorMessage: null,
                            context: null
                        });
                    }
                    await registry.initialize(pluginId);
                }

                if (!isCurrentEffect || !isMountedRef.current) return;

                // Check again post-initialization state
                const currentRecord = registry.get(pluginId);
                if (currentRecord.state === 'disposed') {
                    if (isCurrentEffect && isMountedRef.current) {
                        setResolvedState({
                            boundPluginId: pluginId,
                            status: 'disposed',
                            errorMessage: `A bővítmény ("${pluginId}") ki lett kapcsolva az inicializálás során.`,
                            context: null
                        });
                    }
                    return;
                }

                if (currentRecord.state !== 'active') {
                    if (isCurrentEffect && isMountedRef.current) {
                        setResolvedState({
                            boundPluginId: pluginId,
                            status: 'error',
                            errorMessage: `A bővítmény azonosítója ("${pluginId}") nem aktív. Állapot: ${currentRecord.state}`,
                            context: null
                        });
                    }
                    return;
                }

                // Retrieve canonical restricted PluginContext created during initialization
                let context = typeof registry.getContext === 'function' ? registry.getContext(pluginId) : null;
                if (!context) {
                    context = createPluginContext(currentRecord.manifest, {
                        storageService: registry.storageService || appInstance?.pluginStorageService,
                        appService: registry.appService || appService
                    });
                }

                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'ready',
                        errorMessage: null,
                        context
                    });
                }
            } catch (err) {
                if (isCurrentEffect && isMountedRef.current) {
                    setResolvedState({
                        boundPluginId: pluginId,
                        status: 'error',
                        errorMessage: err?.message || `Hiba történt a bővítmény ("${pluginId}") inicializálása során.`,
                        context: null
                    });
                }
            }
        }

        resolvePlugin();

        return () => {
            isCurrentEffect = false;
        };
    }, [pluginId, registry, uiRegistry, appInstance]);

    // Synchronously derive context and status for current pluginId
    const canonicalContext = (registry && typeof registry.getContext === 'function') ? registry.getContext(pluginId) : null;
    const currentRecord = registry?.get?.(pluginId);
    const isAlreadyActive = currentRecord?.state === 'active' && Boolean(canonicalContext);
    const isDisposed = currentRecord?.state === 'disposed';
    const isUnknown = !currentRecord && Boolean(pluginId);

    const isStateBoundToCurrentPlugin = resolvedState.boundPluginId === pluginId;

    let effectiveStatus = 'loading';
    let effectiveErrorMessage = null;
    let effectiveContext = null;

    if (!pluginId) {
        effectiveStatus = 'unknown';
        effectiveErrorMessage = 'Nincs megadva bővítmény azonosító.';
    } else if (isUnknown) {
        effectiveStatus = 'unknown';
        effectiveErrorMessage = `A megadott bővítmény ("${pluginId}") nem található a regiszterben.`;
    } else if (isDisposed) {
        effectiveStatus = 'disposed';
        effectiveErrorMessage = `A bővítmény ("${pluginId}") ki lett kapcsolva (disposed).`;
    } else if (isAlreadyActive) {
        effectiveStatus = 'ready';
        effectiveContext = canonicalContext;
    } else if (isStateBoundToCurrentPlugin) {
        effectiveStatus = resolvedState.status;
        effectiveErrorMessage = resolvedState.errorMessage;
        effectiveContext = resolvedState.context;
    } else {
        effectiveStatus = 'loading';
        effectiveContext = null;
    }

    const uiEntry = uiRegistry ? uiRegistry.getUI(pluginId) : null;

    if (effectiveStatus === 'loading') {
        return (
            <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 shadow-sm my-4">
                <i className="fas fa-spinner fa-spin text-2xl text-blue-500 mb-2"></i>
                <p className="text-xs font-semibold">Bővítmény betöltése...</p>
            </div>
        );
    }

    if (effectiveStatus === 'unknown') {
        return (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-question-circle text-amber-500"></i>
                    <span>Ismeretlen bővítmény</span>
                </div>
                <p className="text-xs text-amber-700">{effectiveErrorMessage || 'A kért bővítmény nem található.'}</p>
            </div>
        );
    }

    if (effectiveStatus === 'no_ui' || (!uiEntry || !uiEntry.hasUI || !uiEntry.component)) {
        return (
            <div className="p-6 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-info-circle text-blue-500"></i>
                    <span>Háttér bővítmény</span>
                </div>
                <p className="text-xs text-blue-700">{effectiveErrorMessage || 'Ez a bővítmény háttérszolgáltatásként fut, nem rendelkezik UI felülettel.'}</p>
            </div>
        );
    }

    if (effectiveStatus === 'disposed') {
        return (
            <div className="p-6 bg-gray-100 border border-gray-300 rounded-2xl text-gray-700 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-ban text-gray-500"></i>
                    <span>Inaktív bővítmény</span>
                </div>
                <p className="text-xs text-gray-600">{effectiveErrorMessage || 'A bővítmény ki lett kapcsolva.'}</p>
            </div>
        );
    }

    if (effectiveStatus === 'error' || !effectiveContext) {
        return (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-exclamation-circle text-red-500"></i>
                    <span>Bővítmény inicializálási hiba</span>
                </div>
                <p className="text-xs text-red-700 font-mono bg-white/70 p-2 rounded-xl border border-red-100 break-words mt-1">
                    {effectiveErrorMessage || 'Nem sikerült elindítani a bővítményt.'}
                </p>
            </div>
        );
    }

    const PluginComponent = uiEntry.component;

    return (
        <PluginErrorBoundary pluginId={pluginId} pluginTitle={uiEntry.title}>
            <div className="plugin-host-container bg-white rounded-2xl border border-gray-200 p-4 shadow-sm my-2">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                    <i className={`${uiEntry.icon || 'fas fa-plug'} text-blue-600 text-lg`}></i>
                    <h2 className="text-sm font-bold text-gray-800">{uiEntry.title}</h2>
                    <span className="ml-auto text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-mono font-medium">
                        {pluginId}
                    </span>
                </div>
                <PluginComponent context={effectiveContext} />
            </div>
        </PluginErrorBoundary>
    );
}

export default PluginHost;
