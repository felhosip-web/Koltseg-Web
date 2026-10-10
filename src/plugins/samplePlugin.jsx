import React, { useState, useEffect } from 'react';
import { pluginUIRegistry } from '../services/plugin/PluginUIRegistry.js';

export const SAMPLE_PLUGIN_MANIFEST = Object.freeze({
    id: 'firstparty.sample.plugin',
    name: 'Minta Bővítmény',
    version: '1.0.0',
    apiVersion: '1',
    description: 'Első féltől származó PLG2 mintabővítmény',
    permissions: ['storage:private', 'ui:toast', 'expenses:read']
});

/**
 * Setup function executed during PLG1 initialize() with restricted PluginContext.
 * @param {Object} ctx
 */
export async function samplePluginSetup(ctx) {
    if (ctx.ui?.showToast) {
        ctx.ui.showToast('Minta bővítmény inicializálva', 'info');
    }
}

/**
 * React UI Component entry point for the sample plugin.
 * Receives ONLY the restricted PluginContext.
 * @param {Object} props
 * @param {Object} props.context - Restricted PluginContext
 */
export function SamplePluginComponent({ context }) {
    const [noteText, setNoteText] = useState('');
    const [savedNote, setSavedNote] = useState(null);
    const [categoriesCount, setCategoriesCount] = useState(0);

    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            try {
                // 1. Scoped Storage capability
                if (context?.storage) {
                    const coll = context.storage.collection('sample_notes');
                    const note = await coll.get('user_note');
                    if (isMounted && note) {
                        setSavedNote(note);
                        setNoteText(note.content || '');
                    }
                }

                // 2. Host API capability
                if (context?.api?.getCategoryList) {
                    const categories = context.api.getCategoryList();
                    if (isMounted) {
                        setCategoriesCount(Array.isArray(categories) ? categories.length : 0);
                    }
                }
            } catch (err) {
                console.warn('[SamplePluginComponent] Data load warning:', err);
            }
        }

        loadData();

        return () => {
            isMounted = false;
        };
    }, [context]);

    const handleSaveNote = async () => {
        if (!context?.storage) return;

        try {
            const coll = context.storage.collection('sample_notes');
            const data = {
                content: noteText,
                updatedAt: new Date().toISOString()
            };
            await coll.set('user_note', data);
            setSavedNote(data);

            // Toast capability
            if (context.ui?.showToast) {
                context.ui.showToast('Jegyzet sikeresen mentve a bővítmény tárhelyére!', 'success');
            }
        } catch (err) {
            console.error('[SamplePluginComponent] Save error:', err);
            if (context.ui?.showToast) {
                context.ui.showToast('Hiba a mentés során: ' + err.message, 'error');
            }
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                <span>
                    <i className="fas fa-list mr-1 text-slate-500"></i>
                    Rendszerben lévő kategóriák: <strong>{categoriesCount} db</strong>
                </span>
                <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full font-mono">expenses:read</span>
            </div>

            <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">
                    Saját elszeparált jegyzet (Storage:Private):
                </label>
                <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Írj ide egy privát megjegyzést..."
                    rows={3}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                <button
                    onClick={handleSaveNote}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center gap-1.5">
                    <i className="fas fa-save"></i>
                    Mentés privát tárhelyre
                </button>
            </div>

            {savedNote && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                    <div className="font-bold flex items-center gap-1 mb-1 text-emerald-700">
                        <i className="fas fa-check-circle"></i>
                        Mentett tartalom:
                    </div>
                    <p className="italic bg-white/80 p-2 rounded-lg border border-emerald-100">{savedNote.content}</p>
                    <div className="text-[10px] text-emerald-600 mt-1 text-right font-mono">
                        Utoljára frissítve: {new Date(savedNote.updatedAt).toLocaleString('hu-HU')}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Helper function to register sample plugin in both PLG1 PluginRegistry and PLG2 PluginUIRegistry.
 * @param {Object} registry - PLG1 PluginRegistry instance
 * @param {Object} [uiReg] - PLG2 PluginUIRegistry instance
 */
export function registerSamplePlugin(registry, uiReg = pluginUIRegistry) {
    if (!registry) return;

    if (!registry.has(SAMPLE_PLUGIN_MANIFEST.id)) {
        registry.register(SAMPLE_PLUGIN_MANIFEST, samplePluginSetup);
    }

    if (!uiReg.getUI(SAMPLE_PLUGIN_MANIFEST.id)) {
        uiReg.registerUI({
            pluginId: SAMPLE_PLUGIN_MANIFEST.id,
            title: SAMPLE_PLUGIN_MANIFEST.name,
            icon: 'fas fa-puzzle-piece',
            category: 'demo',
            hasUI: true,
            component: SamplePluginComponent
        });
    }
}
