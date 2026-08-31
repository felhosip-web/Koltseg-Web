import RemindersTab from './components/reminders/RemindersTab.jsx'
import React from 'react'
import ReactDOM from 'react-dom/client'
import LandingApp from './LandingApp.jsx'
import CostAppHeader from './CostAppHeader.jsx'
import CostAppTabs from './CostAppTabs.jsx'
import CostAppFooter from './CostAppFooter.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import DashboardTab from './components/dashboard/DashboardTab.jsx'
import StatsTab from './components/stats/StatsTab.jsx'
import './index.css'
import MainTable from './components/table/MainTable.jsx'
import WorkAppHeader from './WorkAppHeader.jsx'
import WorkAppList from './WorkAppList.jsx'
import CellEditorModal from './components/CellEditorModal.jsx'
import AiEntryModal from './components/AiEntryModal.jsx'
import TimeTrackerTab from './components/time-tracker/TimeTrackerTab.jsx'
import ChartsTab from './components/charts/ChartsTab.jsx'

const landingRoot = document.getElementById('appLandingScreenRoot');
if (landingRoot) {
    ReactDOM.createRoot(landingRoot).render(
      <React.StrictMode>
        <LandingApp />
      </React.StrictMode>,
    )
}

const timeTrackerRoot = document.getElementById('costAppTimeTrackerRoot');
if (timeTrackerRoot) {
    ReactDOM.createRoot(timeTrackerRoot).render(
      <React.StrictMode>
        <TimeTrackerTab />
      </React.StrictMode>,
    )
}

const chartsRoot = document.getElementById('costAppChartsRoot');
if (chartsRoot) {
    ReactDOM.createRoot(chartsRoot).render(
      <React.StrictMode>
        <ChartsTab />
      </React.StrictMode>,
    )
}

const dashboardRoot = document.getElementById('costAppDashboardRoot');
if (dashboardRoot) {
    ReactDOM.createRoot(dashboardRoot).render(
      <React.StrictMode>
        <DashboardTab />
      </React.StrictMode>,
    )
}

const statsRoot = document.getElementById('costAppStatsRoot');
if (statsRoot) {
    ReactDOM.createRoot(statsRoot).render(
      <React.StrictMode>
        <StatsTab />
      </React.StrictMode>,
    )
}

const settingsRoot = document.getElementById('costAppSettingsRoot');
if (settingsRoot) {
    ReactDOM.createRoot(settingsRoot).render(
      <React.StrictMode>
        <SettingsPanel />
      </React.StrictMode>,
    )
}

const cellEditorRoot = document.getElementById('costAppCellEditorRoot');
if (cellEditorRoot) {
    ReactDOM.createRoot(cellEditorRoot).render(
      <React.StrictMode>
        <CellEditorModal />
      </React.StrictMode>,
    )
}

const headerRoot = document.getElementById('costAppHeaderRoot');
if (headerRoot) {
    ReactDOM.createRoot(headerRoot).render(
      <React.StrictMode>
        <CostAppHeader />
      </React.StrictMode>,
    )
}

const tabsRoot = document.getElementById('costAppTabsRoot');
if (tabsRoot) {
    ReactDOM.createRoot(tabsRoot).render(
      <React.StrictMode>
        <CostAppTabs />
      </React.StrictMode>,
    )
}

const footerRoot = document.getElementById('costAppFooterRoot');
if (footerRoot) {
    ReactDOM.createRoot(footerRoot).render(
      <React.StrictMode>
        <CostAppFooter />
      </React.StrictMode>,
    )
}




const tableRoot = document.getElementById('costAppTableRoot');
if (tableRoot) {
    ReactDOM.createRoot(tableRoot).render(
      <React.StrictMode>
        <MainTable />
      </React.StrictMode>,
    )
}

const workAppHeaderRoot = document.getElementById('workAppHeaderRoot');
if (workAppHeaderRoot) {
    ReactDOM.createRoot(workAppHeaderRoot).render(
      <React.StrictMode>
        <WorkAppHeader />
      </React.StrictMode>,
    )
}

const workAppListRoot = document.getElementById('workAppListRoot');
if (workAppListRoot) {
    ReactDOM.createRoot(workAppListRoot).render(
      <React.StrictMode>
        <WorkAppList />
      </React.StrictMode>,
    )
}

const aiModalRoot = document.getElementById('costAppAiModalRoot');
if (aiModalRoot) {
    ReactDOM.createRoot(aiModalRoot).render(
      <React.StrictMode>
        <AiEntryModal />
      </React.StrictMode>,
    )
}

const remindersRoot = document.getElementById('costAppRemindersRoot');
if (remindersRoot) {
    ReactDOM.createRoot(remindersRoot).render(
      <React.StrictMode>
        <RemindersTab />
      </React.StrictMode>,
    )
}
