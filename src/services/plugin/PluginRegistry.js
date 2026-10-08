// src/services/plugin/PluginRegistry.js
// Host-side PluginRegistry and Lifecycle Foundation (PLG1)

import { validatePluginManifest } from './PluginManifestValidator.js';
import { createPluginContext } from './PluginCapabilityFactory.js';

export class PluginRegistry {
    /**
     * @param {Object} storageService - PluginStorageService instance
     * @param {Object} appService - AppService / Host interface instance
     */
    constructor(storageService = null, appService = null) {
        this.storageService = storageService;
        this.appService = appService;
        this.plugins = new Map();
    }

    /**
     * Updates injected dependencies.
     * @param {Object} storageService
     * @param {Object} appService
     */
    setDependencies(storageService, appService) {
        if (storageService) this.storageService = storageService;
        if (appService) this.appService = appService;
    }

    /**
     * Registers a plugin in the registry with state "registered".
     * @param {Object} manifest - Declarative plugin manifest contract
     * @param {Function|null} setup - Optional setup function receiving restricted context
     * @returns {Object} Plugin record
     */
    register(manifest, setup = null) {
        // 1. Validate manifest contract
        validatePluginManifest(manifest);

        // 2. Validate setup argument type if provided
        if (setup !== null && setup !== undefined && typeof setup !== 'function') {
            throw new Error(`[PluginRegistry] Invalid setup for plugin "${manifest.id}". Setup must be a function or null.`);
        }

        // 3. Prevent duplicate plugin IDs
        if (this.plugins.has(manifest.id)) {
            throw new Error(`[PluginRegistry] Plugin with ID "${manifest.id}" is already registered.`);
        }

        const pluginRecord = {
            manifest: Object.freeze(JSON.parse(JSON.stringify(manifest))),
            setup: setup || null,
            state: 'registered', // 'registered' | 'initialized' | 'active' | 'disposed'
            context: null,
            error: null,
            registeredAt: new Date().toISOString()
        };

        this.plugins.set(manifest.id, pluginRecord);
        return pluginRecord;
    }

    /**
     * Initializes a registered plugin, executes setup with restricted PluginContext, and transitions to "active".
     * On setup failure, rolls back state cleanly to "registered" without leaving a half-initialized state.
     * @param {string} pluginId
     * @returns {Object} Plugin record
     */
    initialize(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') {
            throw new Error('[PluginRegistry] Valid pluginId is required for initialize.');
        }

        const record = this.plugins.get(pluginId);
        if (!record) {
            throw new Error(`[PluginRegistry] Cannot initialize unregistered plugin "${pluginId}".`);
        }

        if (record.state === 'disposed') {
            throw new Error(`[PluginRegistry] Cannot initialize disposed plugin "${pluginId}".`);
        }

        if (record.state === 'active') {
            return record;
        }

        // 1. Build restricted PluginContext based on manifest permissions
        const context = createPluginContext(record.manifest, {
            storageService: this.storageService,
            appService: this.appService
        });

        // 2. Run setup function if defined
        if (record.setup) {
            record.state = 'initialized';
            try {
                record.setup(context);
            } catch (err) {
                // Setup failure rollback: ensure no half-initialized state remains
                record.state = 'registered';
                record.context = null;
                record.error = err;
                throw err;
            }
        }

        // 3. Mark as active on successful setup completion
        record.context = context;
        record.state = 'active';
        record.error = null;

        return record;
    }

    /**
     * Disposes an active or initialized plugin. Idempotent operation.
     * @param {string} pluginId
     * @returns {boolean} True if plugin exists and is disposed
     */
    dispose(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return false;

        const record = this.plugins.get(pluginId);
        if (!record) return false;

        if (record.state === 'disposed') {
            return true; // Idempotent: double dispose returns true without error
        }

        record.state = 'disposed';
        record.context = null;
        return true;
    }

    /**
     * Unregisters a plugin from the registry after disposing it.
     * @param {string} pluginId
     * @returns {boolean} True if successfully removed
     */
    unregister(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return false;
        if (this.plugins.has(pluginId)) {
            this.dispose(pluginId);
            this.plugins.delete(pluginId);
            return true;
        }
        return false;
    }

    /**
     * Retrieves a plugin record by ID.
     * @param {string} pluginId
     * @returns {Object|null}
     */
    get(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return null;
        return this.plugins.get(pluginId) || null;
    }

    /**
     * Checks if a plugin ID is registered.
     * @param {string} pluginId
     * @returns {boolean}
     */
    has(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return false;
        return this.plugins.has(pluginId);
    }

    /**
     * Lists all registered plugins.
     * @returns {Array<Object>} List of plugin summaries
     */
    list() {
        return Array.from(this.plugins.values()).map(p => ({
            manifest: p.manifest,
            state: p.state,
            error: p.error
        }));
    }
}
