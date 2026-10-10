import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRegistry } from '../src/services/plugin/PluginRegistry.js';
import { validatePluginUIContract, createPluginUIDTO } from '../src/services/plugin/PluginUIContract.js';
import { PluginUIRegistry } from '../src/services/plugin/PluginUIRegistry.js';
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

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'firstparty.render.test',
            registry,
            uiRegistry
        }));
    });

    // Wait for microtask/initialization
    await act(async () => {
        await new Promise(r => setTimeout(r, 50));
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
    });

    await act(async () => {
        await new Promise(r => setTimeout(r, 50));
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
    });

    await act(async () => {
        await new Promise(r => setTimeout(r, 50));
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

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'failing.init.plugin',
            registry,
            uiRegistry
        }));
    });

    await act(async () => {
        await new Promise(r => setTimeout(r, 50));
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
    });

    await act(async () => {
        await new Promise(r => setTimeout(r, 50));
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
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'switch.plugin.a',
            registry,
            uiRegistry
        }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    assert.ok(document.getElementById('comp-a'));
    assert.equal(setupAExecutions, 1);

    // 2. Switch to Plugin B
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'switch.plugin.b',
            registry,
            uiRegistry
        }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

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
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    assert.ok(document.getElementById('comp-a'));
    assert.equal(setupAExecutions, 1, 'Plugin A setup MUST NOT run again when switching back');

    root.unmount();
    dom.window.close();
});

test('PLG2 — UI Unmount vs Disposed Lifecycle Separation', async () => {
    const dom = setupJSDOM();
    const rootEl = document.getElementById('root');
    const root = createRoot(rootEl);

    const registry = new PluginRegistry();
    const uiRegistry = new PluginUIRegistry();

    registry.register({
        id: 'lifecycle.plugin',
        name: 'Lifecycle Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    });

    uiRegistry.registerUI({
        pluginId: 'lifecycle.plugin',
        title: 'Lifecycle Plugin',
        hasUI: true,
        component: () => React.createElement('div', { id: 'lifecycle-ui' }, 'Lifecycle UI')
    });

    // 1. Render UI
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'lifecycle.plugin',
            registry,
            uiRegistry
        }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    assert.equal(registry.get('lifecycle.plugin').state, 'active');

    // 2. Unmount React component (simulating tab switch)
    await act(async () => {
        root.render(React.createElement('div', null, 'Tab Switched Away'));
    });

    // Unmounting React UI MUST NOT dispose the plugin runtime!
    assert.equal(registry.get('lifecycle.plugin').state, 'active', 'Plugin state remains active after UI unmount');

    // 3. Explicit disposal
    registry.dispose('lifecycle.plugin');
    assert.equal(registry.get('lifecycle.plugin').state, 'disposed');

    // 4. Re-rendering PluginHost shows disposed fallback
    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'lifecycle.plugin',
            registry,
            uiRegistry
        }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    assert.equal(rootEl.innerHTML.includes('Inaktív bővítmény'), true);

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
