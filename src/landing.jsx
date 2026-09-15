import HmiInputModal from './components/HmiInputModal.jsx'
import IncomingTab from './components/incoming/IncomingTab.jsx'
import WorkEditorModal from './components/WorkEditorModal.jsx'
import RemindersTab from './components/reminders/RemindersTab.jsx'
import React from 'react'
import ReactDOM from 'react-dom/client'
import StoreSync from './components/StoreSync.jsx'
import { SyncDiffViewer } from './components/SyncDiffViewer.jsx'
import LandingApp from './LandingApp.jsx'
import CostAppLayout from './CostAppLayout.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import CellEditorModal from './components/CellEditorModal.jsx'
import WorkAppHeader from './WorkAppHeader.jsx'
import WorkAppList from './WorkAppList.jsx'
import AiEntryModal from './components/AiEntryModal.jsx'
import CostAppFooter from './CostAppFooter.jsx'
import './index.css'

const landingRoot = document.getElementById('appLandingScreenRoot');
if (landingRoot) {
    ReactDOM.createRoot(landingRoot).render(
      <React.StrictMode>
        <LandingApp />
      </React.StrictMode>,
    )
}

// Ensure the SyncDiffViewer root exists in index.html as <div id="syncDiffViewerRoot"></div>
const syncDiffViewerRoot = document.getElementById('syncDiffViewerRoot');
if (syncDiffViewerRoot) {
    // We will render this dynamically from vanilla JS using window.renderSyncDiffViewer
    let root = ReactDOM.createRoot(syncDiffViewerRoot);
    window.renderSyncDiffViewer = (props) => {
        root.render(<React.StrictMode><SyncDiffViewer {...props} /></React.StrictMode>);
    };
    window.unmountSyncDiffViewer = () => {
        root.render(null);
    };
}

// Mount headless StoreSync bridge
const storeSyncContainer = document.createElement('div');
storeSyncContainer.id = 'storeSyncRoot';
document.body.appendChild(storeSyncContainer);
ReactDOM.createRoot(storeSyncContainer).render(<StoreSync />);

const costAppReactRoot = document.getElementById('costAppReactRoot');
if (costAppReactRoot) {
    ReactDOM.createRoot(costAppReactRoot).render(
      <React.StrictMode>
        <CostAppLayout />
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

const workAppEditorRoot = document.getElementById('workAppEditorRoot');
if (workAppEditorRoot) {
    ReactDOM.createRoot(workAppEditorRoot).render(
      <React.StrictMode>
        <WorkEditorModal />
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



const hmiInputRoot = document.getElementById('costAppHmiInputRoot');
if (hmiInputRoot) {
    ReactDOM.createRoot(hmiInputRoot).render(
      <React.StrictMode>
        <HmiInputModal />
      </React.StrictMode>,
    )
}

const costAppFooterRoot = document.getElementById('costAppFooterRoot');
if (costAppFooterRoot) {
    ReactDOM.createRoot(costAppFooterRoot).render(
      <React.StrictMode>
        <CostAppFooter />
      </React.StrictMode>,
    )
}
