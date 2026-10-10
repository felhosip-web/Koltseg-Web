// src/services/plugin/PluginRegistry.js
// Host-side PluginRegistry and Lifecycle Foundation (PLG1)

import { validatePluginManifest } from './PluginManifestValidator.js';
import { createPluginContext } from './PluginCapabilityFactory.js';

/**
 * Recursively freezes an object and all nested objects/arrays to guarantee immutability.
 * @param {Object} obj
 * @returns {Object} Deeply frozen object
 */
function deepFreeze(obj) {
    if (obj && typeof obj === 'object') {
        Object.freeze(obj);
        for (const prop of Object.getOwnPropertyNames(obj)) {
            if (obj[prop] !== null && (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') && !Object.isFrozen(obj[prop])) {
                deepFreeze(obj[prop]);
            }
        }
    }
    return obj;
}

/**
 * Creates an immutable, deeply frozen public DTO snapshot of a plugin record.
 * Encapsulates internal registry references (setup callback, context, initPromise).
 * @param {Object|null} record
 * @returns {Object|null} Deeply frozen DTO snapshot
 */
function createRecordSnapshot(record) {
    if (!record) return null;
    return deepFreeze({
        manifest: record.manifest, // deeply frozen manifest contract
        state: record.state,
        error: record.error || null,
        registeredAt: record.registeredAt
    });
}

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
     * Stored manifest contract is deeply frozen to prevent post-validation permission mutations.
     * Returns an immutable public DTO snapshot to prevent caller mutation of internal registry records.
     * @param {Object} manifest - Declarative plugin manifest contract
     * @param {Function|null} setup - Optional setup function receiving restricted context
     * @returns {Object} Immutable plugin record DTO snapshot
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

        // Deep copy and deeply freeze manifest to enforce strict permission immutability
        const frozenManifest = deepFreeze(JSON.parse(JSON.stringify(manifest)));

        const pluginRecord = {
            manifest: frozenManifest,
            setup: setup || null,
            state: 'registered', // 'registered' | 'initialized' | 'active' | 'disposed'
            context: null,
            error: null,
            initPromise: null,
            registeredAt: new Date().toISOString()
        };

        this.plugins.set(manifest.id, pluginRecord);
        return createRecordSnapshot(pluginRecord);
    }

    /**
     * Initializes a registered plugin, executes setup (sync or async) with restricted PluginContext, and transitions to "active".
     * Returns a Promise resolving to an immutable DTO snapshot across all code paths.
     * Concurrent calls to initialize() return the exact same in-flight Promise object (p1 === p2).
     * On setup failure (sync throw or async rejection), rolls back state cleanly to "registered" without leaving a half-initialized state.
     * Disposal during pending initialization is handled safely and prevents reactivation.
     * @param {string} pluginId
     * @returns {Promise<Object>} Immutable plugin record DTO snapshot promise
     */
    initialize(pluginId) {
        try {
            if (!pluginId || typeof pluginId !== 'string') {
                return Promise.reject(new Error('[PluginRegistry] Valid pluginId is required for initialize.'));
            }

            const record = this.plugins.get(pluginId);
            if (!record) {
                return Promise.reject(new Error(`[PluginRegistry] Cannot initialize unregistered plugin "${pluginId}".`));
            }

            if (record.state === 'disposed') {
                return Promise.reject(new Error(`[PluginRegistry] Cannot initialize disposed plugin "${pluginId}".`));
            }

            if (record.state === 'active') {
                return Promise.resolve(createRecordSnapshot(record));
            }

            // Handle concurrent initialization: return the EXACT same in-flight Promise object
            if (record.initPromise) {
                return record.initPromise;
            }

            // 1. Build restricted PluginContext based on validated, immutable manifest permissions
            const context = createPluginContext(record.manifest, {
                storageService: this.storageService,
                appService: this.appService
            });

            // 2. Mark as initialized and start async setup tracking
            record.state = 'initialized';

            let initPromiseRef;
            const initPromise = (async () => {
                // Yield microtask tick so initPromise is assigned to record.initPromise before setup/finally runs
                await Promise.resolve();
                try {
                    if (record.setup) {
                        await record.setup(context);
                    }

                    // Check if plugin was disposed during setup execution
                    if (record.state === 'disposed') {
                        throw new Error(`[PluginRegistry] Plugin "${pluginId}" was disposed during initialization.`);
                    }

                    record.context = context;
                    record.state = 'active';
                    record.error = null;
                    return createRecordSnapshot(record);
                } catch (err) {
                    // Setup failure or disposal during setup rollback
                    if (record.state !== 'disposed') {
                        record.state = 'registered';
                        record.context = null;
                        record.error = err;
                    }
                    throw err;
                } finally {
                    if (record.initPromise === initPromiseRef) {
                        record.initPromise = null;
                    }
                }
            })();

            initPromiseRef = initPromise;
            record.initPromise = initPromise;

            return initPromise;
        } catch (syncErr) {
            return Promise.reject(syncErr);
        }
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
        record.initPromise = null;
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
     * Retrieves an immutable DTO snapshot of a plugin record by ID.
     * @param {string} pluginId
     * @returns {Object|null} Immutable DTO snapshot
     */
    get(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') return null;
        const record = this.plugins.get(pluginId);
        return createRecordSnapshot(record);
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
     * Lists all registered plugins as immutable DTO snapshots.
     * @returns {Array<Object>} List of immutable plugin DTO summaries
     */
    list() {
        return Array.from(this.plugins.values()).map(createRecordSnapshot);
    }
}
