/**
 * Application Service Boundary
 * Serves as the explicit bridge between React components/Zustand actions
 * and lower-level domain services or legacy controller interfaces.
 */

export const appService = {
    /**
     * Retrieves initial application snapshot if app is booted.
     * @returns {Object|null}
     */
    getInitialSnapshot() {
        if (typeof window !== 'undefined' && window.app?.isBooted && typeof window.app.getAppSnapshot === 'function') {
            return window.app.getAppSnapshot();
        }
        return null;
    },

    /**
     * Generates test entries and updates the application store.
     * @param {number} count Number of test entries
     */
    async generateTestData(count = 30) {
        if (typeof window !== 'undefined' && window.app) {
            try {
                if (typeof window.app.generateTestData === 'function') {
                    await window.app.generateTestData(count);
                }
                if (window.app.items?.load) await window.app.items.load();
                if (window.app.months?.load) await window.app.months.load();
                if (window.app.entries?.load) await window.app.entries.load();

                if (typeof window.app.updateReactStore === 'function') {
                    window.app.updateReactStore();
                } else if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('app-data-updated'));
                }

                window.app.hmiNotif?.showToast?.('Tesztadatok létrehozva', 'success');
            } catch (e) {
                console.error('[appService] generateTestData error:', e);
                window.app?.hmiNotif?.showToast?.('Tesztadat generálás sikertelen', 'error');
            }
        }
    },

    /** Table / UI actions */
    deleteMonthSequence(month) {
        if (typeof window !== 'undefined' && window.app?.uiController?.handleMonthDeleteSequence) {
            window.app.uiController.handleMonthDeleteSequence(month);
        }
    },

    deleteRowSequence(itemId, itemName) {
        if (typeof window !== 'undefined' && window.app?.uiController?.handleRowDeleteSequence) {
            window.app.uiController.handleRowDeleteSequence(itemId, itemName);
        }
    },

    async showCategoryActionsModal(itemName) {
        if (typeof window !== 'undefined' && window.app?.hmiNotif?.showCategoryActionsModal) {
            return await window.app.hmiNotif.showCategoryActionsModal(itemName);
        }
        return null;
    },

    handleCellClick(element) {
        if (typeof window !== 'undefined' && window.app?.uiController?.handleCellClick) {
            window.app.uiController.handleCellClick(element);
        }
    },

    openInputModal(type) {
        if (typeof window !== 'undefined' && window.app?.uiController?.inputModal?.open) {
            window.app.uiController.inputModal.open(type);
        }
    },

    /** Export / Import / Sync / Maintenance actions */
    exportExcel() {
        if (typeof window !== 'undefined' && window.app?.uiController?.exportController?.exportExcel) {
            window.app.uiController.exportController.exportExcel();
        }
    },

    exportPdf() {
        if (typeof window !== 'undefined' && window.app?.uiController?.exportController?.exportPdf) {
            window.app.uiController.exportController.exportPdf();
        }
    },

    exportJson() {
        if (typeof window !== 'undefined' && window.app?.uiController?.exportController?.exportJson) {
            window.app.uiController.exportController.exportJson();
        }
    },

    importJson() {
        if (typeof window !== 'undefined' && window.app?.uiController?.exportController?.importJson) {
            window.app.uiController.exportController.importJson();
        }
    },

    openSyncModal() {
        if (typeof window !== 'undefined' && window.app?.uiController?.openSyncModal) {
            window.app.uiController.openSyncModal();
        }
    },

    startDbAudit() {
        if (typeof window !== 'undefined' && window.app?.uiController?.maintenanceController?.startDbAudit) {
            window.app.uiController.maintenanceController.startDbAudit();
        }
    },

    restoreBackup() {
        if (typeof window !== 'undefined' && window.app?.uiController?.maintenanceController?.restoreBackup) {
            window.app.uiController.maintenanceController.restoreBackup();
        }
    },

    forceBackup() {
        if (typeof window !== 'undefined' && window.app?.uiController?.maintenanceController?.forceBackup) {
            window.app.uiController.maintenanceController.forceBackup();
        }
    },

    wipeDatabase() {
        if (typeof window !== 'undefined' && window.app?.uiController?.maintenanceController?.wipeDatabase) {
            window.app.uiController.maintenanceController.wipeDatabase();
        }
    },

    handleQueueClick() {
        if (typeof window !== 'undefined' && window.app?.uiController?._handleQueueClick) {
            window.app.uiController._handleQueueClick();
        }
    },

    /** Work App Actions */
    openWorkModal() {
        if (typeof window !== 'undefined' && window.app?.workLogRenderer?.openModal) {
            window.app.workLogRenderer.openModal();
        }
    },

    openModuleChooser() {
        if (typeof window !== 'undefined' && window.app?.moduleManager?.openChooserModal) {
            window.app.moduleManager.openChooserModal();
        }
    },

    openHelp(topic) {
        if (typeof window !== 'undefined' && window.app?.hmiNotif?.openHelp) {
            window.app.hmiNotif.openHelp(topic);
        }
    },

    openSettings() {
        if (typeof window !== 'undefined' && window.app?.ui) {
            window.app.ui.populateSettingsForm?.();
            window.app.ui.togglePanel?.('settingsPanel');
        }
    },

    exportWorkExcel() {
        if (typeof window !== 'undefined' && window.app?.ui?.exportController?.exportWorkExcel) {
            window.app.ui.exportController.exportWorkExcel();
        }
    },

    exportWorkPdf() {
        if (typeof window !== 'undefined' && window.app?.ui?.exportController?.exportWorkPdf) {
            window.app.ui.exportController.exportWorkPdf();
        }
    },

    exportWorkJson() {
        if (typeof window !== 'undefined' && window.app?.ui?.exportController?.exportWorkJson) {
            window.app.ui.exportController.exportWorkJson();
        }
    },

    importWorkJson() {
        if (typeof window !== 'undefined' && window.app?.ui?.exportController?.importWorkJson) {
            window.app.ui.exportController.importWorkJson();
        }
    },

    /** Launch / Navigation */
    launchCostApp() {
        if (typeof document !== 'undefined') {
            const costApp = document.getElementById('costAppView');
            if (costApp) costApp.classList.remove('hidden');
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('hmi_selected_module', 'cost');
        }
        if (typeof window !== 'undefined' && window.app?.renderer?.renderTable) {
            window.app.renderer.renderTable();
        }
    },

    launchWorkApp() {
        if (typeof document !== 'undefined') {
            const workApp = document.getElementById('workAppView');
            if (workApp) workApp.classList.remove('hidden');
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('hmi_selected_module', 'work');
        }
        if (typeof window !== 'undefined' && window.app?.workLogRenderer?.render) {
            window.app.workLogRenderer.render();
        }
    },

    returnToMenuFromWork() {
        if (typeof document !== 'undefined') {
            const workApp = document.getElementById('workAppView');
            const landing = document.getElementById('appLandingScreenRoot')?.parentElement;
            if (workApp) workApp.classList.add('hidden');
            if (landing) landing.classList.remove('hidden');
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('hmi_selected_module');
        }
    },

    /** PWA & Queue Status */
    promptPwaInstall() {
        if (typeof window !== 'undefined' && window.app?.pwaManager?.promptInstall) {
            window.app.pwaManager.promptInstall();
        }
    },

    getQueueStatus() {
        if (typeof window !== 'undefined' && window.app?.syncService?.getQueueStatus) {
            return window.app.syncService.getQueueStatus();
        }
        return null;
    },

    subscribeQueueStatus(callback) {
        if (typeof window !== 'undefined' && window.app?.syncService?.onQueueChange) {
            return window.app.syncService.onQueueChange(callback);
        }
        return null;
    }
};
