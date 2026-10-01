/**
 * Application Service Boundary
 * Serves as the explicit bridge between React components/Zustand actions
 * and lower-level domain services or application instances via explicit binding.
 */

import { useAppStore } from '../store/useAppStore.js';

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
        if (appInstance?.handleMonthDeleteSequence) {
            appInstance.handleMonthDeleteSequence(month);
        } else if (appInstance?.uiController?.handleMonthDeleteSequence) {
            appInstance.uiController.handleMonthDeleteSequence(month);
        }
    },

    deleteRowSequence(itemId, itemName) {
        if (appInstance?.handleRowDeleteSequence) {
            appInstance.handleRowDeleteSequence(itemId, itemName);
        } else if (appInstance?.uiController?.handleRowDeleteSequence) {
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
        if (appInstance?.handleCellClick) {
            appInstance.handleCellClick(element);
        } else if (appInstance?.cellModal?.open) {
            appInstance.cellModal.open(element);
        } else if (appInstance?.uiController?.handleCellClick) {
            appInstance.uiController.handleCellClick(element);
        }
    },

    openInputModal(type) {
        if (appInstance?.inputModal?.open) {
            appInstance.inputModal.open(type);
        } else if (appInstance?.uiController?.inputModal?.open) {
            appInstance.uiController.inputModal.open(type);
        }
    },

    async performInputModalSave(type, value, color) {
        if (appInstance?.inputModal?.performSave) {
            return await appInstance.inputModal.performSave(type, value, color);
        } else if (appInstance?.uiController?.inputModal?.performSave) {
            return await appInstance.uiController.inputModal.performSave(type, value, color);
        }
        return false;
    },

    async performInputModalRename(itemId, currentName, newName) {
        if (appInstance?.inputModal?.performRename) {
            return await appInstance.inputModal.performRename(itemId, currentName, newName);
        } else if (appInstance?.uiController?.inputModal?.performRename) {
            return await appInstance.uiController.inputModal.performRename(itemId, currentName, newName);
        }
        return false;
    },

    resetAndRefreshCellModal() {
        const controller = appInstance?.cellModal || appInstance?.uiController?.cellModal;
        controller?.resetForm?.();
        controller?.refreshList?.();
    },

    openModal(modalId) {
        if (appInstance?.modalManager?.open) {
            appInstance.modalManager.open(modalId);
        } else if (typeof document !== 'undefined') {
            document.getElementById(modalId)?.classList.remove('hidden');
        }
    },

    closeModal(modalId) {
        if (appInstance?.modalManager?.close) {
            appInstance.modalManager.close(modalId);
        } else if (typeof document !== 'undefined') {
            document.getElementById(modalId)?.classList.add('hidden');
        }
    },

    showToast(message, type) {
        if (appInstance?.hmiNotif?.showToast) {
            appInstance.hmiNotif.showToast(message, type);
        }
    },

    /** Time Tracker Actions */
    startTimeTracker(projectId, taskName) {
        if (appInstance?.timeTracker?.startTimer) {
            appInstance.timeTracker.startTimer(projectId, taskName);
        }
    },

    pauseTimeTracker() {
        if (appInstance?.timeTracker?.pauseTimer) {
            appInstance.timeTracker.pauseTimer();
        }
    },

    resumeTimeTracker() {
        if (appInstance?.timeTracker?.resumeTimer) {
            appInstance.timeTracker.resumeTimer();
        }
    },

    stopTimeTracker() {
        if (appInstance?.timeTracker?.stopTimer) {
            appInstance.timeTracker.stopTimer();
        }
    },

    showTimeTrackerProjectModal() {
        if (appInstance?.timeTracker?.showProjectModal) {
            appInstance.timeTracker.showProjectModal();
        }
    },

    showTimeTrackerEntryModal(entry = null) {
        if (appInstance?.timeTracker?.showEntryModal) {
            appInstance.timeTracker.showEntryModal(entry);
        }
    },

    deleteTimeTrackerEntry(id) {
        if (appInstance?.timeTracker?.deleteEntry) {
            appInstance.timeTracker.deleteEntry(id);
        }
    },

    deleteTimeTrackerProject(id) {
        if (appInstance?.timeTracker?.deleteProject) {
            appInstance.timeTracker.deleteProject(id);
        }
    },

    /** Dashboard & Navigation Actions */
    getWeatherCity() {
        return appInstance?.config?.weatherCity || 'Budapest';
    },

    getWeatherCache() {
        return appInstance?.weatherCache || null;
    },

    setWeatherCache(cacheEntry) {
        if (appInstance) {
            appInstance.weatherCache = cacheEntry;
        }
    },

    switchTab(tab) {
        if (appInstance?.switchTab) {
            appInstance.switchTab(tab);
        } else {
            useAppStore.getState().setActiveTab(tab);
        }
    },

    launchModule(modId) {
        if (appInstance?.moduleManager?.launchModule) {
            appInstance.moduleManager.launchModule(modId);
        }
    },

    showView(view) {
        if (appInstance?.showView) {
            appInstance.showView(view);
        } else {
            useAppStore.getState().setActiveTab(view);
        }
    },

    /** Export / Import / Sync / Maintenance actions */
    exportExcel() {
        const controller = appInstance?.exportController || appInstance?.uiController?.exportController;
        if (controller?.exportExcel) {
            controller.exportExcel();
        }
    },

    exportPdf() {
        const controller = appInstance?.exportController || appInstance?.uiController?.exportController;
        if (controller?.exportPdf) {
            controller.exportPdf();
        }
    },

    exportJson() {
        const controller = appInstance?.exportController || appInstance?.uiController?.exportController;
        if (controller?.exportJson) {
            controller.exportJson();
        }
    },

    importJson() {
        const controller = appInstance?.exportController || appInstance?.uiController?.exportController;
        if (controller?.importJson) {
            controller.importJson();
        }
    },

    openSyncModal() {
        if (appInstance?.openSyncModal) {
            appInstance.openSyncModal();
        } else if (appInstance?.uiController?.openSyncModal) {
            appInstance.uiController.openSyncModal();
        }
    },

    startDbAudit() {
        const controller = appInstance?.maintenanceController || appInstance?.uiController?.maintenanceController;
        if (controller?.startDbAudit) {
            controller.startDbAudit();
        } else if (appInstance?.openDbAuditModal) {
            appInstance.openDbAuditModal();
        }
    },

    restoreBackup() {
        const controller = appInstance?.maintenanceController || appInstance?.uiController?.maintenanceController;
        if (controller?.restoreFromBackup) {
            controller.restoreFromBackup();
        } else if (controller?.restoreBackup) {
            controller.restoreBackup();
        }
    },

    forceBackup() {
        const controller = appInstance?.maintenanceController || appInstance?.uiController?.maintenanceController;
        if (controller?.performManualBackup) {
            controller.performManualBackup();
        } else if (controller?.forceBackup) {
            controller.forceBackup();
        }
    },

    wipeDatabase() {
        const controller = appInstance?.maintenanceController || appInstance?.uiController?.maintenanceController;
        if (controller?.wipeDatabase) {
            controller.wipeDatabase();
        }
    },

    handleQueueClick() {
        if (appInstance?.handleQueueClick) {
            appInstance.handleQueueClick();
        } else if (appInstance?.uiController?._handleQueueClick) {
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
    openWorkModal(id = null) {
        if (appInstance?.workLogRenderer?.openModal) {
            appInstance.workLogRenderer.openModal(id);
        }
    },

    closeWorkModal() {
        if (appInstance?.workLogRenderer?.closeModal) {
            appInstance.workLogRenderer.closeModal();
        }
    },

    deleteWorkLog() {
        if (appInstance?.workLogRenderer?.handleDeleteWork) {
            appInstance.workLogRenderer.handleDeleteWork();
        }
    },

    submitWorkForm(event) {
        if (appInstance?.workLogRenderer?.handleFormSubmit) {
            appInstance.workLogRenderer.handleFormSubmit(event);
        }
    },

    /** AI Modal Actions */
    closeAiModal() {
        if (appInstance?.aiModal?.close) {
            appInstance.aiModal.close();
        }
    },

    async analyzeAiEntry(text) {
        if (!appInstance?.aiModal?.analyze) {
            throw new Error("AI Modul nem elérhető.");
        }
        return await appInstance.aiModal.analyze(text);
    },

    async confirmAiEntry(data) {
        if (appInstance?.aiModal?.confirmAndInsert) {
            return await appInstance.aiModal.confirmAndInsert(data);
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
    },

    /** Settings & UI Controller Actions */
    togglePanel(panelId) {
        if (appInstance?.togglePanel) {
            appInstance.togglePanel(panelId);
        } else if (appInstance?.uiController?.togglePanel) {
            appInstance.uiController.togglePanel(panelId);
        }
    },

    handleGoogleClientSave() {
        if (appInstance?.handleGoogleClientSave) {
            appInstance.handleGoogleClientSave();
        } else if (appInstance?.uiController?._handleGoogleClientSave) {
            appInstance.uiController._handleGoogleClientSave();
        }
    },

    testSupabaseConnection() {
        if (appInstance?.testSupabaseConnection) {
            appInstance.testSupabaseConnection();
        } else if (appInstance?.uiController?._testSupabaseConnection) {
            appInstance.uiController._testSupabaseConnection();
        }
    },

    handleSettingsSave() {
        if (appInstance?.handleSettingsSave) {
            appInstance.handleSettingsSave();
        } else if (appInstance?.uiController?._handleSettingsSave) {
            appInstance.uiController._handleSettingsSave();
        }
    },

    applyDarkMode(isDark) {
        if (appInstance?.applyDarkMode) {
            appInstance.applyDarkMode(isDark);
        } else if (appInstance?.uiController?.applyDarkMode) {
            appInstance.uiController.applyDarkMode(isDark);
        }
    },

    applyBgTheme(theme) {
        if (appInstance?.applyBgTheme) {
            appInstance.applyBgTheme(theme);
        } else if (appInstance?.uiController?.applyBgTheme) {
            appInstance.uiController.applyBgTheme(theme);
        }
    },

    updateBgThemeSelectorUI(theme) {
        if (appInstance?.updateBgThemeSelectorUI) {
            appInstance.updateBgThemeSelectorUI(theme);
        } else if (appInstance?.uiController?.updateBgThemeSelectorUI) {
            appInstance.updateBgThemeSelectorUI(theme);
        }
    },

    /** Logging & Notifications */
    logEvent(category, level, message) {
        if (appInstance?.logger?.log) {
            appInstance.logger.log(category, level, message);
        }
    },

    exportLogsToText() {
        if (appInstance?.logger?.exportToText) {
            return appInstance.logger.exportToText();
        }
        return null;
    },

    async showConfirm(options) {
        if (appInstance?.hmiNotif?.showConfirm) {
            return await appInstance.hmiNotif.showConfirm(options);
        }
        return false;
    },

    clearLogs() {
        if (appInstance?.logger?.clear) {
            appInstance.logger.clear();
        }
    },

    renderLogs() {
        if (appInstance?.renderLogs) {
            appInstance.renderLogs();
        } else if (appInstance?.uiController?.renderLogs) {
            appInstance.uiController.renderLogs();
        }
    },

    /** Security Guard Actions */
    verifyAndUpgradeToOwner(password) {
        if (appInstance?.securityGuard?._verifyAndUpgradeToOwner) {
            appInstance.securityGuard._verifyAndUpgradeToOwner(password);
        }
    },

    lockApp() {
        if (appInstance?.securityGuard?.lock) {
            appInstance.securityGuard.lock();
        }
    },

    saveSecuritySettings() {
        if (appInstance?.securityGuard?.saveSettingsFromUI) {
            appInstance.securityGuard.saveSettingsFromUI();
        }
    },

    populateSecurityForm() {
        if (appInstance?.securityGuard?.populateForm) {
            appInstance.securityGuard.populateForm();
        }
    },

    /** AI Config & Module Management */
    setAiConfig(aiConfig) {
        if (appInstance?.config) {
            appInstance.config.aiConfig = aiConfig;
        }
    },

    renderModuleSettingsUI() {
        if (appInstance?.moduleManager?.renderModuleSettingsUI) {
            appInstance.moduleManager.renderModuleSettingsUI();
        }
    },

    getFuelLogModule() {
        if (appInstance?.moduleManager?.modules?.get) {
            return appInstance.moduleManager.modules.get('plugin_fuel_log') || appInstance.moduleManager.modules.get('plugin_fuel') || null;
        }
        return null;
    }
};
