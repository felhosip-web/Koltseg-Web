import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRegistry } from '../src/services/plugin/PluginRegistry.js';
import { validatePluginUIContract, createPluginUIDTO } from '../src/services/plugin/PluginUIContract.js';
import { PluginUIRegistry, usePluginUIList } from '../src/services/plugin/PluginUIRegistry.js';
import { PluginErrorBoundary } from '../src/components/plugin/PluginErrorBoundary.jsx';
import { PluginHost } from '../src/components/plugin/PluginHost.jsx';
import { SAMPLE_PLUGIN_MANIFEST, samplePluginSetup, SamplePluginComponent, registerSamplePlugin } from '../src/plugins/samplePlugin.jsx';

/**
 * Helper to set up JSDOM DOM environment for React 19 testing.
 */
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

test('PLG2 — UI Contract Validation: Valid UI contract is accepted and creates immutable DTO', () => {
    const DummyComponent = () => React.createElement('div', null, 'Dummy');

    const validContract = {
        pluginId: 'valid.plugin.id',
        title: 'Valid Plugin Title',
        icon: 'fas fa-star',
        category: 'tools',
        hasUI: true,
        component: DummyComponent
    };

    assert.equal(validatePluginUIContract(validContract), true);

    const dto = createPluginUIDTO(validContract);
    assert.equal(dto.pluginId, 'valid.plugin.id');
    assert.equal(dto.title, 'Valid Plugin Title');
    assert.equal(dto.icon, 'fas fa-star');
    assert.equal(dto.category, 'tools');
    assert.equal(dto.hasUI, true);
    assert.equal(dto.component, DummyComponent);
    assert.ok(Object.isFrozen(dto));
});

test('PLG2 — UI Contract Validation: Invalid contracts are rejected deterministically', () => {
    const DummyComponent = () => React.createElement('div', null, 'Dummy');

    // Missing pluginId
    assert.throws(() => {
        validatePluginUIContract({ title: 'No ID', component: DummyComponent });
    }, /Missing or invalid "pluginId"/);

    // Invalid pluginId format
    assert.throws(() => {
        validatePluginUIContract({ pluginId: 'invalid ID spaces', title: 'Test', component: DummyComponent });
    }, /Invalid pluginId format/);

    // Missing title when hasUI is true
    assert.throws(() => {
        validatePluginUIContract({ pluginId: 'test.id', component: DummyComponent });
    }, /must specify a non-empty "title"/);

    // invalid component type
    assert.throws(() => {
        validatePluginUIContract({ pluginId: 'test.id', title: 'Test', component: 'not-a-component' });
    }, /must be a valid React component/);

    // hasUI: true with no component
    assert.throws(() => {
        validatePluginUIContract({ pluginId: 'test.id', title: 'Test', hasUI: true, component: null });
    }, /specified "hasUI: true" but provided no render component/);
});

