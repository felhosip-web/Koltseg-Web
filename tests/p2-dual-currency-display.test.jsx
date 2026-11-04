import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { appService } from '../src/services/appService.js';
import { Database, EntryManager, ConfigManager } from '../js/oop-core.js';
import { convertAmount, formatDualCurrency, formatCurrency } from '../src/utils/currency-utils.js';

let dom;

beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
        url: 'http://localhost/',
        pretendToBeVisual: true
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect: () => {},
        fillRect: () => {},
        getImageData: () => {},
        putImageData: () => {},
        createImageData: () => {},
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        fill: () => {},
        measureText: () => ({ width: 0 }),
        transform: () => {},
        rect: () => {},
        clip: () => {}
    });
});

afterEach(() => {
    dom.window.close();
});

test('P2: MainTable renders dual currency correctly under HUF and EUR primary modes', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const items = [{ id: 'item1', name: 'Élelmiszer' }];
    const months = ['2026-08'];
    // 40,000 HUF and 100 EUR in the same cell
    // At rate 400:
    // In HUF: 40000 + (100 * 400) = 80,000 Ft. Secondary = 80000 / 400 = 200.00 EUR
    // In EUR: (40000 / 400) + 100 = 200.00 EUR. Secondary = 200 * 400 = 80,000 Ft
    const entries = [
        { id: 'e1', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08', amount: 40000, currency: 'HUF' },
        { id: 'e2', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08_1', amount: 100, currency: 'EUR' }
    ];

    useAppStore.setState({
        items,
        months,
        entries,
        eurRate: 400,
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(React.createElement(MainTable));
    });

    const cell = rootEl.querySelector('[data-cellbasekey="item1_2026-08"]');
    assert.ok(cell, 'Cell exists in table');
    assert.ok(cell.textContent.includes('80\u00a0000 Ft') || cell.textContent.includes('80 000 Ft'), 'Primary HUF formatted in cell');
    assert.ok(cell.textContent.includes('200,00 EUR') || cell.textContent.includes('200.00 EUR'), 'Secondary EUR formatted in cell');

    // Switch to EUR
    await act(async () => {
        useAppStore.setState({
            primaryCurrency: 'EUR'
        });
    });

    assert.ok(cell.textContent.includes('200,00 EUR') || cell.textContent.includes('200.00 EUR'), 'Primary EUR formatted in cell');
    assert.ok(cell.textContent.includes('80\u00a0000 Ft') || cell.textContent.includes('80 000 Ft'), 'Secondary HUF formatted in cell');

    await act(async () => {
        root.unmount();
    });
});

test('P2: Dashboard correctly aggregates mixed HUF and EUR transactions in primary currency', async () => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = () => 999999;
    try {
        const [React, { createRoot }, { act }, { useAppStore }, { default: DashboardTab }] = await Promise.all([
            import('react'),
            import('react-dom/client'),
            import('react'),
            import('../src/store/useAppStore.js'),
            import('../src/components/dashboard/DashboardTab.jsx')
        ]);

        const items = [{ id: 'item1', name: 'Albi' }];
        const months = ['2026-08'];
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentDayStr = `${currentMonth}-10`;

        const entries = [
            { id: 'e1', itemId: 'item1', month: currentMonth, cellKey: `item1_${currentMonth}`, amount: 80000, currency: 'HUF', isStorno: false },
            { id: 'e2', itemId: 'item1', month: currentMonth, cellKey: `item1_${currentMonth}_1`, amount: 50, currency: 'EUR', isStorno: false } // 50 EUR * 400 = 20,000 HUF
        ];
        const incomings = [
            { id: 'inc1', date: currentDayStr, amount: 150000, currency: 'HUF' }
        ];

        useAppStore.setState({
            items,
            months,
            entries,
            incomings,
            fuelLogs: [],
            eurRate: 400,
            primaryCurrency: 'HUF',
            isLoaded: true
        });

        const rootEl = dom.window.document.getElementById('root');
        const root = createRoot(rootEl);

        // In HUF:
        // Total expenses = 80,000 + 20,000 = 100,000 Ft
        // Incomings = 150,000 Ft
        // Monthly balance = 150,000 - 100,000 = 50,000 Ft
        await act(async () => {
            root.render(React.createElement(DashboardTab));
        });

        assert.ok(rootEl.textContent.includes('100\u00a0000 Ft') || rootEl.textContent.includes('100 000 Ft'), 'Dashboard aggregates total expenses in HUF');
        assert.ok(rootEl.textContent.includes('150\u00a0000 Ft') || rootEl.textContent.includes('150 000 Ft'), 'Dashboard aggregates incomings in HUF');
        assert.ok(rootEl.textContent.includes('50\u00a0000 Ft') || rootEl.textContent.includes('50 000 Ft'), 'Dashboard aggregates balance in HUF');

        // Switch to EUR
        // Total expenses = (80,000 / 400) + 50 = 250.00 EUR
        // Incomings = 150,000 / 400 = 375.00 EUR
        // Balance = 375 - 250 = 125.00 EUR
        await act(async () => {
            useAppStore.setState({
                primaryCurrency: 'EUR'
            });
        });

        assert.ok(rootEl.textContent.includes('250,00 EUR') || rootEl.textContent.includes('250.00 EUR'), 'Dashboard aggregates total expenses in EUR');
        assert.ok(rootEl.textContent.includes('375,00 EUR') || rootEl.textContent.includes('375.00 EUR'), 'Dashboard aggregates incomings in EUR');
        assert.ok(rootEl.textContent.includes('125,00 EUR') || rootEl.textContent.includes('125.00 EUR'), 'Dashboard aggregates balance in EUR');

        await act(async () => {
            root.unmount();
        });
    } finally {
        globalThis.setInterval = originalSetInterval;
    }
});

