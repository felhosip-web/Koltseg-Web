import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { appService } from '../src/services/appService.js';

test('Regression Guard — getAppSnapshot() auto-derives months and items when entries exist but months/items is empty', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }] = await Promise.all([
        import('../js/app.js')
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
        isBooted: true
    });

    entries.entries = [
        { id: 'e1', itemId: 'item_1', month: '2026-08', cellKey: 'item_1_2026-08', amount: 15000, currency: 'HUF' },
        { id: 'e2', itemId: 'item_2', month: '2026-09', cellKey: 'item_2_2026-09', amount: 25000, currency: 'HUF' }
    ];
    items.items = [];
    months.months = [];

    const snapshot = app.getAppSnapshot();

    assert.equal(snapshot.entries.length, 2, 'Entries preserved in snapshot');
    assert.deepEqual(snapshot.months, ['2026-08', '2026-09'], 'Months auto-derived from entries when months array was empty');
    assert.equal(snapshot.items.length, 2, 'Items auto-derived from entries when items array was empty');
    assert.equal(snapshot.items[0].id, 'item_1');
    assert.equal(snapshot.items[1].id, 'item_2');

    dom.window.close();
});

test('Regression Guard — Genuinely empty database preserves empty snapshot', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }] = await Promise.all([
        import('../js/app.js')
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
        isBooted: true
    });

    entries.entries = [];
    items.items = [];
    months.months = [];

    const snapshot = app.getAppSnapshot();

    assert.equal(snapshot.entries.length, 0);
    assert.equal(snapshot.items.length, 0);
    assert.equal(snapshot.months.length, 0);

    dom.window.close();
});

test('BootManager — updateReactStore() is guaranteed to execute in finally block even if background tasks fail', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }, { BootManager }] = await Promise.all([
        import('../js/app.js'),
        import('../js/boot-manager.js')
    ]);

    const db = new Database();
    db._enableMockDb();

    let reactStoreUpdatedCount = 0;
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
        updateReactStore: () => { reactStoreUpdatedCount++; },
        updateReminderStatus: () => {},
        setSystemStatus: () => {}
    });

    items.items = [{ id: 'i1', name: 'Kávé' }];
    entries.entries = [{ id: 'e1', itemId: 'i1', month: '2026-08', cellKey: 'i1_2026-08', amount: 5000 }];

    const bootManager = new BootManager(app);
    bootManager._initCloud = async () => {
        throw new Error('Simulated cloud service failure during boot');
    };

    await bootManager._runBackgroundBootTasks();

    assert.ok(reactStoreUpdatedCount > 0, 'updateReactStore() was executed in finally block despite cloud service failure');

    dom.window.close();
});

test('MainTable — renders table rows consistently with StatsTab when entries exist without explicit months store records', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ createRoot }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const mockSnapshot = {
        entries: [
            { id: 'e1', itemId: 'cat_1', month: '2026-08', cellKey: 'cat_1_2026-08', amount: 50000, currency: 'HUF' }
        ],
        items: [{ id: 'cat_1', name: 'Élelmiszer' }],
        months: [],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    const tableEl = document.getElementById('vtTable');
    assert.ok(tableEl, 'MainTable vtTable element should exist');
    assert.ok(document.body.innerHTML.includes('Élelmiszer'), 'MainTable should render category row for Élelmiszer');
    assert.ok(document.body.innerHTML.includes('2026-08'), 'MainTable should render auto-derived month header 2026-08');

    await act(async () => {
        root.unmount();
    });

    dom.window.close();
});