test('PLG2 — UI Contract Invariant: Manifests and stored plugin records DO NOT contain components or functions', () => {
    const registry = new PluginRegistry();
    const manifest = {
        id: 'clean.manifest.plugin',
        name: 'Clean Manifest Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    registry.register(manifest, () => {});

    const recordDto = registry.get('clean.manifest.plugin');
    assert.equal(recordDto.manifest.component, undefined);
    assert.equal(recordDto.setup, undefined, 'Public DTO must not expose setup function handle');

    // JSON serialization of manifest check
    const serialized = JSON.stringify(recordDto.manifest);
    assert.equal(serialized.includes('function'), false);
    assert.equal(serialized.includes('component'), false);
});

test('PLG2 — PluginUIRegistry: Registration, retrieval, duplicate rejection, and clearing', () => {
    const uiReg = new PluginUIRegistry();
    const DummyComp = () => React.createElement('div', null, 'Demo');

    const contract = {
        pluginId: 'ui.test.plugin',
        title: 'UI Test Plugin',
        icon: 'fas fa-plug',
        hasUI: true,
        component: DummyComp
    };

    const dto = uiReg.registerUI(contract);
    assert.equal(dto.pluginId, 'ui.test.plugin');
    assert.equal(uiReg.hasUI('ui.test.plugin'), true);
    assert.equal(uiReg.getUI('ui.test.plugin').title, 'UI Test Plugin');

    // Duplicate registration rejected
    assert.throws(() => {
        uiReg.registerUI(contract);
    }, /is already registered/);

    // List
    assert.equal(uiReg.listUI().length, 1);

    // Unregister
    assert.equal(uiReg.unregisterUI('ui.test.plugin'), true);
    assert.equal(uiReg.hasUI('ui.test.plugin'), false);
    assert.equal(uiReg.listUI().length, 0);
});

test('PLG2 Snapshot Immutability & Reference Stability: listUI() returns deeply frozen stable snapshot', () => {
    const uiReg = new PluginUIRegistry();
    const DummyComp = () => React.createElement('div', null, 'Demo');

    // Initial empty list is frozen
    const list1 = uiReg.listUI();
    assert.ok(Object.isFrozen(list1), 'listUI() array snapshot MUST be deeply frozen');
    assert.equal(list1.length, 0);

    // Reference stability when unchanged
    const list1Again = uiReg.listUI();
    assert.strictEqual(list1, list1Again, 'listUI() MUST return exact same array reference when registry is unchanged');

    // Consumer mutation attempts MUST fail
    assert.throws(() => {
        list1.push({ pluginId: 'hack' });
    }, TypeError, 'Mutating listUI() snapshot array must throw TypeError');

    // Register UI item
    const contract = {
        pluginId: 'p2.snapshot.test',
        title: 'Snapshot Test',
        hasUI: true,
        component: DummyComp
    };
    uiReg.registerUI(contract);

    // After mutation, list reference changes
    const list2 = uiReg.listUI();
    assert.ok(Object.isFrozen(list2), 'New listUI() snapshot MUST be frozen');
    assert.notStrictEqual(list1, list2, 'New snapshot reference MUST be created on registerUI()');
    assert.equal(list2.length, 1);

    // DTO items inside snapshot are frozen
    assert.ok(Object.isFrozen(list2[0]), 'DTO items inside snapshot MUST be frozen');
    assert.throws(() => {
        list2[0].title = 'hacked';
    }, TypeError, 'Mutating DTO properties inside snapshot must throw TypeError');

    // Reference stability for list2
    const list2Again = uiReg.listUI();
    assert.strictEqual(list2, list2Again, 'listUI() MUST return exact same reference until next mutation');

    // Unregister
    uiReg.unregisterUI('p2.snapshot.test');
    const list3 = uiReg.listUI();
    assert.notStrictEqual(list2, list3, 'Unregistering MUST produce new snapshot reference');
    assert.equal(list3.length, 0);
});

test('PLG2 — React Plugin Host: Renders registered first-party plugin and passes restricted context', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    let setupRan = false;
    let componentReceivedContext = null;

    const mockAppService = {
        toastLog: [],
        showToast(msg, type) {
            this.toastLog.push({ msg, type });
        }
    };

    const storageService = new PluginStorageService(null, null);
    const registry = new PluginRegistry(storageService, mockAppService);
    const uiRegistry = new PluginUIRegistry();

    const manifest = {
        id: 'firstparty.render.test',
        name: 'Render Test Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast', 'storage:private']
    };

    registry.register(manifest, async (ctx) => {
        setupRan = true;
    });

    const TestComponent = ({ context }) => {
        componentReceivedContext = context;
        return React.createElement('div', { id: 'plugin-rendered-content' }, 'Hello from Plugin UI');
    };

    uiRegistry.registerUI({
        pluginId: 'firstparty.render.test',
        title: 'Render Test Plugin',
        icon: 'fas fa-vial',
        hasUI: true,
        component: TestComponent
    });

    const initPromise = registry.initialize('firstparty.render.test');

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'firstparty.render.test',
            registry,
            uiRegistry
        }));
        await initPromise;
    });

    assert.equal(setupRan, true, 'Plugin setup should have run');
    assert.ok(componentReceivedContext, 'Component should receive restricted context');
    assert.ok(componentReceivedContext.ui, 'Context should contain ui capability');
    assert.ok(componentReceivedContext.storage, 'Context should contain storage capability');

    // Security check: raw host internals MUST NOT be exposed on props or context
    assert.equal(componentReceivedContext.app, undefined);
    assert.equal(componentReceivedContext.db, undefined);
    assert.equal(componentReceivedContext.syncService, undefined);

    const renderedDiv = document.getElementById('plugin-rendered-content');
    assert.ok(renderedDiv, 'Plugin component should be rendered in DOM');
    assert.equal(renderedDiv.textContent, 'Hello from Plugin UI');

    root.unmount();
    dom.window.close();
});

