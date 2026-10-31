import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { parseCellKey } from '../js/utils/cell-key-utils.js';

test('1. Standard cellKey amount rendering in MainTable', async () => {
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
            { id: 'e1', itemId: 'catA', month: '2026-08', cellKey: 'catA_2026-08', amount: 15000, currency: 'HUF' }
        ],
        items: [{ id: 'catA', name: 'Kategória A' }],
        months: ['2026-08'],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    assert.ok(document.body.innerHTML.includes('15'), 'Standard cellKey amount rendered in cell');
    assert.ok(document.body.innerHTML.includes('000 Ft'), 'Standard cellKey currency suffix rendered');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('2. Timestamp-suffixed standard cellKey amount rendering in MainTable', async () => {
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
            { id: 'e2', cellKey: 'catB_2026-08_1700000000', amount: 22000, currency: 'HUF' }
        ],
        items: [{ id: 'catB', name: 'Kategória B' }],
        months: ['2026-08'],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    assert.ok(document.body.innerHTML.includes('22'), 'Timestamped standard cellKey amount rendered in cell');
    assert.ok(document.body.innerHTML.includes('000 Ft'), 'Timestamped standard cellKey currency rendered');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('3. Legacy month-first cellKey amount rendering in MainTable', async () => {
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
            { id: 'e3', cellKey: '2026-08_catC_1700000000', amount: 35000, currency: 'HUF' }
        ],
        items: [{ id: 'catC', name: 'Kategória C' }],
        months: ['2026-08'],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    assert.ok(document.body.innerHTML.includes('35'), 'Legacy month-first cellKey amount rendered in cell');
    assert.ok(document.body.innerHTML.includes('000 Ft'), 'Legacy month-first cellKey currency rendered');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('4. Correct item/month matching without duplicate placement across multiple cells', async () => {
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
            { id: 'e1', cellKey: 'cat1_2026-08', amount: 10000, currency: 'HUF' },
            { id: 'e2', cellKey: 'cat2_2026-08', amount: 20000, currency: 'HUF' }
        ],
        items: [{ id: 'cat1', name: 'Kategória 1' }, { id: 'cat2', name: 'Kategória 2' }],
        months: ['2026-08'],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    const cells = document.querySelectorAll('td.cell-interactive');
    assert.equal(cells.length, 2, 'Exactly 2 data cells rendered');
    assert.ok(cells[0].textContent.includes('10'), 'Cell 1 receives cat1 amount 10000');
    assert.ok(cells[1].textContent.includes('20'), 'Cell 2 receives cat2 amount 20000');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('5. Item IDs containing underscores parse correctly and match target cells', async () => {
    const stdWithUnderscore = parseCellKey('item_A_1_2026-08_1700000000');
    assert.equal(stdWithUnderscore.itemId, 'item_A_1', 'Standard cellKey with underscores in itemId parsed');
    assert.equal(stdWithUnderscore.month, '2026-08');

    const legWithUnderscore = parseCellKey('2026-08_item_B_2_1700000000');
    assert.equal(legWithUnderscore.itemId, 'item_B_2', 'Legacy cellKey with underscores in itemId parsed');
    assert.equal(legWithUnderscore.month, '2026-08');

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
            { id: 'e1', cellKey: 'item_X_9_2026-08_100', amount: 45000, currency: 'HUF' }
        ],
        items: [{ id: 'item_X_9', name: 'Underscore Kategória' }],
        months: ['2026-08'],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    assert.ok(document.body.innerHTML.includes('Underscore Kategória'));
    assert.ok(document.body.innerHTML.includes('45') && document.body.innerHTML.includes('000 Ft'));

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('6. Critical data-load failure remains distinguishable from a genuinely empty database', async () => {
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

    const app = Object.create(App.prototype);
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    entries.load = async () => {
        throw new Error('Critical entries IndexedDB read error');
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
        /Critical entries IndexedDB read error/
    );

    dom.window.close();
});

test('7. Optional background service failure does not hide successfully loaded local data', async () => {
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

    await bootManager._runBackgroundBootTasks();

    assert.ok(reactStoreUpdatedCount > 0, 'updateReactStore() executed in finally block publishing local data despite optional service failure');

    dom.window.close();
});

test('8. Existing successful empty-state behavior remains unchanged when database is genuinely empty', async () => {
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

    useAppStore.getState().setSnapshot({ entries: [], items: [], months: [], eurRate: 400 });

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    assert.ok(document.body.innerHTML.includes('Nincs még adat'), 'Genuinely empty state renders Nincs még adat banner');

    await act(async () => {
        root.unmount();
    });

    dom.window.close();
});

test('9. Derived-month horizontal lazy loading and pagination in MainTable', async () => {
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

    // Create 20 distinct months of entries: 2025-01 through 2026-08
    const mockEntries = [];
    const generatedMonths = [];
    for (let yr = 2025; yr <= 2026; yr++) {
        for (let m = 1; m <= 12; m++) {
            if (yr === 2026 && m > 8) break;
            const monthStr = `${yr}-${String(m).padStart(2, '0')}`;
            generatedMonths.push(monthStr);
            mockEntries.push({
                id: `entry_${monthStr}`,
                itemId: 'catPagination',
                month: monthStr,
                cellKey: `catPagination_${monthStr}`,
                amount: 1000 * m,
                currency: 'HUF'
            });
        }
    }

    assert.equal(generatedMonths.length, 20, '20 distinct months generated');

    // Empty snapshot.months: months MUST be derived from entries
    const mockSnapshot = {
        entries: mockEntries,
        items: [{ id: 'catPagination', name: 'Pagination Test' }],
        months: [], // empty!
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    // Initial render should show the initial limit of 15 months
    let monthHeaders = document.querySelectorAll('th.dblclick-month-purge');
    assert.equal(monthHeaders.length, 15, 'Initially exactly 15 derived months are visible');
    assert.ok(document.body.innerHTML.includes(generatedMonths[0]), 'First month is visible');
    assert.ok(document.body.innerHTML.includes(generatedMonths[14]), '15th month is visible');
    assert.ok(!document.body.innerHTML.includes(generatedMonths[19]), '20th month is not yet visible before scroll');

    // Simulate scrolling near the horizontal end on #vtWrapper
    const wrapper = document.getElementById('vtWrapper');
    assert.ok(wrapper, 'Wrapper element #vtWrapper exists');

    Object.defineProperty(wrapper, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(wrapper, 'scrollLeft', { value: 700, configurable: true }); // 700 + 1000 = 1700 > 2000 - 400

    await act(async () => {
        wrapper.dispatchEvent(new dom.window.Event('scroll'));
    });

    // After scroll, loadedMonths increments from 15 to min(15 + 8, 20) = 20
    monthHeaders = document.querySelectorAll('th.dblclick-month-purge');
    assert.equal(monthHeaders.length, 20, 'After horizontal scroll, all 20 derived months become visible');
    assert.ok(document.body.innerHTML.includes(generatedMonths[19]), '20th month is now visible in the DOM');

    await act(async () => {
        root.unmount();
    });

    dom.window.close();
});
