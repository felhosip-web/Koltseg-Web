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
     * Updates system status in the React Zustand store and app instance.
     * @param {string} text Status text
     * @param {boolean} isError Whether this represents an error state
     */
    updateFooterStatus(text, isError = false) {
        if (appInstance?.setSystemStatus) {
            appInstance.setSystemStatus(text, isError);
        } else if (typeof useAppStore?.getState === 'function') {
            useAppStore.getState().setSystemStatus(text, isError);
        }
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
        }
    },

    deleteRowSequence(itemId, itemName) {
        if (appInstance?.handleRowDeleteSequence) {
            appInstance.handleRowDeleteSequence(itemId, itemName);
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
        }
    },

    openInputModal(type) {
        if (appInstance?.inputModal?.open) {
            appInstance.inputModal.open(type);
        }
    },

    async performInputModalSave(type, value, color) {
        if (appInstance?.inputModal?.performSave) {
            return await appInstance.inputModal.performSave(type, value, color);
        }
        return false;
    },

    async performInputModalRename(itemId, currentName, newName) {
        if (appInstance?.inputModal?.performRename) {
            return await appInstance.inputModal.performRename(itemId, currentName, newName);
        }
        return false;
    },

    resetAndRefreshCellModal() {
        const controller = appInstance?.cellModal;
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
        const controller = appInstance?.exportController;
        if (controller?.exportExcel) {
            controller.exportExcel();
        }
    },

    exportPdf() {
        const controller = appInstance?.exportController;
        if (controller?.exportPdf) {
            controller.exportPdf();
        }
    },

    exportJson() {
        const controller = appInstance?.exportController;
        if (controller?.exportJson) {
            controller.exportJson();
        }
    },

    importJson() {
        const controller = appInstance?.exportController;
        if (controller?.importJson) {
            controller.importJson();
        }
    },

    openSyncModal() {
        if (appInstance?.openSyncModal) {
            appInstance.openSyncModal();
        }
    },

    startDbAudit() {
        const controller = appInstance?.maintenanceController;
        if (controller?.startDbAudit) {
            controller.startDbAudit();
        } else if (appInstance?.openDbAuditModal) {
            appInstance.openDbAuditModal();
        }
    },

    restoreBackup() {
        const controller = appInstance?.maintenanceController;
        if (controller?.restoreFromBackup) {
            controller.restoreFromBackup();
        } else if (controller?.restoreBackup) {
            controller.restoreBackup();
        }
    },

    forceBackup() {
        const controller = appInstance?.maintenanceController;
        if (controller?.performManualBackup) {
            controller.performManualBackup();
        } else if (controller?.forceBackup) {
            controller.forceBackup();
        }
    },

    wipeDatabase() {
        const controller = appInstance?.maintenanceController;
        if (controller?.wipeDatabase) {
            controller.wipeDatabase();
        }
    },

    handleQueueClick() {
        if (appInstance?.handleQueueClick) {
            appInstance.handleQueueClick();
        }
    },

    /** Incoming actions */
    addNewIncomingEntry() {
        if (appInstance?.incomingManager?.addNewEntry) {
            appInstance.incomingManager.addNewEntry();
        }
    },

    handleIncomingCellClick(element) {
        if (appInstance?.incomingManager?._handleCellClick) {
            appInstance.incomingManager._handleCellClick(element);
        }
    },

    deleteIncomingColumn(date) {
        if (appInstance?.incomingManager?.deleteColumn) {
            appInstance.incomingManager.deleteColumn(date);
        }
    },

    deleteIncomingRow(sender) {
        if (appInstance?.incomingManager?.deleteRow) {
            appInstance.incomingManager.deleteRow(sender);
        }
    },

    /** Reminder actions */
    async createReminder(data) {
        if (!data || !data.title || !data.title.trim()) {
            await appInstance?.hmiNotif?.showInfo?.('Hiányzó adatok', 'A határidő címe nem lehet üres!');
            return;
        }
        if (isNaN(data.amount) || data.amount <= 0) {
            await appInstance?.hmiNotif?.showInfo?.('Hiányzó adatok', 'Az összegnek nagyobbnak kell lennie nullánál!');
            return;
        }
        if (!data.due_date || Number.isNaN(new Date(data.due_date).getTime())) {
            await appInstance?.hmiNotif?.showInfo?.('Hiányzó adatok', 'Érvénytelen határidő dátum!');
            return;
        }

        if (appInstance?.reminderManager?.add) {
            await appInstance.reminderManager.add(data);
            appInstance.updateReactStore?.();
            appInstance.updateReminderStatus?.();
            appInstance.hmiNotif?.showToast?.('Határidő rögzítve!', 'success');
        }
    },

    async updateReminder(data) {
        if (!data || !data.id) return;
        if (!data.title || !data.title.trim()) {
            await appInstance?.hmiNotif?.showInfo?.('Hiányzó adatok', 'A határidő címe nem lehet üres!');
            return;
        }
        if (isNaN(data.amount) || data.amount <= 0) {
            await appInstance?.hmiNotif?.showInfo?.('Hiányzó adatok', 'Az összegnek nagyobbnak kell lennie nullánál!');
            return;
        }

        if (appInstance?.reminderManager) {
            const rem = appInstance.reminderManager.reminders.find(r => String(r.id) === String(data.id));
            if (rem) {
                Object.assign(rem, {
                    title: data.title.trim(),
                    amount: data.amount,
                    currency: data.currency || 'HUF',
                    due_date: data.due_date,
                    frequency: data.frequency || 'once',
                    updated_at: new Date().toISOString()
                });
                await appInstance.reminderManager.db.save('reminders', rem);
                try {
                    await appInstance.reminderManager.syncService.push('reminders', rem);
                } catch (syncErr) {
                    console.warn('[appService] Cloud push failed after local update save:', syncErr);
                }
                await appInstance.reminderManager.load();
                appInstance.updateReactStore?.();
                appInstance.updateReminderStatus?.();
                appInstance.hmiNotif?.showToast?.('Határidő frissítve!', 'success');
            }
        }
    },

    async deleteReminder(id) {
        if (!appInstance?.reminderManager) return;
        const rem = appInstance.reminderManager.reminders.find(r => String(r.id) === String(id));
        if (!rem) return;

        const confirmed = await appInstance.hmiNotif?.showConfirm?.({
            title: 'Határidő törlése',
            message: `Biztosan törli a "${rem.title}" határidőt?`,
            type: 'warning',
            confirmText: 'Törlés'
        });

        if (confirmed) {
            await appInstance.reminderManager.delete(id);
            appInstance.updateReactStore?.();
            appInstance.updateReminderStatus?.();
        }
    },

    async completeReminder(id) {
        if (!appInstance?.reminderManager) return;
        const rem = appInstance.reminderManager.reminders.find(r => String(r.id) === String(id));
        if (!rem) return;

        await appInstance.reminderManager.markAsCompleted(id);
        appInstance.updateReactStore?.();
        appInstance.updateReminderStatus?.();

        const logAsExpense = await appInstance.hmiNotif?.showConfirm?.({
            title: '💸 Kiadás rögzítése?',
            message: `Szeretnéd a(z) "${rem.title}" (${rem.amount.toLocaleString('hu-HU')} ${rem.currency || 'HUF'}) határidőt kiadásként is automatikusan rögzíteni a táblázatban?`,
            type: 'success',
            confirmText: 'Igen, rögzítsük',
            cancelText: 'Nem szükséges'
        });

        if (logAsExpense) {
            const categories = appInstance.items?.items || [];
            if (categories.length === 0) {
                appInstance.hmiNotif?.showToast?.('Nincsenek kategóriák rögzítve az adatlapon!', 'error');
                return;
            }

            const categoryNames = categories.map(c => c.name);
            const selectedCatName = await appInstance.hmiNotif?.showSelectModal?.({
                title: 'Válaszd ki a kategóriát',
                options: categoryNames,
                placeholder: 'Kategória kiválasztása...'
            });

            if (selectedCatName) {
                const selectedCat = categories.find(c => c.name === selectedCatName);
                if (selectedCat) {
                    const month = rem.due_date.substring(0, 7);
                    const cellBaseKey = `${selectedCat.id}_${month}`;
                    const cellKey = `${cellBaseKey}_${Date.now()}`;

                    const entryData = {
                        cellKey,
                        itemId: selectedCat.id,
                        month: month,
                        amount: rem.amount,
                        currency: rem.currency || 'HUF',
                        paymentMethod: 'Kártya',
                        note: rem.title,
                        color: 'transparent',
                        timestamp: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    await appInstance.entries.saveEntry(entryData);
                    await appInstance.entries.load();

                    appInstance.updateReactStore?.();
                    this.updateFooterStatus('Határidő teljesítve és kiadásként rögzítve!', false);
                    appInstance.hmiNotif?.showToast?.('Kiadás sikeresen rögzítve!', 'success');
                }
            }
        } else {
            appInstance.hmiNotif?.showToast?.('Határidő teljesítettnek jelölve!', 'success');
        }
    },

    /** Work App Actions */
    openWorkModal(id = null) {
        if (appInstance?.openWorkModal) {
            appInstance.openWorkModal(id);
        }
    },

    closeWorkModal() {
        if (appInstance?.closeWorkModal) {
            appInstance.closeWorkModal();
        }
    },

    deleteWorkLog() {
        if (appInstance?.deleteWorkLog) {
            appInstance.deleteWorkLog();
        }
    },

    submitWorkForm(event) {
        if (appInstance?.submitWorkForm) {
            appInstance.submitWorkForm(event);
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
        if (appInstance?.exportController?.exportWorkExcel) {
            appInstance.exportController.exportWorkExcel();
        }
    },

    exportWorkPdf() {
        if (appInstance?.exportController?.exportWorkPdf) {
            appInstance.exportController.exportWorkPdf();
        }
    },

    exportWorkJson() {
        if (appInstance?.exportController?.exportWorkJson) {
            appInstance.exportController.exportWorkJson();
        }
    },

    importWorkJson() {
        if (appInstance?.exportController?.importWorkJson) {
            appInstance.exportController.importWorkJson();
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
    },

    launchWorkApp() {
        if (typeof document !== 'undefined') {
            const workApp = document.getElementById('workAppView');
            if (workApp) workApp.classList.remove('hidden');
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('hmi_selected_module', 'work');
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
        }
    },

    handleGoogleClientSave() {
        if (appInstance?.handleGoogleClientSave) {
            appInstance.handleGoogleClientSave();
        }
    },

    testSupabaseConnection() {
        if (appInstance?.testSupabaseConnection) {
            appInstance.testSupabaseConnection();
        }
    },

    handleSettingsSave() {
        if (appInstance?.handleSettingsSave) {
            appInstance.handleSettingsSave();
        }
    },

    applyDarkMode(isDark) {
        if (appInstance?.applyDarkMode) {
            appInstance.applyDarkMode(isDark);
        }
    },

    applyBgTheme(theme) {
        if (appInstance?.applyBgTheme) {
            appInstance.applyBgTheme(theme);
        }
    },

    updateBgThemeSelectorUI(theme) {
        if (appInstance?.updateBgThemeSelectorUI) {
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