test('PLG2 — React Plugin Host: Graceful handling of unknown plugin ID', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'non.existent.plugin',
            registry,
            uiRegistry
        }));
        await new Promise(r => setImmediate(r));
    });

    const bodyHtml = rootEl.innerHTML;
    assert.equal(bodyHtml.includes('Ismeretlen bővítmény'), true);
    assert.equal(bodyHtml.includes('non.existent.plugin'), true);

    root.unmount();
    dom.window.close();
});

test('PLG2 — React Plugin Host: Graceful handling of plugin without UI (hasUI: false)', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    registry.register({
        id: 'backend.only.plugin',
        name: 'Backend Only Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    });

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'backend.only.plugin',
            registry,
            uiRegistry
        }));
        await new Promise(r => setImmediate(r));
    });

    const bodyHtml = rootEl.innerHTML;
    assert.equal(bodyHtml.includes('Háttér bővítmény'), true);

    root.unmount();
    dom.window.close();
});

test('PLG2 — React Plugin Host: Graceful handling of setup initialization failure', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    const failingManifest = {
        id: 'failing.init.plugin',
        name: 'Failing Init Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    registry.register(failingManifest, async () => {
        throw new Error('Database connection failed during setup');
    });

    uiRegistry.registerUI({
        pluginId: 'failing.init.plugin',
        title: 'Failing Init Plugin',
        hasUI: true,
        component: () => React.createElement('div', null, 'Content')
    });

    const initPromise = registry.initialize('failing.init.plugin').catch(() => {});

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'failing.init.plugin',
            registry,
            uiRegistry
        }));
        await initPromise;
    });

    const bodyHtml = rootEl.innerHTML;
    assert.equal(bodyHtml.includes('Bővítmény inicializálási hiba'), true);
    assert.equal(bodyHtml.includes('Database connection failed during setup'), true);

    root.unmount();
    dom.window.close();
});

test('PLG2 — PluginErrorBoundary: Isolates plugin component render crash from host app', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    registry.register({
        id: 'crashing.render.plugin',
        name: 'Crashing Render Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    });

    const CrashingComponent = () => {
        throw new Error('Explosive render exception inside plugin component');
    };

    uiRegistry.registerUI({
        pluginId: 'crashing.render.plugin',
        title: 'Crashing Render Plugin',
        hasUI: true,
        component: CrashingComponent
    });

    const initPromise = registry.initialize('crashing.render.plugin');

    await act(async () => {
        root.render(React.createElement('div', { id: 'host-app-container' }, [
            React.createElement('header', { key: 'h' }, 'Host App Header Alive'),
            React.createElement(PluginHost, {
                key: 'ph',
                pluginId: 'crashing.render.plugin',
                registry,
                uiRegistry
            })
        ]));
        await initPromise;
    });

    const bodyHtml = rootEl.innerHTML;

    // Host app header is STILL intact
    assert.equal(bodyHtml.includes('Host App Header Alive'), true);

    // Error boundary caught crash gracefully
    assert.equal(bodyHtml.includes('Bővítmény hiba: Crashing Render Plugin'), true);
    assert.equal(bodyHtml.includes('Explosive render exception inside plugin component'), true);

    root.unmount();
    dom.window.close();
});

test('PLG2 — Plugin Switching & No Duplicate Initialization', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    let setupAExecutions = 0;
    let setupBExecutions = 0;

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    registry.register({
        id: 'switch.plugin.a',
        name: 'Plugin A',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, () => { setupAExecutions++; });

    registry.register({
        id: 'switch.plugin.b',
        name: 'Plugin B',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, () => { setupBExecutions++; });

    uiRegistry.registerUI({
        pluginId: 'switch.plugin.a',
        title: 'Plugin A',
        hasUI: true,
        component: () => React.createElement('div', { id: 'comp-a' }, 'Component A')
    });

    uiRegistry.registerUI({
        pluginId: 'switch.plugin.b',
        title: 'Plugin B',
        hasUI: true,
        component: () => React.createElement('div', { id: 'comp-b' }, 'Component B')
    });

    // 1. Render Plugin A
    const initA = registry.initialize('switch.plugin.a');
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'switch.plugin.a',
            registry,
            uiRegistry
        }));
        await initA;
    });

    assert.ok(document.getElementById('comp-a'));
    assert.equal(setupAExecutions, 1);

    // 2. Switch to Plugin B
    const initB = registry.initialize('switch.plugin.b');
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'switch.plugin.b',
            registry,
            uiRegistry
        }));
        await initB;
    });

    assert.ok(document.getElementById('comp-b'));
    assert.equal(document.getElementById('comp-a'), null);
    assert.equal(setupBExecutions, 1);

    // 3. Switch back to Plugin A
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'switch.plugin.a',
            registry,
            uiRegistry
        }));
        await Promise.resolve();
    });

    assert.ok(document.getElementById('comp-a'));
    assert.equal(setupAExecutions, 1, 'Plugin A setup MUST NOT run again when switching back');

    root.unmount();
    dom.window.close();
});

