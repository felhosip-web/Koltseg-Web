import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { convertAmount, formatCurrency } from '../src/utils/currency-utils.js';

let dom;
let originalSetInterval;
let chartInstances = [];

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

    // Canvas 2d context mock
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

    // Mock Chart.js constructor to capture configurations and inspect datasets/callbacks
    chartInstances = [];
    dom.window.Chart = function MockChart(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.destroy = () => {};
        chartInstances.push(this);
    };

    originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = () => 999999;
});

afterEach(() => {
    globalThis.setInterval = originalSetInterval;
    chartInstances = [];
    dom.window.close();
});

test('P2: MainTable renders dual currency correctly and preserves original transaction immutability', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const items = [{ id: 'item1', name: 'Élelmiszer' }];
    const months = ['2026-08'];
    const originalEntries = [
        { id: 'e1', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08', amount: 40000, currency: 'HUF' },
        { id: 'e2', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08_1', amount: 100, currency: 'EUR' }
    ];

    // Deep clone original records before rendering
    const entriesSnapshot = JSON.parse(JSON.stringify(originalEntries));

    useAppStore.setState({
        items,
        months,
        entries: originalEntries,
        eurRate: 400,
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    try {
        await act(async () => {
            root.render(React.createElement(MainTable));
        });

        const cell = rootEl.querySelector('[data-cellbasekey="item1_2026-08"]');
        assert.ok(cell, 'Cell exists in table');
        // In HUF: 40,000 + (100 * 400) = 80,000 Ft. Secondary = 80,000 / 400 = 200.00 EUR
        assert.ok(cell.textContent.includes('80\u00a0000 Ft') || cell.textContent.includes('80 000 Ft'), 'Primary HUF formatted in cell');
        assert.ok(cell.textContent.includes('200,00 EUR') || cell.textContent.includes('200.00 EUR'), 'Secondary EUR formatted in cell');

        // Switch to EUR
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'EUR' });
        });

        // In EUR: (40,000 / 400) + 100 = 200.00 EUR. Secondary = 200 * 400 = 80,000 Ft
        assert.ok(cell.textContent.includes('200,00 EUR') || cell.textContent.includes('200.00 EUR'), 'Primary EUR formatted in cell');
        assert.ok(cell.textContent.includes('80\u00a0000 Ft') || cell.textContent.includes('80 000 Ft'), 'Secondary HUF formatted in cell');

        // Switch back to HUF
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'HUF' });
        });

        assert.ok(cell.textContent.includes('80\u00a0000 Ft') || cell.textContent.includes('80 000 Ft'), 'Primary HUF restored in cell');
        assert.ok(cell.textContent.includes('200,00 EUR') || cell.textContent.includes('200.00 EUR'), 'Secondary EUR restored in cell');

        // Assert that the original transaction objects were NEVER mutated
        const currentEntries = useAppStore.getState().entries;
        assert.equal(currentEntries.length, entriesSnapshot.length);
        for (let i = 0; i < currentEntries.length; i++) {
            assert.equal(currentEntries[i].amount, entriesSnapshot[i].amount, `Transaction ${i} amount unmodified`);
            assert.equal(currentEntries[i].currency, entriesSnapshot[i].currency, `Transaction ${i} currency unmodified`);
            assert.equal(currentEntries[i].id, entriesSnapshot[i].id);
            assert.equal(currentEntries[i].cellKey, entriesSnapshot[i].cellKey);
        }
    } finally {
        await act(async () => {
            root.unmount();
        });
    }
});

test('P2: Dashboard aggregates mixed HUF and EUR transactions in primary currency and preserves transactions', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: DashboardTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/dashboard/DashboardTab.jsx')
    ]);

    const items = [{ id: 'item1', name: 'Albi' }];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentDayStr = `${currentMonth}-10`;

    const originalEntries = [
        { id: 'e1', itemId: 'item1', month: currentMonth, cellKey: `item1_${currentMonth}`, amount: 80000, currency: 'HUF', isStorno: false },
        { id: 'e2', itemId: 'item1', month: currentMonth, cellKey: `item1_${currentMonth}_1`, amount: 50, currency: 'EUR', isStorno: false } // 50 EUR * 400 = 20,000 HUF
    ];
    const originalIncomings = [
        { id: 'inc1', date: currentDayStr, sender: 'Munkahely', amount: 150000, currency: 'HUF' }
    ];

    const entriesSnapshot = JSON.parse(JSON.stringify(originalEntries));
    const incomingsSnapshot = JSON.parse(JSON.stringify(originalIncomings));

    useAppStore.setState({
        items,
        months: [currentMonth],
        entries: originalEntries,
        incomings: originalIncomings,
        fuelLogs: [],
        eurRate: 400,
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    try {
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
            useAppStore.setState({ primaryCurrency: 'EUR' });
        });

        assert.ok(rootEl.textContent.includes('250,00 EUR') || rootEl.textContent.includes('250.00 EUR'), 'Dashboard aggregates total expenses in EUR');
        assert.ok(rootEl.textContent.includes('375,00 EUR') || rootEl.textContent.includes('375.00 EUR'), 'Dashboard aggregates incomings in EUR');
        assert.ok(rootEl.textContent.includes('125,00 EUR') || rootEl.textContent.includes('125.00 EUR'), 'Dashboard aggregates balance in EUR');

        // Verify transaction immutability
        const currentEntries = useAppStore.getState().entries;
        assert.deepEqual(currentEntries, entriesSnapshot, 'Entries unchanged after EUR switch');
        const currentIncomings = useAppStore.getState().incomings;
        assert.deepEqual(currentIncomings, incomingsSnapshot, 'Incomings unchanged after EUR switch');
    } finally {
        await act(async () => {
            root.unmount();
        });
    }
});

