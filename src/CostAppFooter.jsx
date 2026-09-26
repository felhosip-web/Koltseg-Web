import React from 'react';
import { useAppStore } from './store/useAppStore.js';

/**
 * Footer component displaying system status, save indicators, and app version.
 * Shows a save status LED, last save timestamp, and version information with debug toggle button.
 * Reads lastSyncTime reactively from the Zustand store.
 * @returns {JSX.Element} The footer component
 */
export default function CostAppFooter() {
    const lastSyncTime = useAppStore(state => state.lastSyncTime);

    let formattedSave = 'Soha';
    if (lastSyncTime) {
        try {
            const date = new Date(lastSyncTime);
            if (!isNaN(date.getTime())) {
                formattedSave = date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
        } catch (e) {
            formattedSave = 'Soha';
        }
    }

    return (
        <footer
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-600 flex items-center justify-between z-40">
            <div className="flex items-center gap-2">
                <span id="saveLed"
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm transition-all duration-300"></span>
                <span id="saveStatusText" className="font-mono uppercase tracking-wider text-[10px] text-gray-500">Rendszer
                    Online</span>
            </div>
            <div className="font-mono text-[10px] text-gray-400">
                Utolsó mentés: <span id="lastSaveTime">{formattedSave}</span>
            </div>
            <div className="text-gray-400 relative p-1" id="debugToggleBtnContainer">
                Költségnyilvántartó <span className="app-version-label">v7.2.1</span>
                <button id="debugToggleBtn"
                    className="absolute inset-0 w-full h-full bg-transparent border-none cursor-pointer z-50 focus:outline-none"
                    title="Debug panel megnyitása (5x kattintás)"></button>
            </div>
        </footer>
    );
}
