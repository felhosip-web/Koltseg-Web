import React from 'react';
import CostAppHeader from './CostAppHeader.jsx';
import CostAppTabs from './CostAppTabs.jsx';
import DashboardTab from './components/dashboard/DashboardTab.jsx';
import MainTable from './components/table/MainTable.jsx';
import TimeTrackerTab from './components/time-tracker/TimeTrackerTab.jsx';
import ChartsTab from './components/charts/ChartsTab.jsx';
import RemindersTab from './components/reminders/RemindersTab.jsx';
import IncomingTab from './components/incoming/IncomingTab.jsx';
import StatsTab from './components/stats/StatsTab.jsx';
import { useAppStore } from './store/useAppStore.js';

export default function CostAppLayout() {
    const activeTab = useAppStore(state => state.activeTab);

    return (
        <div className="flex flex-col w-full">
            <CostAppHeader />
            
            <div id="hmiAlarmBanner" className="hidden mb-3 bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded-xl flex items-center gap-2 text-xs font-medium">
                <i className="fas fa-exclamation-triangle text-amber-500"></i>
                <span id="hmiAlarmText">Nincs aktív esemény</span>
            </div>
            
            <CostAppTabs />
            
            <div className="mt-4">
                {activeTab === 'dashboard' && <DashboardTab />}
                {activeTab === 'table' && <MainTable />}
                {activeTab === 'time' && <TimeTrackerTab />}
                {activeTab === 'charts' && <ChartsTab />}
                {activeTab === 'reminders' && <RemindersTab />}
                {activeTab === 'stats' && <StatsTab />}
                {activeTab === 'incoming' && <IncomingTab />}
            </div>
        </div>
    );
}
