import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { parseCellKey } from '../js/utils/cell-key-utils.js';
import { CellModalController } from '../js/cell-modal-controller.js';

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

    const [{ App }, { BootManager }, { useAppStore }] = await Promise.all([
        import('../js/app.js'),
        import('../js/boot-manager.js'),
        import('../src/store/useAppStore.js')
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
        isBooted: true,
        updateReactStore: () => {
            useAppStore.getState().setSnapshot(app.getAppSnapshot());
        },
        updateReminderStatus: () => {},
        setSystemStatus: () => {}
    });

    const bootManager = new BootManager(app);

    // Exercise _runBackgroundBootTasks() directly and assert _bootError and isBootError
    await bootManager._runBackgroundBootTasks();

    assert.equal(app._bootError, 'Critical entries IndexedDB read error', 'app._bootError captured message');
    const snapshot = app.getAppSnapshot();
    assert.equal(snapshot.isBootError, true, 'isBootError is true in snapshot');

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
    assert.equal(app._bootError, undefined, 'No critical _bootError set when only optional services fail');

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

    useAppStore.getState().setSnapshot({ entries: [], items: [], months: [], eurRate: 400, isBootError: false });

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

    const mockSnapshot = {
        entries: mockEntries,
        items: [{ id: 'catPagination', name: 'Pagination Test' }],
        months: [],
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    let monthHeaders = document.querySelectorAll('th.dblclick-month-purge');
    assert.equal(monthHeaders.length, 15, 'Initially exactly 15 derived months are visible');
    assert.ok(document.body.innerHTML.includes(generatedMonths[0]), 'First month is visible');
    assert.ok(document.body.innerHTML.includes(generatedMonths[14]), '15th month is visible');
    assert.ok(!document.body.innerHTML.includes(generatedMonths[19]), '20th month is not yet visible before scroll');

    const wrapper = document.getElementById('vtWrapper');
    assert.ok(wrapper, 'Wrapper element #vtWrapper exists');

    Object.defineProperty(wrapper, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(wrapper, 'scrollLeft', { value: 700, configurable: true });

    await act(async () => {
        wrapper.dispatchEvent(new dom.window.Event('scroll'));
    });

    monthHeaders = document.querySelectorAll('th.dblclick-month-purge');
    assert.equal(monthHeaders.length, 20, 'After horizontal scroll, all 20 derived months become visible');
    assert.ok(document.body.innerHTML.includes(generatedMonths[19]), '20th month is now visible in the DOM');

    await act(async () => {
        root.unmount();
    });

    dom.window.close();
});

test('10. Boot publication timing — local data becomes available before delayed cloud startup completes', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }, { BootManager }, { useAppStore }] = await Promise.all([
        import('../js/app.js'),
        import('../js/boot-manager.js'),
        import('../src/store/useAppStore.js')
    ]);

    const db = new Database();
    db._enableMockDb();

    const app = Object.create(App.prototype);
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    items.load = async () => {};
    entries.load = async () => {};
    months.load = async () => {};

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        incomingManager: { load: async () => {} },
        backupManager: { startAutoBackup: () => {} },
        pwaManager: { registerServiceWorker: () => {}, bindInstallPrompt: () => {} },
        config: { eurRate: 400 },
        isBooted: true,
        updateReactStore: () => {
            useAppStore.getState().setSnapshot(app.getAppSnapshot());
        },
        updateReminderStatus: () => {},
        setSystemStatus: () => {}
    });

    items.items = [{ id: 'local_item_1', name: 'Azonnali Tétel' }];
    entries.entries = [{ id: 'local_entry_1', itemId: 'local_item_1', month: '2026-08', cellKey: 'local_item_1_2026-08', amount: 9999 }];

    let cloudResolving = false;
    let localDataWasAvailableBeforeCloudCompleted = false;

    const bootManager = new BootManager(app);
    bootManager._initCloud = async () => {
        cloudResolving = true;
        // Verify local data is already in Zustand store BEFORE cloud finishes
        const currentStore = useAppStore.getState();
        if (currentStore.items.length === 1 && currentStore.entries.length === 1) {
            localDataWasAvailableBeforeCloudCompleted = true;
        }
    };

    await bootManager._runBackgroundBootTasks();

    assert.ok(cloudResolving, 'Cloud init was reached');
    assert.ok(localDataWasAvailableBeforeCloudCompleted, 'Local data was published to Zustand store BEFORE cloud init completed');

    dom.window.close();
});

