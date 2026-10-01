import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { WorkLogManager } from '../js/work-log.js';
import { appService } from '../src/services/appService.js';

test('P3-A — Static Architecture Check: Zero window.app and global aliases in production js/ and src/', () => {
    const targetDirs = ['js', 'src'];
    const forbiddenPatterns = [
        { pattern: /window\.app\b/, label: 'window.app' },
        { pattern: /window\['app'\]/, label: 'window[\'app\']' },
        { pattern: /globalThis\.app\b/, label: 'globalThis.app' },
        { pattern: /globalThis\['app'\]/, label: 'globalThis[\'app\']' },
        { pattern: /top\.app\b/, label: 'top.app' },
        { pattern: /parent\.app\b/, label: 'parent.app' }
    ];

    let foundViolations = [];

    for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true });
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isFile() && (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, lineNum) => {
                    const trimmed = line.trim();
                    // Ignore comments and docstrings
                    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

                    for (const { pattern, label } of forbiddenPatterns) {
                        if (pattern.test(line)) {
                            foundViolations.push(`${filePath}:${lineNum + 1} (${label}): ${trimmed}`);
                        }
                    }
                });
            }
        }
    }

    assert.deepEqual(foundViolations, [], `Found forbidden global app references in production code:\n${foundViolations.join('\n')}`);
});

test('P3-B — Application boot and appService.bind work with window.app deleted', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
        url: 'http://localhost/'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    delete globalThis.window.app;

    const [{ App }] = await Promise.all([import('../js/app.js')]);

    const db = new Database();
    db._enableMockDb();

    const app = Object.create(App.prototype);
    const mockSyncService = { push: async () => {}, lastSyncTime: null };

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

    assert.equal(globalThis.window.app, undefined, 'window.app must remain undefined');
    assert.equal(appService.getAppInstance(), app, 'appService holds explicit app instance');

    // Verify snapshot and updateReactStore operate without window.app
    const snapshot = app.getAppSnapshot();
    assert.ok(snapshot, 'getAppSnapshot returns valid object without window.app');
    assert.equal(snapshot.isBooted, true);

    app.updateReactStore();

    dom.window.close();
});

test('P3-C — SyncService operates using explicit app reference without consulting window.app', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    delete globalThis.window.app;

    const fakeConfig = { useSupabase: false };
    const fakeOffline = { getPendingCount: () => 0 };

    const syncService = new SyncService(fakeConfig, fakeOffline);
    assert.equal(syncService._getApp(), null);

    const fakeApp = {
        reload: () => {},
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        templates: { load: async () => {} },
        reminderManager: { load: async () => {} },
        incomingManager: { load: async () => {} },
        workLogManager: { load: async () => {} },
        db: { getAll: async () => [] }
    };

    syncService.setApp(fakeApp);
    assert.equal(syncService._getApp(), fakeApp);
    assert.equal(globalThis.window.app, undefined);

    await syncService._reloadAndRender();

    dom.window.close();
});

test('P3-D — Domain managers operate without window.app and execute CRUD', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    delete globalThis.window.app;

    const db = new Database();
    db._enableMockDb();

    let pushedItems = [];
    const mockSyncService = {
        push: async (store, item) => { pushedItems.push({ store, item }); },
        _app: null
    };

    const itemManager = new ItemManager(db, mockSyncService);
    const monthManager = new MonthManager(db, mockSyncService);
    const entryManager = new EntryManager(db, mockSyncService);
    const workLogManager = new WorkLogManager(db, mockSyncService);

    assert.equal(globalThis.window.app, undefined);

    // Create operations
    await itemManager.add('Saját Kategória', '#aabbcc');
    await monthManager.add('2026-11');
    const createdItem = itemManager.items[0];

    await entryManager.saveEntry({ itemId: createdItem.id, month: '2026-11', amount: 9900 });
    await workLogManager.save({ name: 'Projekció', date: '2026-11-01' });

    assert.equal(itemManager.items.length, 1);
    assert.equal(monthManager.months.length, 1);
    assert.equal(entryManager.entries.length, 1);
    assert.equal(workLogManager.works.length, 1);

    assert.equal(globalThis.window.app, undefined, 'window.app remained undefined during all domain manager CRUD operations');

    dom.window.close();
});

