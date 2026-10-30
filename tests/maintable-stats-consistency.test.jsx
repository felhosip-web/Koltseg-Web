import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { parseCellKey } from '../js/utils/cell-key-utils.js';

test('Critical Data Failure — entries.load() rejection is detected and throws an error', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
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

    const app = Object.create(App.prototype);
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    entries.load = async () => {
        throw new Error('IndexedDB corrupt entries read error');
    };

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        config: { eurRate: 400 },
        isBooted: true
    });

    const bootManager = new BootManager(app);

    await assert.rejects(
        async () => {
            await bootManager._loadAllData();
        },
        /IndexedDB corrupt entries read error/,
        'Critical failure in entries.load() must throw and not be silently suppressed'
    );

    dom.window.close();
});

test('Critical Data Failure — items.load() rejection is detected and throws an error', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
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

    const app = Object.create(App.prototype);
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    items.load = async () => {
        throw new Error('IndexedDB items read error');
    };

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        config: { eurRate: 400 },
        isBooted: true
    });

    const bootManager = new BootManager(app);

    await assert.rejects(
        async () => {
            await bootManager._loadAllData();
        },
        /IndexedDB items read error/,
        'Critical failure in items.load() must throw and not be silently suppressed'
    );

    dom.window.close();
});

test('Optional Service Resilience — failure in optional workLogManager or cloud sync does not prevent publishing loaded local data', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
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
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        workLogManager: {
            load: async () => {
                throw new Error('Optional workLogManager failure');
            }
        },
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

    // Should load critical data successfully despite optional workLogManager failure
    await bootManager._runBackgroundBootTasks();

    assert.ok(reactStoreUpdatedCount > 0, 'updateReactStore() was executed in finally block publishing local data despite optional service failure');

    dom.window.close();
});

test('cellKey Parsing — parseCellKey() consistently parses standard and legacy cellKey formats', () => {
    // Standard format: itemId_month
    const std1 = parseCellKey('catX_2026-08');
    assert.equal(std1.itemId, 'catX');
    assert.equal(std1.month, '2026-08');

    // Standard format with timestamp: itemId_month_timestamp
    const std2 = parseCellKey('catX_2026-08_1700000000');
    assert.equal(std2.itemId, 'catX');
    assert.equal(std2.month, '2026-08');

    // Legacy format: month_itemId_timestamp
    const leg = parseCellKey('2026-08_catY_1700000000');
    assert.equal(leg.itemId, 'catY');
    assert.equal(leg.month, '2026-08');

    // Object entry with cellKey fallback
    const obj = parseCellKey({ cellKey: '2026-09_catZ_123' });
    assert.equal(obj.itemId, 'catZ');
    assert.equal(obj.month, '2026-09');
});

test('Snapshot & Synthetic Guard — getAppSnapshot() auto-derives months and items marked as _isSynthetic without persisting them to IndexedDB', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
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
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        config: { eurRate: 400 },
        isBooted: true
    });

    // Entries with standard and legacy cellKey formats
    entries.entries = [
        { id: 'e1', cellKey: 'itemA_2026-08_100', amount: 12000, currency: 'HUF' },
        { id: 'e2', cellKey: '2026-09_itemB_200', amount: 18000, currency: 'HUF' }
    ];
    items.items = [];
    months.months = [];

    const snapshot = app.getAppSnapshot();

    assert.equal(snapshot.entries.length, 2);
    assert.deepEqual(snapshot.months, ['2026-08', '2026-09']);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0]._isSynthetic, true, 'Synthetic category marked with transient _isSynthetic flag');
    assert.equal(snapshot.items[1]._isSynthetic, true);

    // Verify IndexedDB items store remains empty (synthetic categories were NOT persisted)
    const storedItemsInDb = await db.getAll('items');
    assert.equal(storedItemsInDb.length, 0, 'Synthetic categories MUST NOT be persisted to IndexedDB store');

    dom.window.close();
});

test('MainTable — renders correct category/month intersections when entries exist and preserves genuinely empty state when database is empty', async () => {
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

    // 1. Populated entries render table rows
    const mockPopulatedSnapshot = {
        entries: [
            { id: 'e1', itemId: 'cat_1', month: '2026-08', cellKey: 'cat_1_2026-08', amount: 50000, currency: 'HUF' }
        ],
        items: [{ id: 'cat_1', name: 'Élelmiszer' }],
        months: [],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockPopulatedSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    const tableEl = document.getElementById('vtTable');
    assert.ok(tableEl, 'MainTable vtTable element should exist when entries exist');
    assert.ok(document.body.innerHTML.includes('Élelmiszer'), 'MainTable renders Élelmiszer row');
    assert.ok(document.body.innerHTML.includes('50') && document.body.innerHTML.includes('000 Ft'), 'MainTable renders entry amount cell 50 000 Ft');

    // 2. Genuinely empty snapshot renders empty state banner
    await act(async () => {
        useAppStore.getState().setSnapshot({ entries: [], items: [], months: [], eurRate: 400 });
    });

    assert.ok(document.body.innerHTML.includes('Nincs még adat'), 'Genuinely empty state renders Nincs még adat banner');

    await act(async () => {
        root.unmount();
    });

    dom.window.close();
});
