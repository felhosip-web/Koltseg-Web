// src/services/plugin/PluginCapabilityFactory.js
// Host-side Central Capability Factory for PLG1 PluginContext

import { convertAmount } from '../../utils/currency-utils.js';

/**
 * Creates an isolated, restricted PluginContext containing host-enforced capabilities.
 * @param {Object} manifest - Validated plugin manifest contract
 * @param {Object} dependencies - Host services ({ storageService, appService })
 * @returns {Object} Frozen PluginContext
 */
export function createPluginContext(manifest, { storageService = null, appService = null } = {}) {
    const grantedPermissions = new Set(manifest.permissions || []);
    const boundPluginId = String(manifest.id);

    // 1. Scoped Storage Capability
    let storage = null;
    if (grantedPermissions.has('storage:private')) {
        if (storageService) {
            storage = storageService.createPluginStorage(boundPluginId);
        }
    }

    // 2. Scoped UI Capability
    const ui = Object.freeze({
        showToast(message, type = 'info') {
            if (!grantedPermissions.has('ui:toast')) {
                throw new Error(`[PluginContext] Plugin "${boundPluginId}" lacks "ui:toast" permission.`);
            }
            if (appService && typeof appService.showToast === 'function') {
                appService.showToast(message, type);
            }
        }
    });

    // 3. Scoped Host API Capability
    const api = Object.freeze({
        getCategoryList() {
            if (!grantedPermissions.has('expenses:read')) {
                throw new Error(`[PluginContext] Plugin "${boundPluginId}" lacks "expenses:read" permission.`);
            }
            const appInstance = appService?.getAppInstance?.() || appService;
            const items = appInstance?.items?.items || [];
            return JSON.parse(JSON.stringify(items));
        }
    });

    // 4. Scoped Currency Capability (currency:read)
    let currency = null;
    if (grantedPermissions.has('currency:read')) {
        currency = Object.freeze({
            getRate() {
                const state = appService?.getExchangeRateState?.();
                const rate = state?.rate;
                if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
                    return rate;
                }
                return null;
            },
            getStatus() {
                const state = appService?.getExchangeRateState?.();
                if (state && state.status) {
                    return state.status;
                }
                return 'error';
            },
            getPrimaryCurrency() {
                if (appService && typeof appService.getPrimaryCurrency === 'function') {
                    return appService.getPrimaryCurrency();
                }
                const appInstance = appService?.getAppInstance?.() || appService;
                return appInstance?.config?.primaryCurrency || 'HUF';
            },
            convert(amount, fromCurrency, toCurrency) {
                const rate = this.getRate();
                return convertAmount(amount, fromCurrency, toCurrency, rate);
            },
            subscribe(listener) {
                if (typeof listener !== 'function') return () => {};
                if (appService && typeof appService.subscribeExchangeRate === 'function') {
                    return appService.subscribeExchangeRate(() => {
                        listener({
                            rate: this.getRate(),
                            status: this.getStatus(),
                            primaryCurrency: this.getPrimaryCurrency()
                        });
                    });
                }
                return () => {};
            }
        });
    }

    // Construct restricted PluginContext
    const context = Object.freeze({
        storage,
        ui,
        api,
        currency
    });

    return context;
}
