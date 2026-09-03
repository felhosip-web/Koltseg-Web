import React from 'react';
import { useAppStore } from './store/useAppStore.js';

/**
 * Tab navigation component for switching between different views in the cost tracking app.
 * Provides tabs for dashboard, table, time tracking, charts, reminders, incoming transfers, and stats.
 * @returns {JSX.Element} The tab navigation component
 */
export default function CostAppTabs() {

    const activeTab = useAppStore(state => state.activeTab);
    const setActiveTab = useAppStore(state => state.setActiveTab);

    const getTabClass = (tabId) => {
        const base = "tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ";
        if (activeTab === tabId) {
            return base + "bg-blue-600 text-white shadow-md";
        }
        return base + "bg-gray-100 text-gray-600 hover:bg-gray-200";
    };

    return (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" id="reactCostTabs">
            <button
                className={getTabClass('dashboard')}
                onClick={() => setActiveTab('dashboard')}>
                <i className="fas fa-chart-pie mr-1"></i> Áttekintés
            </button>
            <button
                className={getTabClass('table')}
                onClick={() => setActiveTab('table')}>
                <i className="fas fa-table mr-1"></i> Táblázat
            </button>
            <button
                className={getTabClass('time')}
                onClick={() => setActiveTab('time')}>
                <i className="fas fa-stopwatch mr-1"></i> Idő
            </button>
            <button
                className={getTabClass('charts')}
                onClick={() => setActiveTab('charts')}>
                <i className="fas fa-chart-line mr-1"></i> Kimutatások
            </button>
            <button
                className={getTabClass('reminders')}
                onClick={() => setActiveTab('reminders')}>
                <i className="fas fa-clock mr-1"></i> Határidők
            </button>
            <button
                className={getTabClass('incoming')}
                onClick={() => setActiveTab('incoming')}>
                <i className="fas fa-arrow-down text-emerald-500 mr-1"></i> Bejövő utalás
            </button>
            <button
                className={getTabClass('stats')}
                onClick={() => setActiveTab('stats')}>
                <i className="fas fa-calculator mr-1"></i> Részletek
            </button>
        </div>
    );
}
