import React from 'react';

/**
 * Footer component displaying system status, save indicators, and app version.
 * Shows a save status LED, last save timestamp, and version information with debug toggle button.
 * @returns {JSX.Element} The footer component
 */
import { useState, useEffect } from 'react';

export default function CostAppFooter() {
    const [lastSave, setLastSave] = useState('Soha');

    useEffect(() => {
        const updateTime = () => {
            if (window.app?.syncService?.lastSyncTime) {
                const date = new Date(window.app.syncService.lastSyncTime);
                setLastSave(date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            } else {
                setLastSave('Soha');
            }
        };

        // Initial check
        updateTime();

        // Listen for sync completion and queue changes
        const handleSyncEvent = () => updateTime();

        window.addEventListener('app-data-updated', handleSyncEvent);
        let unsubscribeQueue = null;
        if (window.app?.syncService?.onQueueChange) {
            unsubscribeQueue = window.app.syncService.onQueueChange(handleSyncEvent);
        }

        return () => {
            window.removeEventListener('app-data-updated', handleSyncEvent);
            if (unsubscribeQueue) {
                unsubscribeQueue();
            }
        };
    }, []);

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
                Utolsó mentés: <span id="lastSaveTime">{lastSave}</span>
            </div>
            <div className="text-gray-400 relative p-1" id="debugToggleBtnContainer">
                Költségnyilvántartó <span className="app-version-label">v7.0.24</span>
                <button id="debugToggleBtn"
                    className="absolute inset-0 w-full h-full bg-transparent border-none cursor-pointer z-50 focus:outline-none"
                    title="Debug panel megnyitása (5x kattintás)"></button>
            </div>
        </footer>
    );
}
