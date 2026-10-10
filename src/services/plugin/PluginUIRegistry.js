// src/services/plugin/PluginUIRegistry.js
/**
 * Host-side Plugin UI Registry (PLG2)
 * Maps stable plugin IDs to trusted first-party React UI definitions.
 * Integrates with PLG1 PluginRegistry without introducing a parallel lifecycle.
 */

import { useSyncExternalStore } from 'react';
import { validatePluginUIContract, createPluginUIDTO } from './PluginUIContract.js';

export class PluginUIRegistry {
    /** @type {Map<string, Object>} Private internal map of pluginId -> UI DTO */
    #uiEntries = new Map();
    /** @type {Set<Function>} Private listeners set */
    #listeners = new Set();
    /** @type {Array<Object>} Private cached frozen list snapshot for useSyncExternalStore immutability */
    #cachedList = Object.freeze([]);

    /**
     * Subscribes a listener to UI registry changes (registration / unregistration).
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        if (typeof listener === 'function') {
            this.#listeners.add(listener);
            return () => {
                this.#listeners.delete(listener);
            };
        }
        return () => {};
    }

    #notifyListeners() {
        this.#cachedList = Object.freeze(Array.from(this.#uiEntries.values()));
        for (const listener of this.#listeners) {
            try {
                listener();
            } catch (e) {
                console.error('[PluginUIRegistry] Listener notification error:', e);
            }
        }
    }

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
        this.#notifyListeners();
        return dto;
    }

    /**
     * Unregisters a plugin UI entry.
     * @param {string} pluginId
     * @returns {boolean} True if removed
     */
    unregisterUI(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return false;
        const removed = this.#uiEntries.delete(pluginId);
        if (removed) {
            this.#notifyListeners();
        }
        return removed;
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
     * Returns a cached deeply frozen immutable array snapshot reference for React useSyncExternalStore compatibility.
     * @returns {ReadonlyArray<Object>} Immutable frozen list of registered UI DTOs
     */
    listUI() {
        return this.#cachedList;
    }

    /**
     * Clears all registered UI definitions. Useful for tests.
     */
    clear() {
        const hadEntries = this.#uiEntries.size > 0;
        this.#uiEntries.clear();
        this.#cachedList = Object.freeze([]);
        if (hadEntries) {
            this.#notifyListeners();
        }
    }
}

/**
 * React Hook to subscribe to a PluginUIRegistry instance's changes.
 * @param {PluginUIRegistry|null} [uiReg]
 * @returns {ReadonlyArray<Object>} Immutable list of registered UI DTOs
 */
export function usePluginUIList(uiReg = null) {
    const EMPTY_LIST = Object.freeze([]);
    return useSyncExternalStore(
        (onStoreChange) => uiReg ? uiReg.subscribe(onStoreChange) : () => {},
        () => uiReg ? uiReg.listUI() : EMPTY_LIST,
        () => uiReg ? uiReg.listUI() : EMPTY_LIST
    );
}
