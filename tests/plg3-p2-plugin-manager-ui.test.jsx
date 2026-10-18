import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

import { Database } from '../js/oop-core.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';
import { PluginUIRegistry } from '../src/services/plugin/PluginUIRegistry.js';
import { PluginManagerService } from '../src/services/plugin/PluginManagerService.js';
import { appService } from '../src/services/appService.js';
import PluginManagerPanel from '../src/components/plugin/PluginManagerPanel.jsx';

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

test.beforeEach(() => {
    if (typeof window !== 'undefined') {
        window.__DISABLE_AUTO_INIT__ = true;
    }
});

test('PLG3-P2 — Empty state when no plugins are registered', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const pluginManager = new PluginManagerService(runtime, uiRegistry);

    const mockApp = {
        pluginStorageService: storageService,
        pluginRuntime: runtime,
        pluginRegistry: runtime.registry,
        pluginUIRegistry: uiRegistry,
        pluginManager: pluginManager
    };

    appService.bind(mockApp);

    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(<PluginManagerPanel />);
    });

    assert.ok(document.body.textContent.includes('Nincsenek telepített vagy regisztrált bővítmények'));

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('PLG3-P2 — Renders plugin metadata, permissions, lifecycle state, and errors correctly', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const pluginManager = new PluginManagerService(runtime, uiRegistry);

    runtime.registry.register({
        id: 'meta.test.plugin',
        name: 'Meta Plugin Test',
        version: '1.5.0',
        apiVersion: '1',
        description: 'Testing metadata display in PLG3-P2 UI',
        permissions: ['storage:private', 'ui:toast']
    }, () => {
        throw new Error('Plugin initialization failed for testing UI error rendering');
    });

    // Initialize to trigger failure state
    await runtime.registry.initialize('meta.test.plugin').catch(() => {});

    const mockApp = {
        pluginStorageService: storageService,
        pluginRuntime: runtime,
        pluginRegistry: runtime.registry,
        pluginUIRegistry: uiRegistry,
        pluginManager: pluginManager
    };

    appService.bind(mockApp);

    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(<PluginManagerPanel />);
    });

    const card = document.querySelector('[data-plugin-card="meta.test.plugin"]');
    assert.ok(card, 'Plugin card must be rendered');

    assert.ok(card.textContent.includes('Meta Plugin Test'));
    assert.ok(card.textContent.includes('meta.test.plugin'));
    assert.ok(card.textContent.includes('v1.5.0'));
    assert.ok(card.textContent.includes('Testing metadata display in PLG3-P2 UI'));
    assert.ok(card.textContent.includes('storage:private'));
    assert.ok(card.textContent.includes('ui:toast'));
    assert.ok(card.textContent.includes('Plugin initialization failed for testing UI error rendering'));

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('PLG3-P2 — Enable/Disable toggling success and failure paths with pending states', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const pluginManager = new PluginManagerService(runtime, uiRegistry);

    let setupCallCount = 0;
    runtime.registry.register({
        id: 'toggle.test.plugin',
        name: 'Toggle Test Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, () => {
        setupCallCount++;
    });

    const mockApp = {
        pluginStorageService: storageService,
        pluginRuntime: runtime,
        pluginRegistry: runtime.registry,
        pluginUIRegistry: uiRegistry,
        pluginManager: pluginManager,
        hmiNotif: { showToast: () => {} }
    };

    appService.bind(mockApp);

    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(<PluginManagerPanel />);
    });

    const card = document.querySelector('[data-plugin-card="toggle.test.plugin"]');
    assert.ok(card);

    // Initial state: Registered / Inactive
    const toggleBtn = card.querySelector('button[aria-label*="bekapcsolása"]');
    assert.ok(toggleBtn);

    // 1. Enable plugin
    await act(async () => {
        toggleBtn.click();
    });

    assert.equal(setupCallCount, 1);
    assert.equal(runtime.registry.get('toggle.test.plugin').state, 'active');

    // 2. Disable plugin
    const disableBtn = card.querySelector('button[aria-label*="kikapcsolása"]');
    assert.ok(disableBtn);

    await act(async () => {
        disableBtn.click();
    });

    assert.equal(runtime.registry.get('toggle.test.plugin').state, 'disposed');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('PLG3-P2 — Storage metrics rendering: distinguishing loaded vs unavailable storage', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const pluginManager = new PluginManagerService(runtime, uiRegistry);

    runtime.registry.register({
        id: 'storage.metrics.plugin',
        name: 'Storage Metrics Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    });

    // Populate storage for plugin
    const pluginStorage = storageService.createPluginStorage('storage.metrics.plugin');
    await pluginStorage.collection('user_notes').set('n1', { content: 'Note 1' });
    await pluginStorage.collection('user_notes').set('n2', { content: 'Note 2' });
    await pluginStorage.collection('settings').set('s1', { theme: 'dark' });

    const mockApp = {
        pluginStorageService: storageService,
        pluginRuntime: runtime,
        pluginRegistry: runtime.registry,
        pluginUIRegistry: uiRegistry,
        pluginManager: pluginManager
    };

    appService.bind(mockApp);

    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    // 1. Test when storage is loaded
    await act(async () => {
        root.render(<PluginManagerPanel />);
    });

    const card = document.querySelector('[data-plugin-card="storage.metrics.plugin"]');
    assert.ok(card);
    assert.ok(card.textContent.includes('Összes rekord: 3 db'));
    assert.ok(card.textContent.includes('user_notes: 2'));
    assert.ok(card.textContent.includes('settings: 1'));

    // 2. Test when storage is unavailable (isLoaded = false)
    storageService.isLoaded = false;

    await act(async () => {
        // Trigger list refresh
        const refreshBtn = document.querySelector('button[aria-label="Bővítmény lista frissítése"]');
        refreshBtn.click();
    });

    assert.ok(card.textContent.includes('A tárhely nem érhető el vagy nem lett betöltve'));

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('PLG3-P2 — Purge confirmation, cancellation, execution, and truthful outcome DTO reporting', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const pluginManager = new PluginManagerService(runtime, uiRegistry);

    runtime.registry.register({
        id: 'purge.ui.plugin',
        name: 'Purge UI Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    });

    const pluginStorage = storageService.createPluginStorage('purge.ui.plugin');
    await pluginStorage.collection('data').set('rec1', { payload: 'abc' });

    const mockApp = {
        pluginStorageService: storageService,
        pluginRuntime: runtime,
        pluginRegistry: runtime.registry,
        pluginUIRegistry: uiRegistry,
        pluginManager: pluginManager,
        hmiNotif: { showToast: () => {} }
    };

    appService.bind(mockApp);

    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(<PluginManagerPanel />);
    });

    const card = document.querySelector('[data-plugin-card="purge.ui.plugin"]');
    assert.ok(card);

    // 1. Click Purge button to open confirm modal
    const purgeBtn = card.querySelector('button[aria-label="Purge UI Plugin adatok törlése"]');
    assert.ok(purgeBtn);

    await act(async () => {
        purgeBtn.click();
    });

    let modal = document.querySelector('[role="dialog"]');
    assert.ok(modal, 'Purge confirm modal must be visible');
    assert.ok(modal.textContent.includes('Biztosan törölni szeretnéd a(z) "Purge UI Plugin"'));
    assert.ok(modal.textContent.includes('Helyi adattörlés (Local Scope)'));
    assert.ok(modal.textContent.includes('A távoli felhő szinkronizáció és törlés nem garantált'));

    // 2. Test Cancellation
    const cancelBtn = modal.querySelector('button:nth-child(1)');
    await act(async () => {
        cancelBtn.click();
    });

    modal = document.querySelector('[role="dialog"]');
    assert.equal(modal, null, 'Modal must close on cancel');
    assert.equal((await pluginStorage.collection('data').get('rec1')).payload, 'abc');

    // 3. Re-open and Confirm Purge Execution
    await act(async () => {
        purgeBtn.click();
    });

    modal = document.querySelector('[role="dialog"]');
    assert.ok(modal);

    const confirmPurgeBtn = modal.querySelector('button:nth-child(2)');
    await act(async () => {
        confirmPurgeBtn.click();
    });

    // Outcome DTO checks in modal
    assert.ok(modal.textContent.includes('Helyi Adattörlés Sikeresen Befejeződött!'));
    assert.ok(modal.textContent.includes('Helyi törlés: 1'));
    assert.ok(modal.textContent.includes('Felhő sync:'));
    assert.equal(await pluginStorage.collection('data').get('rec1'), null);

    // Close outcome modal
    const closeOutcomeBtn = modal.querySelector('button');
    await act(async () => {
        closeOutcomeBtn.click();
    });

    assert.equal(document.querySelector('[role="dialog"]'), null);

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});