test('P2: StatsTab aggregates mixed-currency entries across all payment methods, incomings, and top sender under HUF and EUR', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: StatsTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/stats/StatsTab.jsx')
    ]);

    const originalEntries = [
        { id: 'e1', amount: 40000, currency: 'HUF', paymentMethod: 'Kártya' },
        { id: 'e2', amount: 100, currency: 'EUR', paymentMethod: 'Készpénz' }, // 40,000 HUF
        { id: 'e3', amount: 50, currency: 'EUR', paymentMethod: 'Utalás' } // 20,000 HUF
    ];
    const originalIncomings = [
        { id: 'i1', sender: 'Cég Kft', amount: 200000, currency: 'HUF', date: '2026-08-01' }
    ];

    const entriesSnapshot = JSON.parse(JSON.stringify(originalEntries));
    const incomingsSnapshot = JSON.parse(JSON.stringify(originalIncomings));

    useAppStore.setState({
        entries: originalEntries,
        incomings: originalIncomings,
        eurRate: 400,
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    try {
        await act(async () => {
            root.render(React.createElement(StatsTab));
        });

        // HUF Assertions:
        // Total = 40,000 + 40,000 + 20,000 = 100,000 Ft
        // Card = 40,000 Ft
        // Cash = 40,000 Ft
        // Transfer = 20,000 Ft
        // Incoming total = 200,000 Ft
        // Balance = 200,000 - 100,000 = 100,000 Ft
        // Top sender = Cég Kft (200 000 Ft)
        const textHuf = rootEl.textContent;
        assert.ok(textHuf.includes('100\u00a0000 Ft') || textHuf.includes('100 000 Ft'), 'StatsTab total expenses in HUF');
        assert.ok(textHuf.includes('40\u00a0000 Ft') || textHuf.includes('40 000 Ft'), 'StatsTab card/cash in HUF');
        assert.ok(textHuf.includes('20\u00a0000 Ft') || textHuf.includes('20 000 Ft'), 'StatsTab transfer in HUF');
        assert.ok(textHuf.includes('200\u00a0000 Ft') || textHuf.includes('200 000 Ft'), 'StatsTab total incoming in HUF');
        assert.ok(textHuf.includes('Cég Kft (200\u00a0000 Ft)') || textHuf.includes('Cég Kft (200 000 Ft)'), 'StatsTab top sender in HUF');

        // Switch to EUR
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'EUR' });
        });

        // EUR Assertions:
        // Total = 100,000 / 400 = 250.00 EUR
        // Card = 40,000 / 400 = 100.00 EUR
        // Cash = 100.00 EUR
        // Transfer = 50.00 EUR
        // Incoming total = 200,000 / 400 = 500.00 EUR
        // Balance = 500 - 250 = 250.00 EUR
        // Top sender = Cég Kft (500,00 EUR)
        const textEur = rootEl.textContent;
        assert.ok(textEur.includes('250,00 EUR') || textEur.includes('250.00 EUR'), 'StatsTab total expenses in EUR');
        assert.ok(textEur.includes('100,00 EUR') || textEur.includes('100.00 EUR'), 'StatsTab card/cash in EUR');
        assert.ok(textEur.includes('50,00 EUR') || textEur.includes('50.00 EUR'), 'StatsTab transfer in EUR');
        assert.ok(textEur.includes('500,00 EUR') || textEur.includes('500.00 EUR'), 'StatsTab total incoming in EUR');
        assert.ok(textEur.includes('Cég Kft (500,00 EUR)') || textEur.includes('Cég Kft (500.00 EUR)'), 'StatsTab top sender in EUR');

        // Switch back to HUF
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'HUF' });
        });

        // Verify transactions immutability
        assert.deepEqual(useAppStore.getState().entries, entriesSnapshot);
        assert.deepEqual(useAppStore.getState().incomings, incomingsSnapshot);
    } finally {
        await act(async () => {
            root.unmount();
        });
    }
});