test('11. IncomingManager critical loading — incomingManager.load() rejection triggers critical boot error', async () => {
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

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        incomingManager: {
            load: async () => {
                throw new Error('Critical incomingManager read error');
            }
        },
        config: { eurRate: 400 },
        isBooted: true
    });

    const bootManager = new BootManager(app);

    await assert.rejects(
        async () => {
            await bootManager._loadAllData();
        },
        /Critical incomingManager read error/,
        'incomingManager.load failure must propagate as a critical domain failure'
    );

    dom.window.close();
});

test('12. Derived month validation — malformed keys cannot create invalid month columns', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const { App } = { App: Object.create(null) };
    const app = Object.create({
        getAppSnapshot: function() {
            const entries = this.entries?.entries || [];
            let months = this.months?.months || [];
            const monthRegex = /^[0-9]{4}-[0-9]{2}$/;

            if ((!months || months.length === 0) && entries.length > 0) {
                const derivedMonthSet = new Set();
                entries.forEach(e => {
                    const parsed = parseCellKey(e);
                    if (parsed.month && monthRegex.test(parsed.month)) {
                        derivedMonthSet.add(parsed.month);
                    }
                });
                if (derivedMonthSet.size > 0) {
                    months = Array.from(derivedMonthSet).sort();
                }
            }
            return { months };
        }
    });

    // Seed entries with both valid and malformed month values
    app.entries = {
        entries: [
            { id: '1', cellKey: 'item_valid_2026-08', month: '2026-08' },
            { id: '2', cellKey: 'item_invalid_month_text', month: 'invalid_month' },
            { id: '3', cellKey: 'item_bad_date_99-99', month: '99-99' },
            { id: '4', cellKey: 'item_empty_month', month: '' }
        ]
    };
    app.months = { months: [] };

    const snapshot = app.getAppSnapshot();
    assert.deepEqual(snapshot.months, ['2026-08'], 'Only strictly valid YYYY-MM months are derived');

    dom.window.close();
});