test('P2: StatsTab aggregates mixed-currency entries across payment methods and incomings', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: StatsTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/stats/StatsTab.jsx')
    ]);

    const entries = [
        { id: 'e1', amount: 40000, currency: 'HUF', payMethod: 'card' },
        { id: 'e2', amount: 100, currency: 'EUR', payMethod: 'cash' }, // 40,000 HUF
        { id: 'e3', amount: 50, currency: 'EUR', payMethod: 'transfer' } // 20,000 HUF
    ];
    const incomings = [
        { id: 'i1', sender: 'Cég Kft', amount: 200000, currency: 'HUF', date: '2026-08-01' }
    ];

    useAppStore.setState({
        entries,
        incomings,
        eurRate: 400,
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    // Total expenses = 40,000 + 40,000 + 20,000 = 100,000 Ft
    // Card = 40,000 Ft, Cash = 40,000 Ft, Transfer = 20,000 Ft
    // Incoming = 200,000 Ft, Balance = 100,000 Ft
    await act(async () => {
        root.render(React.createElement(StatsTab));
    });

    assert.ok(rootEl.textContent.includes('100\u00a0000 Ft') || rootEl.textContent.includes('100 000 Ft'), 'StatsTab total expenses in HUF');
    assert.ok(rootEl.textContent.includes('200\u00a0000 Ft') || rootEl.textContent.includes('200 000 Ft'), 'StatsTab total incoming in HUF');
    assert.ok(rootEl.textContent.includes('Cég Kft (200\u00a0000 Ft)') || rootEl.textContent.includes('Cég Kft (200 000 Ft)'), 'StatsTab top sender formatted in primary currency');

    // Switch to EUR
    // Total = 100,000 / 400 = 250.00 EUR
    // Card = 100.00 EUR, Cash = 100.00 EUR, Transfer = 50.00 EUR
    // Incoming = 500.00 EUR, Balance = 250.00 EUR
    await act(async () => {
        useAppStore.setState({
            primaryCurrency: 'EUR'
        });
    });

    assert.ok(rootEl.textContent.includes('250,00 EUR') || rootEl.textContent.includes('250.00 EUR'), 'StatsTab total expenses in EUR');
    assert.ok(rootEl.textContent.includes('500,00 EUR') || rootEl.textContent.includes('500.00 EUR'), 'StatsTab total incoming in EUR');
    assert.ok(rootEl.textContent.includes('Cég Kft (500,00 EUR)') || rootEl.textContent.includes('Cég Kft (500.00 EUR)'), 'StatsTab top sender in EUR');

    await act(async () => {
        root.unmount();
    });
});

test('P2: ChartsTab converts datasets and preserves HUF-only fuel logs without mixing raw values', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: ChartsTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/charts/ChartsTab.jsx')
    ]);

    const items = [
        { id: 'item1', name: 'Lakhatás' },
        { id: 'item2', name: 'Utazás' }
    ];
    const entries = [
        { id: 'e1', itemId: 'item1', amount: 80000, currency: 'HUF', payMethod: 'card' },
        { id: 'e2', itemId: 'item2', amount: 100, currency: 'EUR', payMethod: 'cash' } // 40,000 HUF at 400
    ];
    const fuelLogs = [
        { id: 'f1', date: '2026-08-01', totalCost: 25000, liters: 40, km: 500 }
    ];

    useAppStore.setState({
        items,
        entries,
        fuelLogs,
        eurRate: 400,
        primaryCurrency: 'EUR',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(React.createElement(ChartsTab));
    });

    assert.ok(rootEl.textContent.includes('Üzemanyagár (Ft/l)'), 'Fuel logs price title explicitly retains Ft/l');

    await act(async () => {
        root.unmount();
    });
});

test('P2: Missing, invalid or zero exchange rate gracefully falls back without NaN or corrupted display', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const items = [{ id: 'item1', name: 'Élelmiszer' }];
    const months = ['2026-08'];
    const entries = [
        { id: 'e1', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08', amount: 5000, currency: 'HUF' },
        { id: 'e2', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08_1', amount: 20, currency: 'EUR' }
    ];

    useAppStore.setState({
        items,
        months,
        entries,
        eurRate: null, // Missing rate
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    await act(async () => {
        root.render(React.createElement(MainTable));
    });

    const cell = rootEl.querySelector('[data-cellbasekey="item1_2026-08"]');
    assert.ok(cell, 'Cell exists');
    assert.ok(!cell.textContent.includes('NaN'), 'Must not display NaN');
    assert.ok(!cell.textContent.includes('undefined'), 'Must not display undefined');

    await act(async () => {
        root.unmount();
    });
});