test('PLG2 Capability Isolation — Plugin Context Isolation During Switching', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    const receivedContextsA = [];
    const receivedContextsB = [];

    registry.register({
        id: 'isolation.plugin.a',
        name: 'Isolation Plugin A',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    });

    registry.register({
        id: 'isolation.plugin.b',
        name: 'Isolation Plugin B',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['expenses:read']
    });

    uiRegistry.registerUI({
        pluginId: 'isolation.plugin.a',
        title: 'Plugin A',
        hasUI: true,
        component: ({ context }) => {
            receivedContextsA.push(context);
            return React.createElement('div', { id: 'rendered-a' }, 'A');
        }
    });

    uiRegistry.registerUI({
        pluginId: 'isolation.plugin.b',
        title: 'Plugin B',
        hasUI: true,
        component: ({ context }) => {
            receivedContextsB.push(context);
            return React.createElement('div', { id: 'rendered-b' }, 'B');
        }
    });

    // Initialize both plugins first so both have canonical active contexts in registry
    await registry.initialize('isolation.plugin.a');
    await registry.initialize('isolation.plugin.b');

    const canonicalContextA = registry.getContext('isolation.plugin.a');
    const canonicalContextB = registry.getContext('isolation.plugin.b');

    assert.ok(canonicalContextA);
    assert.ok(canonicalContextB);
    assert.notStrictEqual(canonicalContextA, canonicalContextB);

    // 1. Render Plugin A
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'isolation.plugin.a',
            registry,
            uiRegistry
        }));
    });

    assert.equal(receivedContextsA.length >= 1, true);
    assert.strictEqual(receivedContextsA[0], canonicalContextA);

    // 2. Switch same PluginHost instance to Plugin B
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'isolation.plugin.b',
            registry,
            uiRegistry
        }));
    });

    assert.equal(receivedContextsB.length >= 1, true);

    // CRITICAL SECURITY ASSERTION: Plugin B NEVER receives Plugin A's context, even for a single render!
    for (const ctx of receivedContextsB) {
        assert.notStrictEqual(ctx, canonicalContextA, "Plugin B MUST NEVER receive Plugin A's context!");
        assert.strictEqual(ctx, canonicalContextB, "Plugin B MUST ONLY receive Plugin B's canonical context!");
    }

    root.unmount();
    dom.window.close();
});

test('PLG2 Capability Isolation — Async Race Prevention', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    let resolveSlowSetupA;
    const slowInitPromiseA = new Promise((resolve) => {
        resolveSlowSetupA = resolve;
    });

    const receivedContextsB = [];

    registry.register({
        id: 'race.plugin.a',
        name: 'Race Plugin A',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, async () => {
        await slowInitPromiseA;
    });

    registry.register({
        id: 'race.plugin.b',
        name: 'Race Plugin B',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['expenses:read']
    });

    uiRegistry.registerUI({
        pluginId: 'race.plugin.a',
        title: 'Plugin A',
        hasUI: true,
        component: () => React.createElement('div', { id: 'rendered-a' }, 'A')
    });

    uiRegistry.registerUI({
        pluginId: 'race.plugin.b',
        title: 'Plugin B',
        hasUI: true,
        component: ({ context }) => {
            receivedContextsB.push(context);
            return React.createElement('div', { id: 'rendered-b' }, 'B');
        }
    });

    // Initialize B upfront
    await registry.initialize('race.plugin.b');
    const canonicalContextB = registry.getContext('race.plugin.b');

    // 1. Render Plugin A (starts slow setup A)
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'race.plugin.a',
            registry,
            uiRegistry
        }));
    });

    // 2. Switch immediately to Plugin B while Plugin A is still resolving setup
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'race.plugin.b',
            registry,
            uiRegistry
        }));
    });

    assert.ok(document.getElementById('rendered-b'));

    // 3. Resolve Plugin A's setup NOW
    await act(async () => {
        resolveSlowSetupA();
        await new Promise(r => setImmediate(r));
    });

    // Verify Plugin B remains rendered and has received ONLY canonical B context
    assert.ok(document.getElementById('rendered-b'));
    assert.equal(document.getElementById('rendered-a'), null);

    const canonicalContextA = registry.getContext('race.plugin.a');
    for (const ctx of receivedContextsB) {
        assert.notStrictEqual(ctx, canonicalContextA);
        assert.strictEqual(ctx, canonicalContextB);
    }

    root.unmount();
    dom.window.close();
});