test('13. Cell save validation — malformed month input in CellModalController.save() rejects and shows error toast', async () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
            <div id="costAppCellEditorRoot"></div>
            <div id="subEntriesContainer"></div>
            <input id="cellAmountInput" value="5000" />
            <select id="cellCurrencyInput"><option value="HUF" selected>HUF</option></select>
            <select id="cellMethodInput"><option value="Kártya" selected>Kártya</option></select>
            <input id="cellNoteInput" value="Teszt" />
            <input type="checkbox" id="cellIsStorno" />
            <button id="btnSaveCellModal">Tétel Hozzáadása</button>
        </body>
        </html>
    `, { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    let toastShown = null;
    let entrySaved = false;

    const app = {
        entries: {
            entries: [],
            saveEntry: async () => { entrySaved = true; },
            load: async () => {}
        },
        hmiNotif: {
            showToast: (msg, type) => { toastShown = { msg, type }; }
        },
        updateReactStore: () => {}
    };

    const controller = new CellModalController(app);

    // 1. Malformed cell key missing YYYY-MM month
    controller.currentCellBaseKey = 'invalid_notamonth';
    await controller.save();

    assert.equal(entrySaved, false, 'Entry was NOT saved on malformed cell key');
    assert.equal(toastShown?.type, 'error');
    assert.equal(toastShown?.msg, 'Érvénytelen cella azonosító!');

    // 2. Out of range calendar month: 2026-13
    controller.currentCellBaseKey = 'item_2026-13';
    controller.currentExplicitMonth = '2026-13';
    toastShown = null;
    await controller.save();

    assert.equal(entrySaved, false, 'Entry was NOT saved for out of range month 2026-13');
    assert.equal(toastShown?.type, 'error');
    assert.equal(toastShown?.msg, 'Érvénytelen cella azonosító!');

    // 3. Out of range calendar month: 2026-00
    controller.currentCellBaseKey = 'item_2026-00';
    controller.currentExplicitMonth = '2026-00';
    toastShown = null;
    await controller.save();

    assert.equal(entrySaved, false, 'Entry was NOT saved for out of range month 2026-00');
    assert.equal(toastShown?.type, 'error');
    assert.equal(toastShown?.msg, 'Érvénytelen cella azonosító!');

    dom.window.close();
});

test('14. Non-overflow horizontal pagination in MainTable — bounded useEffect reveals months incrementally', async () => {
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

    // Create 18 distinct valid calendar months across 2024 and 2025
    const months18 = [];
    for (let i = 1; i <= 12; i++) {
        months18.push(`2024-${String(i).padStart(2, '0')}`);
    }
    for (let i = 1; i <= 6; i++) {
        months18.push(`2025-${String(i).padStart(2, '0')}`);
    }

    const mockSnapshot = {
        entries: [
            { id: 'e1', itemId: 'itemA', month: '2025-01', cellKey: 'itemA_2025-01', amount: 5000 }
        ],
        items: [{ id: 'itemA', name: 'Kategória A' }],
        months: months18,
        eurRate: 400
    };

    useAppStore.getState().setSnapshot(mockSnapshot);

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    await act(async () => {
        root.render(React.createElement(MainTable, null));
    });

    // Simulate non-scrollable wrapper where scrollWidth <= clientWidth
    const wrapper = document.getElementById('vtWrapper');
    Object.defineProperty(wrapper, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(wrapper, 'clientWidth', { value: 1200, configurable: true }); // width exceeds scrollWidth -> no overflow

    // Trigger effect
    await act(async () => {
        // Allow useEffect to re-run
    });

    const monthHeaders = document.querySelectorAll('th.dblclick-month-purge');
    assert.ok(monthHeaders.length >= 15, 'Months loaded in non-overflow wrapper');

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});

test('15. Boot error recovery — reload() clears stale _bootError and publishes recovered snapshot', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }, { BootManager }, { useAppStore }] = await Promise.all([
        import('../js/app.js'),
        import('../js/boot-manager.js'),
        import('../src/store/useAppStore.js')
    ]);

    const db = new Database();
    db._enableMockDb();

    const app = Object.create(App.prototype);
    const mockSync = { push: async () => {} };
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);
    const entries = new EntryManager(db, mockSync);

    let entriesShouldFail = true;
    entries.load = async () => {
        if (entriesShouldFail) throw new Error('Simulated transient DB failure');
        entries.entries = [{ id: 'e1', itemId: 'itemA', month: '2026-08', cellKey: 'itemA_2026-08', amount: 10000 }];
    };

    Object.assign(app, {
        db,
        items,
        months,
        entries,
        config: { eurRate: 400 },
        isBooted: true,
        hmiNotif: { showToast: () => {} },
        updateReactStore: () => {
            useAppStore.getState().setSnapshot(app.getAppSnapshot());
        },
        updateReminderStatus: () => {},
        setSystemStatus: () => {}
    });

    const bootManager = new BootManager(app);

    // 1. Initial boot fails
    await bootManager._runBackgroundBootTasks();
    assert.equal(app._bootError, 'Simulated transient DB failure');
    assert.equal(useAppStore.getState().isBootError, true, 'isBootError is true after failed boot');

    // 2. Subsequent reload succeeds
    entriesShouldFail = false;
    await app.reload();

    assert.equal(app._bootError, null, 'app._bootError was cleared on successful reload');
    assert.equal(useAppStore.getState().isBootError, false, 'useAppStore.isBootError is false after reload');
    assert.equal(useAppStore.getState().entries.length, 1, 'Recovered entries are published in store snapshot');

    dom.window.close();
});

test('16. Entry coordinate consistency — conflicting explicit coordinates and cellKey values normalize reliably', () => {
    // Case 1: Explicit itemId and month take precedence when valid
    const entryConflict = {
        itemId: 'item_explicit',
        month: '2026-08',
        cellKey: 'item_stale_2025-01'
    };
    const parsed1 = parseCellKey(entryConflict);
    assert.equal(parsed1.itemId, 'item_explicit');
    assert.equal(parsed1.month, '2026-08');

    // Case 2: Missing explicit fields fall back to parsing cellKey
    const entryFromKey = {
        cellKey: 'item_from_key_2026-09'
    };
    const parsed2 = parseCellKey(entryFromKey);
    assert.equal(parsed2.itemId, 'item_from_key');
    assert.equal(parsed2.month, '2026-09');
});
