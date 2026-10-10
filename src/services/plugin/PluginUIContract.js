// src/services/plugin/PluginUIContract.js
/**
 * Plugin UI Contract Definition & Validation (PLG2)
 * Defines a minimal, typed-by-contract interface for a plugin's React UI.
 *
 * Invariants:
 * - React components and executable render functions MUST NOT be stored in plugin manifests or persisted records.
 * - Manifest permissions and storage remain strictly in PLG1 PluginRegistry and PluginStorageService.
 */

/**
 * Validates a plugin UI registration contract.
 * @param {Object} uiContract - Plugin UI contract object
 * @returns {boolean} True if contract is valid
 * @throws {Error} If validation fails
 */
export function validatePluginUIContract(uiContract) {
    if (!uiContract || typeof uiContract !== 'object' || Array.isArray(uiContract)) {
        throw new Error('[PluginUIContract] UI contract must be a non-null object.');
    }

    const { pluginId, title, icon, category, hasUI, component } = uiContract;

    // 1. Stable Plugin ID
    if (!pluginId || typeof pluginId !== 'string' || !pluginId.trim()) {
        throw new Error('[PluginUIContract] Missing or invalid "pluginId". Must be a non-empty string.');
    }

    if (!/^[a-z0-9_.-]+$/i.test(pluginId)) {
        throw new Error(`[PluginUIContract] Invalid pluginId format: "${pluginId}".`);
    }

    const effectiveHasUI = hasUI !== false && component !== null && component !== undefined;

    // 2. Explicit handling for plugins with no UI
    if (!effectiveHasUI) {
        if (hasUI === true) {
            throw new Error(`[PluginUIContract] Plugin "${pluginId}" specified "hasUI: true" but provided no render component.`);
        }
        return true;
    }

    // 3. Display metadata needed by host
    if (!title || typeof title !== 'string' || !title.trim()) {
        throw new Error(`[PluginUIContract] Plugin "${pluginId}" must specify a non-empty "title" string when providing a UI.`);
    }

    if (icon !== undefined && icon !== null && typeof icon !== 'string') {
        throw new Error(`[PluginUIContract] Plugin "${pluginId}" icon must be a string if provided.`);
    }

    if (category !== undefined && category !== null && typeof category !== 'string') {
        throw new Error(`[PluginUIContract] Plugin "${pluginId}" category must be a string if provided.`);
    }

    // 4. React component render entry point
    const isComponent = typeof component === 'function' || (typeof component === 'object' && component !== null);
    if (!isComponent) {
        throw new Error(`[PluginUIContract] Plugin "${pluginId}" component must be a valid React component or render function.`);
    }

    return true;
}

/**
 * Creates a frozen DTO snapshot for a validated UI contract entry.
 * @param {Object} uiContract
 * @returns {Object} Immutable UI contract DTO
 */
export function createPluginUIDTO(uiContract) {
    validatePluginUIContract(uiContract);

    const effectiveHasUI = uiContract.hasUI !== false && uiContract.component !== null && uiContract.component !== undefined;

    const dto = {
        pluginId: uiContract.pluginId,
        title: effectiveHasUI ? uiContract.title.trim() : null,
        icon: uiContract.icon ? String(uiContract.icon).trim() : 'fas fa-plug',
        category: uiContract.category ? String(uiContract.category).trim() : 'general',
        hasUI: effectiveHasUI,
        component: effectiveHasUI ? uiContract.component : null
    };

    return Object.freeze(dto);
}