test('P2: ChartsTab computes monetary chart datasets and tooltips in primary currency and preserves fuel metrics across HUF and EUR', async () => {
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
    // item1: 80,000 HUF (card)
    // item2: 100 EUR (cash) -> at 400 rate = 40,000 HUF
    const entries = [
        { id: 'e1', itemId: 'item1', cellKey: 'item1_2026-08', amount: 80000, currency: 'HUF', paymentMethod: 'Kártya' },
        { id: 'e2', itemId: 'item2', cellKey: 'item2_2026-08', amount: 100, currency: 'EUR', paymentMethod: 'Készpénz' }
    ];
    const incomings = [
        { id: 'i1', date: '2026-08-05', amount: 120000, currency: 'HUF' }
    ];
    const fuelLogs = [
        { id: 'f1', date: '2026-08-01 10:00', timestamp: 1785578400000, odo: 10000, liters: 40, price: 620, totalCost: 24800 },
        { id: 'f2', date: '2026-08-15 10:00', timestamp: 1786788000000, odo: 10500, liters: 35, price: 630, totalCost: 22050 }
    ];

    useAppStore.setState({
        items,
        months: ['2026-08'],
        entries,
        incomings,
        fuelLogs,
        eurRate: 400,
        primaryCurrency: 'HUF',
        isLoaded: true
    });

    const rootEl = dom.window.document.getElementById('root');
    const root = createRoot(rootEl);

    try {
        await act(async () => {
            root.render(React.createElement(ChartsTab));
        });

        // 1. Verify HUF Chart Configurations
        const barChartHuf = chartInstances.find(c => c.config?.type === 'bar');
        assert.ok(barChartHuf, 'Bar chart created');
        assert.equal(barChartHuf.config.data.datasets[0].label, 'Kiadások (Ft)', 'Bar chart dataset label in HUF');
        // Lakhatás: 80,000; Utazás: 100 EUR * 400 = 40,000
        assert.deepEqual(barChartHuf.config.data.datasets[0].data, [80000, 40000], 'Bar chart numeric data aggregated in HUF');

        // Verify Bar chart tooltip formatter callback in HUF
        const barTooltipHuf = barChartHuf.config.options?.plugins?.tooltip?.callbacks?.label;
        assert.equal(typeof barTooltipHuf, 'function');
        const formattedBarHuf = barTooltipHuf({ parsed: { y: 80000 } });
        assert.ok(formattedBarHuf.includes('80\u00a0000 Ft') || formattedBarHuf.includes('80 000 Ft'), 'Bar tooltip formats in HUF');

        // Doughnut payment method chart in HUF:
        // Cash: 40,000 Ft, Card: 80,000 Ft, Transfer: 0
        const doughnutChartHuf = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0] === 'Készpénz');
        assert.ok(doughnutChartHuf, 'Payment doughnut chart created');
        assert.deepEqual(doughnutChartHuf.config.data.datasets[0].data, [40000, 80000, 0], 'Payment methods aggregated in HUF');

        // Currency doughnut chart in HUF:
        // HUF entries: 80,000 Ft, EUR entries: 100 EUR = 40,000 Ft
        const currencyChartHuf = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0].includes('HUF'));
        assert.ok(currencyChartHuf, 'Currency distribution chart created');
        assert.equal(currencyChartHuf.config.data.labels[0], 'HUF bejegyzések (Ft)');
        assert.equal(currencyChartHuf.config.data.labels[1], 'EUR bejegyzések (Ft)');
        assert.deepEqual(currencyChartHuf.config.data.datasets[0].data, [80000, 40000]);

        // Fuel charts: verify original metrics are NOT converted to currency
        const odoChart = chartInstances.find(c => c.config?.data?.datasets[0]?.label === 'Km állás (km)');
        assert.ok(odoChart, 'Odometer chart created');
        assert.deepEqual(odoChart.config.data.datasets[0].data, [10000, 10500], 'Odometer retains raw km values');

        const consChart = chartInstances.find(c => c.config?.data?.datasets[0]?.label === 'Átlagfogyasztás (l/100km)');
        assert.ok(consChart, 'Consumption chart created');
        // dist = 500 km, liters = 35 -> (35 * 100) / 500 = 7.0 l/100km
        assert.deepEqual(consChart.config.data.datasets[0].data, [7], 'Fuel consumption in l/100km');

        const priceChart = chartInstances.find(c => c.config?.data?.datasets[0]?.label === 'Üzemanyagár (Ft/l)');
        assert.ok(priceChart, 'Fuel price chart created');
        assert.deepEqual(priceChart.config.data.datasets[0].data, [620, 630], 'Fuel price in Ft/l');

        // 2. Switch primary currency to EUR
        chartInstances = [];
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'EUR' });
        });

        const barChartEur = chartInstances.find(c => c.config?.type === 'bar');
        assert.ok(barChartEur, 'Bar chart recreated for EUR');
        assert.equal(barChartEur.config.data.datasets[0].label, 'Kiadások (EUR)', 'Bar chart dataset label in EUR');
        // Lakhatás: 80,000 / 400 = 200 EUR; Utazás: 100 EUR
        assert.deepEqual(barChartEur.config.data.datasets[0].data, [200, 100], 'Bar chart numeric data aggregated in EUR');

        // Tooltip in EUR
        const barTooltipEur = barChartEur.config.options?.plugins?.tooltip?.callbacks?.label;
        const formattedBarEur = barTooltipEur({ parsed: { y: 200 } });
        assert.ok(formattedBarEur.includes('200,00 EUR') || formattedBarEur.includes('200.00 EUR'), 'Bar tooltip formats in EUR');

        // Payment doughnut in EUR:
        // Cash: 100 EUR, Card: 200 EUR, Transfer: 0
        const doughnutChartEur = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0] === 'Készpénz');
        assert.ok(doughnutChartEur, 'Payment doughnut recreated for EUR');
        assert.deepEqual(doughnutChartEur.config.data.datasets[0].data, [100, 200, 0], 'Payment methods aggregated in EUR');

        // Currency distribution in EUR:
        const currencyChartEur = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0].includes('HUF'));
        assert.ok(currencyChartEur, 'Currency distribution chart recreated for EUR');
        assert.equal(currencyChartEur.config.data.labels[0], 'HUF bejegyzések (EUR)');
        assert.equal(currencyChartEur.config.data.labels[1], 'EUR bejegyzések (EUR)');
        assert.deepEqual(currencyChartEur.config.data.datasets[0].data, [200, 100]);

        // Fuel charts in EUR mode: must still maintain physical units (km, l/100km, Ft/l)
        const priceChartInEurMode = chartInstances.find(c => c.config?.data?.datasets[0]?.label === 'Üzemanyagár (Ft/l)');
        assert.ok(priceChartInEurMode, 'Fuel price chart retains Ft/l label even under EUR mode');
        assert.deepEqual(priceChartInEurMode.config.data.datasets[0].data, [620, 630]);
    } finally {
        await act(async () => {
            root.unmount();
        });
    }
});