test('PLG2 Dynamic UI Registration — Reactive Subscription', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const uiRegistry = new PluginUIRegistry();

    const TestTabContainer = () => {
        const list = usePluginUIList(uiRegistry);
        return React.createElement('div', { id: 'tabs-container' },
            list.map(ui => React.createElement('button', { key: ui.pluginId }, ui.title))
        );
    };

    await act(async () => {
        root.render(React.createElement(TestTabContainer));
    });

    const containerBefore = document.getElementById('tabs-container');
    assert.equal(containerBefore.children.length, 0);

    // Register UI at runtime
    await act(async () => {
        uiRegistry.registerUI({
            pluginId: 'dynamic.tab.plugin',
            title: 'Dynamic Plugin Tab',
            hasUI: true,
            component: () => React.createElement('div', null, 'Tab Content')
        });
    });

    const containerAfter = document.getElementById('tabs-container');
    assert.equal(containerAfter.children.length, 1);
    assert.equal(containerAfter.children[0].textContent, 'Dynamic Plugin Tab');

    root.unmount();
    dom.window.close();
});

test('PLG2 — Context Lifecycle Invariant: Setup and React UI receive the exact same PluginContext instance', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    let setupContext = null;
    let uiContext = null;

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    const manifest = {
        id: 'canonical.context.plugin',
        name: 'Canonical Context Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast', 'storage:private']
    };

    registry.register(manifest, async (ctx) => {
        setupContext = ctx;
    });

    uiRegistry.registerUI({
        pluginId: 'canonical.context.plugin',
        title: 'Canonical Context Plugin',
        hasUI: true,
        component: ({ context }) => {
            uiContext = context;
            return React.createElement('div', null, 'Canonical UI');
        }
    });

    const initPromise = registry.initialize('canonical.context.plugin');

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'canonical.context.plugin',
            registry,
            uiRegistry
        }));
        await initPromise;
    });

    assert.ok(setupContext, 'Setup must receive PluginContext');
    assert.ok(uiContext, 'UI component must receive PluginContext');
    assert.strictEqual(setupContext, uiContext, 'Setup and React UI MUST receive the exact same PluginContext instance');

    root.unmount();
    dom.window.close();
});

test('PLG2 — Static Security & Architecture Audit: Codebase scan for forbidden execution and global handles', () => {
    const filesToAudit = [
        'src/services/plugin/PluginUIContract.js',
        'src/services/plugin/PluginUIRegistry.js',
        'src/components/plugin/PluginErrorBoundary.jsx',
        'src/components/plugin/PluginHost.jsx',
        'src/plugins/samplePlugin.jsx'
    ];

    const forbiddenPatterns = [
        { pattern: /\beval\s*\(/, description: 'eval()' },
        { pattern: /new\s+Function\s*\(/, description: 'new Function()' },
        { pattern: /dangerouslySetInnerHTML/, description: 'dangerouslySetInnerHTML' },
        { pattern: /window\.app\b/, description: 'window.app' },
        { pattern: /globalThis\.app\b/, description: 'globalThis.app' }
    ];

    for (const fileRelPath of filesToAudit) {
        const filePath = path.resolve(process.cwd(), fileRelPath);
        if (fs.existsSync(filePath)) {
            const code = fs.readFileSync(filePath, 'utf8');
            for (const { pattern, description } of forbiddenPatterns) {
                assert.equal(pattern.test(code), false, `Forbidden pattern "${description}" found in ${fileRelPath}`);
            }
        }
    }
});
