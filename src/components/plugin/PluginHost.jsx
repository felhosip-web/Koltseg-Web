import React, { useState, useEffect, useRef } from 'react';
import { appService } from '../../services/appService.js';
import { pluginUIRegistry as defaultUIRegistry } from '../../services/plugin/PluginUIRegistry.js';
import { PluginErrorBoundary } from './PluginErrorBoundary.jsx';
import { createPluginContext } from '../../services/plugin/PluginCapabilityFactory.js';

/**
 * React Plugin Host Component (PLG2)
 * Renders trusted first-party plugins within a narrow, isolated UI boundary.
 *
 * @param {Object} props
 * @param {string} props.pluginId - Plugin ID to resolve and render
 * @param {Object} [props.registry] - Optional custom PluginRegistry
 * @param {Object} [props.uiRegistry] - Optional custom PluginUIRegistry
 * @returns {JSX.Element} Plugin Host container
 */
export function PluginHost({ pluginId, registry: customRegistry, uiRegistry: customUIRegistry }) {
    const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error' | 'disposed' | 'no_ui' | 'unknown'
    const [errorMessage, setErrorMessage] = useState(null);
    const [pluginContext, setPluginContext] = useState(null);

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
    const uiRegistry = customUIRegistry || defaultUIRegistry;

    useEffect(() => {
        let isCurrentEffect = true;

        async function resolvePlugin() {
            if (!pluginId) {
                if (isCurrentEffect && isMountedRef.current) {
                    setStatus('unknown');
                    setErrorMessage('Nincs megadva bővítmény azonosító.');
                }
                return;
            }

            if (!registry || typeof registry.get !== 'function') {
                if (isCurrentEffect && isMountedRef.current) {
                    setStatus('error');
                    setErrorMessage('A bővítmény-kezelő (PluginRegistry) nem érhető el.');
                }
                return;
            }

            // 1. Resolve plugin record from registry
            const record = registry.get(pluginId);
            if (!record) {
                if (isCurrentEffect && isMountedRef.current) {
                    setStatus('unknown');
                    setErrorMessage(`A megadott bővítmény ("${pluginId}") nem található a regiszterben.`);
                }
                return;
            }

            // 2. Check if plugin is disposed
            if (record.state === 'disposed') {
                if (isCurrentEffect && isMountedRef.current) {
                    setStatus('disposed');
                    setErrorMessage(`A bővítmény ("${pluginId}") ki lett kapcsolva (disposed).`);
                }
                return;
            }

            // 3. Resolve UI contract
            const uiEntry = uiRegistry.getUI(pluginId);
            if (!uiEntry || !uiEntry.hasUI || !uiEntry.component) {
                if (isCurrentEffect && isMountedRef.current) {
                    setStatus('no_ui');
                    setErrorMessage(`A bővítmény ("${pluginId}") nem rendelkezik megjeleníthető felülettel.`);
                }
                return;
            }

            // 4. Handle initialization
            try {
                if (record.state === 'registered' || record.state === 'initialized') {
                    if (isCurrentEffect && isMountedRef.current) {
                        setStatus('loading');
                    }
                    await registry.initialize(pluginId);
                }

                // Check again post-initialization state
                const currentRecord = registry.get(pluginId);
                if (currentRecord.state === 'disposed') {
                    if (isCurrentEffect && isMountedRef.current) {
                        setStatus('disposed');
                        setErrorMessage(`A bővítmény ("${pluginId}") ki lett kapcsolva az inicializálás során.`);
                    }
                    return;
                }

                if (currentRecord.state !== 'active') {
                    if (isCurrentEffect && isMountedRef.current) {
                        setStatus('error');
                        setErrorMessage(`A bővítmény azonosítója ("${pluginId}") nem aktív. Állapot: ${currentRecord.state}`);
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
                    setPluginContext(context);
                    setStatus('ready');
                }
            } catch (err) {
                if (isCurrentEffect && isMountedRef.current) {
                    setStatus('error');
                    setErrorMessage(err?.message || `Hiba történt a bővítmény ("${pluginId}") inicializálása során.`);
                }
            }
        }

        resolvePlugin();

        return () => {
            isCurrentEffect = false;
        };
    }, [pluginId, registry, uiRegistry, appInstance]);

    const uiEntry = uiRegistry.getUI(pluginId);

    if (status === 'loading') {
        return (
            <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 shadow-sm my-4">
                <i className="fas fa-spinner fa-spin text-2xl text-blue-500 mb-2"></i>
                <p className="text-xs font-semibold">Bővítmény betöltése...</p>
            </div>
        );
    }

    if (status === 'unknown') {
        return (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-question-circle text-amber-500"></i>
                    <span>Ismeretlen bővítmény</span>
                </div>
                <p className="text-xs text-amber-700">{errorMessage || 'A kért bővítmény nem található.'}</p>
            </div>
        );
    }

    if (status === 'no_ui') {
        return (
            <div className="p-6 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-info-circle text-blue-500"></i>
                    <span>Háttér bővítmény</span>
                </div>
                <p className="text-xs text-blue-700">{errorMessage || 'Ez a bővítmény háttérszolgáltatásként fut, nem rendelkezik UI felülettel.'}</p>
            </div>
        );
    }

    if (status === 'disposed') {
        return (
            <div className="p-6 bg-gray-100 border border-gray-300 rounded-2xl text-gray-700 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-ban text-gray-500"></i>
                    <span>Inaktív bővítmény</span>
                </div>
                <p className="text-xs text-gray-600">{errorMessage || 'A bővítmény ki lett kapcsolva.'}</p>
            </div>
        );
    }

    if (status === 'error' || !pluginContext) {
        return (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 my-4 shadow-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <i className="fas fa-exclamation-circle text-red-500"></i>
                    <span>Bővítmény inicializálási hiba</span>
                </div>
                <p className="text-xs text-red-700 font-mono bg-white/70 p-2 rounded-xl border border-red-100 break-words mt-1">
                    {errorMessage || 'Nem sikerült elindítani a bővítményt.'}
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
                <PluginComponent context={pluginContext} />
            </div>
        </PluginErrorBoundary>
    );
}

export default PluginHost;