test('P2: Exchange rate fallbacks handle null, zero, missing, and non-finite rates safely without NaN or fabricated values', async () => {
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

    const fallbackTestCases = [
        { name: 'eurRate = null', rate: null },
        { name: 'eurRate = 0', rate: 0 },
        { name: 'eurRate missing/undefined', rate: undefined },
        { name: 'eurRate = NaN', rate: NaN },
        { name: 'eurRate = -400 (negative/invalid)', rate: -400 },
        { name: 'eurRate = Infinity', rate: Infinity }
    ];

    for (const tc of fallbackTestCases) {
        // Test utility layer directly first
        const crossHufToEur = convertAmount(5000, 'HUF', 'EUR', tc.rate);
        assert.equal(crossHufToEur, null, `Utility must return null for cross-conversion with ${tc.name}`);

        const sameCurrencyIdentity = convertAmount(5000, 'HUF', 'HUF', tc.rate);
        assert.equal(sameCurrencyIdentity, 5000, `Utility preserves identity for same-currency without rate`);

        // Test MainTable component rendering under this condition
        useAppStore.setState({
            items,
            months,
            entries,
            eurRate: tc.rate,
            primaryCurrency: 'HUF',
            isLoaded: true
        });

        const rootEl = dom.window.document.getElementById('root');
        const root = createRoot(rootEl);

        try {
            await act(async () => {
                root.render(React.createElement(MainTable));
            });

            const cell = rootEl.querySelector('[data-cellbasekey="item1_2026-08"]');
            assert.ok(cell, `Cell exists for ${tc.name}`);
            const cellText = cell.textContent;

            // Must NOT contain corrupted or fabricated display strings
            assert.ok(!cellText.includes('NaN'), `Must not display NaN for ${tc.name}`);
            assert.ok(!cellText.includes('undefined'), `Must not display undefined for ${tc.name}`);
            assert.ok(!cellText.includes('null'), `Must not display null for ${tc.name}`);
            assert.ok(!cellText.includes('Infinity'), `Must not display Infinity for ${tc.name}`);
        } finally {
            await act(async () => {
                root.unmount();
            });
        }
    }
});
