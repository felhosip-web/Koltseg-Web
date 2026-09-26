/**
 * Application Service Boundary
 * Serves as the explicit bridge between React components/Zustand actions
 * and lower-level domain services or application instances via explicit binding.
 */

let appInstance = null;

export const appService = {
    /**
     * Binds the application instance explicitly.
     * @param {Object} app Application instance
     */
    bind(app) {
        appInstance = app;
    },

    /**
     * Unbinds the current application instance.
     */
    unbind() {
        appInstance = null;
    },

    /**
     * Gets the current bound application instance.
     * @returns {Object|null}
     */
    getAppInstance() {
        return appInstance;
    },

    /**
     * Retrieves initial application snapshot if app is booted.
     * @returns {Object|null}
     */
    getInitialSnapshot() {
        if (appInstance?.isBooted && typeof appInstance.getAppSnapshot === 'function') {
            return appInstance.getAppSnapshot();
        }
        return null;
    },

    /**
     * Generates test entries and updates the application store.
     * @param {number} count Number of test entries
     */
    async generateTestData(count = 30) {
        if (appInstance) {
            try {
                if (typeof appInstance.generateTestData === 'function') {
                    await appInstance.generateTestData(count);
                }
                if (appInstance.items?.load) await appInstance.items.load();
                if (appInstance.months?.load) await appInstance.months.load();
                if (appInstance.entries?.load) await appInstance.entries.load();

                if (typeof appInstance.updateReactStore === 'function') {
                    appInstance.updateReactStore();
                } else if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('app-data-updated'));
                }

                appInstance.hmiNotif?.showToast?.('Tesztadatok létrehozva', 'success');
            } catch (e) {
                console.error('[appService] generateTestData error:', e);
                appInstance?.hmiNotif?.showToast?.('Tesztadat generálás sikertelen', 'error');
            }
        }
    },

    /** Table / UI actions */
    deleteMonthSequence(month) {
        if (appInstance?.uiController?.handleMonthDeleteSequence) {
            appInstance.uiController.handleMonthDeleteSequence(month);
        }
    },

    deleteRowSequence(itemId, itemName) {
        if (appInstance?.uiController?.handleRowDeleteSequence) {
            appInstance.uiController.handleRowDeleteSequence(itemId, itemName);
        }
    },

    async showCategoryActionsModal(itemName) {
        if (appInstance?.hmiNotif?.showCategoryActionsModal) {
            return await appInstance.hmiNotif.showCategoryActionsModal(itemName);
        }
        return 'not_available';
    },

    handleCellClick(element) {
        if (appInstance?.uiController?.handleCellClick) {
            appInstance.uiController.handleCellClick(element);
        }
    },

    openInputModal(type) {
        if (appInstance?.uiController?.inputModal?.open) {
            appInstance.uiController.inputModal.open(type);
        }
    },

    /** Export / Import / Sync / Maintenance actions */
    exportExcel() {
        if (appInstance?.uiController?.exportController?.exportExcel) {
            appInstance.uiController.exportController.exportExcel();
        }
    },

    exportPdf() {
        if (appInstance?.uiController?.exportController?.exportPdf) {
            appInstance.uiController.exportController.exportPdf();
        }
    },

    exportJson() {
        if (appInstance?.uiController?.exportController?.exportJson) {
            appInstance.uiController.exportController.exportJson();
        }
    },

    importJson() {
        if (appInstance?.uiController?.exportController?.importJson) {
            appInstance.uiController.exportController.importJson();
        }
    },

    openSyncModal() {
        if (appInstance?.uiController?.openSyncModal) {
            appInstance.uiController.openSyncModal();
        }
    },

    startDbAudit() {
        if (appInstance?.uiController?.maintenanceController?.startDbAudit) {
            appInstance.uiController.maintenanceController.startDbAudit();
        }
    },

    restoreBackup() {
        if (appInstance?.uiController?.maintenanceController?.restoreBackup) {
            appInstance.uiController.maintenanceController.restoreBackup();
        }
    },

    forceBackup() {
        if (appInstance?.uiController?.maintenanceController?.forceBackup) {
            appInstance.uiController.maintenanceController.forceBackup();
        }
    },

    wipeDatabase() {
        if (appInstance?.uiController?.maintenanceController?.wipeDatabase) {
            appInstance.uiController.maintenanceController.wipeDatabase();
        }
    },

    handleQueueClick() {
        if (appInstance?.uiController?._handleQueueClick) {
            appInstance.uiController._handleQueueClick();
        }
    },

    /** Incoming actions */
    addNewIncomingEntry() {
        if (appInstance?.incomingRenderer?.addNewEntry) {
            appInstance.incomingRenderer.addNewEntry();
        }
    },

    handleIncomingCellClick(element) {
        if (appInstance?.incomingRenderer?._handleCellClick) {
            appInstance.incomingRenderer._handleCellClick(element);
        }
    },

    deleteIncomingColumn(date) {
        if (appInstance?.incomingRenderer?.deleteColumn) {
            appInstance.incomingRenderer.deleteColumn(date);
        }
    },

    deleteIncomingRow(sender) {
        if (appInstance?.incomingRenderer?.deleteRow) {
            appInstance.incomingRenderer.deleteRow(sender);
        }
    },

    /** Reminder actions */
    async createReminder(data) {
        if (appInstance?.remindersApp?._handleNewReminder) {
            return await appInstance.remindersApp._handleNewReminder(data);
        }
    },

    async updateReminder(data) {
        if (appInstance?.remindersApp?._updateReminder) {
            return await appInstance.remindersApp._updateReminder(data);
        }
    },

    async deleteReminder(id) {
        if (appInstance?.remindersApp?._handleDeleteReminder) {
            return await appInstance.remindersApp._handleDeleteReminder(id);
        }
    },

    async completeReminder(id) {
        if (appInstance?.remindersApp?._handleCompleteReminder) {
            return await appInstance.remindersApp._handleCompleteReminder(id);
        }
    },

    /** Work App Actions */
    openWorkModal() {
        if (appInstance?.workLogRenderer?.openModal) {
            appInstance.workLogRenderer.openModal();
        }
    },

    openModuleChooser() {
        if (appInstance?.moduleManager?.openChooserModal) {
            appInstance.moduleManager.openChooserModal();
        }
    },

    openHelp(topic) {
        if (appInstance?.hmiNotif?.openHelp) {
            appInstance.hmiNotif.openHelp(topic);
        }
    },

    openSettings() {
        if (appInstance?.ui) {
            appInstance.ui.populateSettingsForm?.();
            appInstance.ui.togglePanel?.('settingsPanel');
        }
    },

    exportWorkExcel() {
        if (appInstance?.ui?.exportController?.exportWorkExcel) {
            appInstance.ui.exportController.exportWorkExcel();
        }
    },

    exportWorkPdf() {
        if (appInstance?.ui?.exportController?.exportWorkPdf) {
            appInstance.ui.exportController.exportWorkPdf();
        }
    },

    exportWorkJson() {
        if (appInstance?.ui?.exportController?.exportWorkJson) {
            appInstance.ui.exportController.exportWorkJson();
        }
    },

    importWorkJson() {
        if (appInstance?.ui?.exportController?.importWorkJson) {
            appInstance.ui.exportController.importWorkJson();
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
        if (appInstance?.renderer?.renderTable) {
            appInstance.renderer.renderTable();
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
        if (appInstance?.workLogRenderer?.render) {
            appInstance.workLogRenderer.render();
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
        if (appInstance?.pwaManager?.promptInstall) {
            appInstance.pwaManager.promptInstall();
        }
    },

    getQueueStatus() {
        if (appInstance?.syncService?.getQueueStatus) {
            return appInstance.syncService.getQueueStatus();
        }
        return null;
    },

    subscribeQueueStatus(callback) {
        if (appInstance?.syncService?.onQueueChange) {
            return appInstance.syncService.onQueueChange(callback);
        }
        return null;
    }
};