test('P3-E — WorkAppList -> appService.openWorkModal(id) passes exact selected work ID without window.app', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
        url: 'http://localhost/'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: WorkAppList }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/WorkAppList.jsx')
    ]);

    const modalCalls = [];
    const fakeApp = {
        workLogRenderer: {
            openModal: (id) => modalCalls.push(id)
        }
    };

    appService.bind(fakeApp);

    const { act } = React;
    act(() => {
        useAppStore.setState({
            works: [{ id: 'target-work-id-999', name: 'Felújítás', status: 'folyamatban', date: '2026-11-15', location: 'Telephely', duration: 4 }]
        });
    });

    const root = createRoot(document.getElementById('root'));
    await act(async () => {
        root.render(React.createElement(WorkAppList));
    });

    const editBtn = document.querySelector('button.btn-edit-work');
    assert.ok(editBtn, 'Edit button should exist');

    await act(async () => {
        editBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0], 'target-work-id-999');
    assert.equal(globalThis.window.app, undefined);

    await act(async () => { root.unmount(); });
    dom.window.close();
});

test('P3-G — ItemManager deletion with explicit EntryManager dependency purges associated entries in memory and pushes deletes', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    delete globalThis.window.app;

    const db = new Database();
    db._enableMockDb();

    let pushedDeletes = [];
    const mockSyncService = {
        push: async (store, id, isDelete) => {
            if (isDelete) pushedDeletes.push({ store, id });
        }
    };

    const entryManager = new EntryManager(db, mockSyncService);
    const itemManager = new ItemManager(db, mockSyncService, entryManager);

    await itemManager.add('Kávé & Teák', '#fed7aa');
    const item = itemManager.items[0];

    const entry1 = await entryManager.saveEntry({ itemId: item.id, month: '2026-11', amount: 1500 });
    const entry2 = await entryManager.saveEntry({ itemId: 'other-item-id', month: '2026-11', amount: 3000 });

    assert.equal(itemManager.items.length, 1);
    assert.equal(entryManager.entries.length, 2);

    // Delete item via ItemManager
    await itemManager.delete(item.id);

    // ItemManager should be empty
    assert.equal(itemManager.items.length, 0);

    // Associated entry1 should be purged from EntryManager's memory array, entry2 remains
    assert.equal(entryManager.entries.length, 1);
    assert.equal(entryManager.entries[0].id, entry2.id);

    // Sync deletes pushed for both item and associated entry
    assert.ok(pushedDeletes.some(p => p.store === 'items' && p.id === item.id));
    assert.ok(pushedDeletes.some(p => p.store === 'entries' && p.id === entry1.id));

    // Confirm window.app remains completely undefined
    assert.equal(globalThis.window.app, undefined);

    dom.window.close();
});

test('P3-F — MainTable sync regression renders without window.app', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
        url: 'http://localhost/'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const { act } = React;
    act(() => {
        useAppStore.setState({
            items: [{ id: 'cat-1', name: 'Irodaszer' }],
            months: ['2026-11'],
            entries: [{ id: 'e-99', cellKey: 'cat-1_2026-11', amount: 4500, currency: 'HUF' }],
            eurRate: 400
        });
    });

    const root = createRoot(document.getElementById('root'));
    await act(async () => {
        root.render(React.createElement(MainTable));
    });

    const container = document.getElementById('root');
    assert.ok(container.textContent.includes('Irodaszer'));
    assert.ok(container.textContent.includes('2026-11'));
    assert.ok(container.textContent.includes((4500).toLocaleString('hu-HU')));
    assert.equal(globalThis.window.app, undefined);

    await act(async () => { root.unmount(); });
    dom.window.close();
});
