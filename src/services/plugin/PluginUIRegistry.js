// src/services/plugin/PluginUIRegistry.js
/**
 * Host-side Plugin UI Registry (PLG2)
 * Maps stable plugin IDs to trusted first-party React UI definitions.
 * Integrates with PLG1 PluginRegistry without introducing a parallel lifecycle.
 */

import { validatePluginUIContract, createPluginUIDTO } from './PluginUIContract.js';

export class PluginUIRegistry {
    /** @type {Map<string, Object>} Private internal map of pluginId -> UI DTO */
    #uiEntries = new Map();

    /**
     * Registers a plugin's UI component and metadata.
     * @param {Object} uiContract - UI contract definition
     * @returns {Object} Immutable UI DTO
     */
    registerUI(uiContract) {
        validatePluginUIContract(uiContract);

        const dto = createPluginUIDTO(uiContract);

        if (this.#uiEntries.has(dto.pluginId)) {
            throw new Error(`[PluginUIRegistry] UI component for plugin "${dto.pluginId}" is already registered.`);
        }

        this.#uiEntries.set(dto.pluginId, dto);
        return dto;
    }

    /**
     * Unregisters a plugin UI entry.
     * @param {string} pluginId
     * @returns {boolean} True if removed
     */
    unregisterUI(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return false;
        return this.#uiEntries.delete(pluginId);
    }

    /**
     * Retrieves the registered UI DTO for a plugin ID.
     * @param {string} pluginId
     * @returns {Object|null} UI DTO or null if not registered / no UI
     */
    getUI(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return null;
        return this.#uiEntries.get(pluginId) || null;
    }

    /**
     * Checks if a plugin ID has a registered UI component.
     * @param {string} pluginId
     * @returns {boolean}
     */
    hasUI(pluginId) {
        const entry = this.getUI(pluginId);
        return Boolean(entry && entry.hasUI && entry.component);
    }

    /**
     * Lists all registered plugin UI entries.
     * @returns {Array<Object>} List of registered UI DTOs
     */
    listUI() {
        return Array.from(this.#uiEntries.values());
    }

    /**
     * Clears all registered UI definitions. Useful for tests.
     */
    clear() {
        this.#uiEntries.clear();
    }
}

export const pluginUIRegistry = new PluginUIRegistry();
