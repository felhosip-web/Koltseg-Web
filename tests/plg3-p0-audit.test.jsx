import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRegistry } from '../src/services/plugin/PluginRegistry.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';
import { PluginUIRegistry } from '../src/services/plugin/PluginUIRegistry.js';
import { PluginHost } from '../src/components/plugin/PluginHost.jsx';
import { appService } from '../src/services/appService.js';

function setupJSDOM() {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
        url: 'http://localhost/',
        runScripts: 'dangerously'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(globalThis, 'navigator', {
        value: dom.window.navigator,
        configurable: true,
        writable: true
    });
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    return dom;
}

test('PLG3-P0 — Synchronous Init Error Capture: Synchronous exception during initialize records error on plugin DTO', async () => {
    const failingStorageService = {
        createPluginStorage() {
            throw new Error('Database initialization failure');
        }
    };

    const registry = new PluginRegistry(failingStorageService);
    registry.register({
        id: 'sync.error.plugin',
        name: 'Sync Error Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    });

    await assert.rejects(async () => {
        await registry.initialize('sync.error.plugin');
    }, /Database initialization failure/);

    const record = registry.get('sync.error.plugin');
    assert.equal(record.state, 'registered');
    assert.ok(record.error, 'Sync exception MUST be recorded on record.error');
    assert.equal(record.error.message, 'Database initialization failure');
});

test('PLG3-P0 — PluginRuntime Facade Cleanup: disposePlugin and unregisterPlugin clean up across registry and UI registry', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();

    const mockApp = {
        pluginUIRegistry: uiRegistry
    };
    appService.bind(mockApp);

    const manifest = {
        id: 'facade.cleanup.plugin',
        name: 'Facade Cleanup Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    await runtime.registerPlugin(manifest);
    uiRegistry.registerUI({
        pluginId: 'facade.cleanup.plugin',
        title: 'Facade UI',
        hasUI: true,
        component: () => React.createElement('div', null, 'UI')
    });

    assert.equal(runtime.getPlugin('facade.cleanup.plugin').state, 'active');
    assert.equal(uiRegistry.hasUI('facade.cleanup.plugin'), true);

    // Test disposePlugin
    runtime.disposePlugin('facade.cleanup.plugin');
    assert.equal(runtime.getPlugin('facade.cleanup.plugin').state, 'disposed');

    // Test unregisterPlugin
    const unregistered = runtime.unregisterPlugin('facade.cleanup.plugin');
    assert.equal(unregistered, true);
    assert.equal(runtime.getPlugin('facade.cleanup.plugin'), null);
    assert.equal(uiRegistry.hasUI('facade.cleanup.plugin'), false);

    appService.unbind();
});

test('PLG3-P0 — PluginHost Strict Context Boundary: PluginHost relies strictly on registry.getContext without fallback context creation', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    registry.register({
        id: 'strict.context.plugin',
        name: 'Strict Context Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    });

    // Override getContext on registry to simulate a corrupted or missing context return
    registry.getContext = () => null;

    uiRegistry.registerUI({
        pluginId: 'strict.context.plugin',
        title: 'Strict Context Plugin',
        hasUI: true,
        component: () => React.createElement('div', null, 'Render Attempt')
    });

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'strict.context.plugin',
            registry,
            uiRegistry
        }));
    });

    const bodyHtml = rootEl.innerHTML;
    assert.equal(bodyHtml.includes('Bővítmény inicializálási hiba'), true);
    assert.equal(bodyHtml.includes('nem rendelkezik érvényes környezettel') || bodyHtml.includes('nem aktív') || bodyHtml.includes('PluginContext'), true);

    root.unmount();
    dom.window.close();
});

test('PLG3-P0 — PluginHost Synchronous Failed Status Derivation: Failed plugin status is derived immediately on initial render', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    registry.register({
        id: 'failed.sync.derive.plugin',
        name: 'Failed Derive Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, () => {
        throw new Error('Fatal setup error during test');
    });

    uiRegistry.registerUI({
        pluginId: 'failed.sync.derive.plugin',
        title: 'Failed Derive Plugin',
        hasUI: true,
        component: () => React.createElement('div', null, 'Content')
    });

    // Run initialize once to register error state on record DTO
    await registry.initialize('failed.sync.derive.plugin').catch(() => {});

    const record = registry.get('failed.sync.derive.plugin');
    assert.equal(record.state, 'registered');
    assert.equal(record.error.message, 'Fatal setup error during test');

    // Render PluginHost
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'failed.sync.derive.plugin',
            registry,
            uiRegistry
        }));
    });

    const bodyHtml = rootEl.innerHTML;
    assert.equal(bodyHtml.includes('Bővítmény inicializálási hiba'), true);
    assert.equal(bodyHtml.includes('Fatal setup error during test'), true);

    root.unmount();
    dom.window.close();
});

test('PLG3-P0 — Concurrent & Duplicate Init Protection: Simultaneous initialize calls return exact same Promise instance', async () => {
    let setupRuns = 0;
    let resolveSetup;
    const pendingPromise = new Promise(resolve => { resolveSetup = resolve; });

    const registry = new PluginRegistry();
    registry.register({
        id: 'concurrent.test.plugin',
        name: 'Concurrent Test Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, async () => {
        setupRuns++;
        await pendingPromise;
    });

    const p1 = registry.initialize('concurrent.test.plugin');
    const p2 = registry.initialize('concurrent.test.plugin');

    assert.strictEqual(p1, p2, 'Concurrent initialize calls MUST return the exact same Promise reference');

    resolveSetup();
    await Promise.all([p1, p2]);

    assert.equal(setupRuns, 1, 'Setup MUST execute exactly once');

    // Duplicate call when active
    const p3 = await registry.initialize('concurrent.test.plugin');
    assert.equal(p3.state, 'active');
    assert.equal(setupRuns, 1, 'Setup MUST NOT run again when already active');
});

test('PLG3-P0 — Unregister / Dispose During Pending Setup: Removed plugin does not become active or leak context', async () => {
    let resolveSetup;
    const pendingPromise = new Promise(resolve => { resolveSetup = resolve; });

    const registry = new PluginRegistry();
    registry.register({
        id: 'pending.unregister.plugin',
        name: 'Pending Unregister Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, async () => {
        await pendingPromise;
    });

    const initPromise = registry.initialize('pending.unregister.plugin');

    // Unregister while init is pending
    registry.unregister('pending.unregister.plugin');

    assert.equal(registry.has('pending.unregister.plugin'), false);

    resolveSetup();

    await assert.rejects(async () => {
        await initPromise;
    }, /was disposed during initialization/);

    assert.equal(registry.get('pending.unregister.plugin'), null);
    assert.equal(registry.getContext('pending.unregister.plugin'), null);
});

test('PLG3-P0 — Storage Data Removal Semantics: Unregistering plugin preserves data in IndexedDB unless explicitly cleared', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);

    await runtime.registerPlugin({
        id: 'persisted.data.plugin',
        name: 'Persisted Data Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    }, async (ctx) => {
        const coll = ctx.storage.collection('records');
        await coll.set('r1', { key: 'Important Data' });
    });

    // Unregister plugin from runtime
    runtime.unregisterPlugin('persisted.data.plugin');

    // Verify stored plugin_records entry still exists in DB
    const dbRecords = await db.getAll('plugin_records');
    assert.equal(dbRecords.length, 1);
    assert.equal(dbRecords[0].plugin_id, 'persisted.data.plugin');
    assert.equal(dbRecords[0].data.key, 'Important Data');

    dom.window.close();
});
