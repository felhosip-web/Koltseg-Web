import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { WorkLogManager } from '../js/work-log.js';

test('P2-A — No production imports of js/store.js', () => {
    const searchDirs = ['js', 'src'];
    let foundReferences = [];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true });
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isFile() && (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.includes('store.js')) {
                    foundReferences.push(filePath);
                }
            }
        }
    }

    assert.deepEqual(foundReferences, [], `Found unwanted production references to store.js: ${foundReferences.join(', ')}`);
});

test('P2-B — No production dispatches or listeners for app-data-updated event', () => {
    const searchDirs = ['js', 'src'];
    let foundOccurrences = [];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true });
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isFile() && (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.includes('app-data-updated') && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
                        foundOccurrences.push(`${filePath}:${index + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    }

    assert.deepEqual(foundOccurrences, [], `Found unwanted production app-data-updated occurrences: ${foundOccurrences.join('\n')}`);
});

test('P2-C — Domain managers own domain state directly without Vanilla Zustand', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    const db = new Database();
    db._enableMockDb();

    const itemManager = new ItemManager(db, { push: async () => {} });
    const monthManager = new MonthManager(db, { push: async () => {} });
    const entryManager = new EntryManager(db, { push: async () => {} });
    const workLogManager = new WorkLogManager(db, { push: async () => {} });

    assert.ok(Array.isArray(itemManager.items));
    assert.ok(Array.isArray(monthManager.months));
    assert.ok(Array.isArray(entryManager.entries));
    assert.ok(Array.isArray(workLogManager.works));

    await itemManager.add('Teszt Kategória', '#123456');
    await monthManager.add('2026-10');
    await entryManager.saveEntry({ itemId: itemManager.items[0].id, month: '2026-10', amount: 5000 });
    await workLogManager.save({ name: 'Teszt Munka', date: '2026-10-01' });

    assert.equal(itemManager.items.length, 1);
    assert.equal(itemManager.items[0].name, 'Teszt Kategória');

    assert.equal(monthManager.months.length, 1);
    assert.equal(monthManager.months[0], '2026-10');

    assert.equal(entryManager.entries.length, 1);
    assert.equal(entryManager.entries[0].amount, 5000);
    assert.ok(entryManager.entries[0].cellKey.startsWith(`${itemManager.items[0].id}_2026-10`));

    assert.equal(workLogManager.works.length, 1);
    assert.equal(workLogManager.works[0].name, 'Teszt Munka');

    dom.window.close();
});

test('P2-D — App.prototype.updateReactStore updates React Zustand store deterministically', async () => {
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

    const [{ App }, React, { createRoot }, { useAppStore: useReactStore }, { default: MainTable }] = await Promise.all([
        import('../js/app.js'),
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const db = new Database();
    db._enableMockDb();

    const app = Object.create(App.prototype);
    const mockSyncService = { push: async () => {} };
    const items = new ItemManager(db, mockSyncService);
    const months = new MonthManager(db, mockSyncService);
    const entries = new EntryManager(db, mockSyncService);

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        config: { eurRate: 400 },
        isBooted: true,
        activeTab: 'table'
    });

    window.app = app;

    // Mutate domain managers
    await items.add('Kávé', '#dbeafe');
    await months.add('2026-10');
    await entries.saveEntry({ itemId: items.items[0].id, month: '2026-10', amount: 2500 });

    // Execute updateReactStore
    app.updateReactStore();

    // Verify React Zustand store received snapshot
    const reactState = useReactStore.getState();
    assert.equal(reactState.items.length, 1);
    assert.equal(reactState.items[0].name, 'Kávé');
    assert.equal(reactState.months.length, 1);
    assert.equal(reactState.months[0], '2026-10');
    assert.equal(reactState.entries.length, 1);
    assert.equal(reactState.entries[0].amount, 2500);

    // Mount MainTable and verify rendering
    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    const tableEl = document.getElementById('vtTable');
    assert.ok(tableEl, 'MainTable element vtTable should exist');
    assert.ok(document.body.innerHTML.includes('Kávé'), 'Body should render category name Kávé');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});
