import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { WorkLogManager } from '../js/work-log.js';

// Ensure auto init is disabled during test imports
globalThis.window = globalThis.window || {};
globalThis.window.__DISABLE_AUTO_INIT__ = true;

function setupDOM() {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="root"></div><div id="costAppView"></div><div id="workAppView"></div></body></html>',
        { url: 'http://localhost/' }
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Node = dom.window.Node;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.window.Dexie = Dexie;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    // Ensure window.app is completely deleted
    delete globalThis.window.app;

    return dom;
}

function getJsAndSrcFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getJsAndSrcFiles(filePath));
        } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
            results.push(filePath);
        }
    });
    return results;
}

test('P4-A — Static Architecture Check: Zero refreshAllTabs, tabStateMachine, VirtualTableRenderer, or uiController in production code', () => {
    const jsFiles = getJsAndSrcFiles(path.resolve(process.cwd(), 'js'));
    const srcFiles = getJsAndSrcFiles(path.resolve(process.cwd(), 'src'));
    const allProdFiles = [...jsFiles, ...srcFiles];

    const violationsRefreshAllTabs = [];
    const violationsTabStateMachine = [];
    const violationsVirtualTableRenderer = [];
    const violationsUiController = [];

    allProdFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('refreshAllTabs')) {
            violationsRefreshAllTabs.push(file);
        }
        if (content.includes('tabStateMachine')) {
            violationsTabStateMachine.push(file);
        }
        if (content.includes('VirtualTableRenderer')) {
            violationsVirtualTableRenderer.push(file);
        }
        if (content.includes('uiController')) {
            violationsUiController.push(file);
        }
    });

    assert.deepEqual(violationsRefreshAllTabs, [], 'Production files must contain zero refreshAllTabs references');
    assert.deepEqual(violationsTabStateMachine, [], 'Production files must contain zero tabStateMachine references');
    assert.deepEqual(violationsVirtualTableRenderer, [], 'Production files must contain zero VirtualTableRenderer references');
    assert.deepEqual(violationsUiController, [], 'Production files must contain zero uiController references');
});

test('P4-B — Static Architecture Check: Zero window.app, globalThis.app, app-data-updated, and js/store.js in production code', () => {
    const jsFiles = getJsAndSrcFiles(path.resolve(process.cwd(), 'js'));
    const srcFiles = getJsAndSrcFiles(path.resolve(process.cwd(), 'src'));
    const allProdFiles = [...jsFiles, ...srcFiles];

    const windowAppMatches = [];
    const globalThisAppMatches = [];
    const appDataUpdatedMatches = [];
    const legacyStoreMatches = [];

    // Regex for window.app and globalThis.app
    const windowAppRegex = /window\.app\b/g;
    const globalThisAppRegex = /globalThis\.app\b/g;

    allProdFiles.forEach(file => {
        // Exclude local-storage-sandbox.js which sandbox-traps window.app for security
        if (file.endsWith('local-storage-sandbox.js')) return;

        const content = fs.readFileSync(file, 'utf8');

        if (windowAppRegex.test(content)) {
            windowAppMatches.push(file);
        }
        if (globalThisAppRegex.test(content)) {
            globalThisAppMatches.push(file);
        }
        if (content.includes('app-data-updated')) {
            appDataUpdatedMatches.push(file);
        }
        if (content.includes('js/store.js')) {
            legacyStoreMatches.push(file);
        }
    });

    assert.deepEqual(windowAppMatches, [], 'Production code must contain zero window.app references');
    assert.deepEqual(globalThisAppMatches, [], 'Production code must contain zero globalThis.app references');
    assert.deepEqual(appDataUpdatedMatches, [], 'Production code must contain zero app-data-updated references');
    assert.deepEqual(legacyStoreMatches, [], 'Production code must contain zero js/store.js references');
});

test('P4-C — App hydrates React Zustand store and manages CRUD without UIController or tabStateMachine', async () => {
    const dom = setupDOM();

    const [{ App }, { appService }, { useAppStore }] = await Promise.all([
        import('../js/app.js'),
        import('../src/services/appService.js'),
        import('../src/store/useAppStore.js')
    ]);

    const db = new Database();
    db._enableMockDb();

    const mockSyncService = { push: async () => {}, lastSyncTime: null };

    const app = Object.create(App.prototype);
    Object.assign(app, {
        db,
        items: new ItemManager(db, mockSyncService),
        months: new MonthManager(db, mockSyncService),
        entries: new EntryManager(db, mockSyncService),
        workLogManager: new WorkLogManager(db, mockSyncService),
        config: { eurRate: 400 },
        syncService: mockSyncService,
        isBooted: true
    });

    appService.bind(app);

    assert.ok(app.isBooted, 'App should be booted');
    assert.equal(app.uiController, undefined, 'App should not instantiate UIController');
    assert.equal(app.tabStateMachine, undefined, 'App should not instantiate tabStateMachine');

    // Create item
    const newItem = await app.items.add('P4 Test Item', '#3b82f6');
    assert.ok(newItem && newItem.id);

    // Create month
    await app.months.add('2026-10');

    // Save entry
    await app.entries.saveEntry({
        cellKey: `${newItem.id}_2026-10`,
        itemId: newItem.id,
        month: '2026-10',
        amount: 25000,
        currency: 'HUF',
        paymentMethod: 'Kártya',
        note: 'P4 Test Note',
        color: 'transparent',
        timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // Update React store
    app.updateReactStore();

    const snapshot = useAppStore.getState();
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].name, 'P4 Test Item');
    assert.equal(snapshot.months.length, 1);
    assert.equal(snapshot.months[0], '2026-10');
    assert.equal(snapshot.entries.length, 1);
    assert.equal(snapshot.entries[0].amount, 25000);

    // Test appService tab switching directly via Zustand
    appService.switchTab('table');
    assert.equal(useAppStore.getState().activeTab, 'table');

    appService.showView('time');
    assert.equal(useAppStore.getState().activeTab, 'time');

    dom.window.close();
});
