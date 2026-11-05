import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { convertAmount } from '../src/utils/currency-utils.js';

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

test('P2: MainTable asserts distinct primary and secondary elements across HUF and EUR switches and verifies immutability', async () => {
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

        // Locate distinct primary and secondary DOM elements inside the cell
        const primaryEl = cell.querySelector('.font-bold.text-gray-800');
        const secondaryEl = cell.querySelector('.text-\\[10px\\].text-gray-500');
        assert.ok(primaryEl, 'Primary currency element exists');
        assert.ok(secondaryEl, 'Secondary currency element exists');

        // 1. HUF mode role verification:
        // Primary must strictly contain HUF amount: 80,000 Ft
        // Secondary must strictly contain EUR equivalent: 200,00 EUR
        assert.ok(primaryEl.textContent.includes('80\u00a0000 Ft') || primaryEl.textContent.includes('80 000 Ft'), 'Primary element contains HUF');
        assert.ok(!primaryEl.textContent.includes('EUR') && !primaryEl.textContent.includes('€'), 'Primary element does not contain EUR in HUF mode');
        assert.ok(secondaryEl.textContent.includes('200,00 EUR') || secondaryEl.textContent.includes('200.00 EUR'), 'Secondary element contains EUR');
        assert.ok(!secondaryEl.textContent.includes('Ft'), 'Secondary element does not contain Ft in HUF mode');

        // 2. Switch to EUR mode:
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'EUR' });
        });

        // Roles MUST swap:
        // Primary element must now contain EUR amount: 200,00 EUR
        // Secondary element must now contain HUF equivalent: 80,000 Ft
        const primaryElEur = cell.querySelector('.font-bold.text-gray-800');
        const secondaryElEur = cell.querySelector('.text-\\[10px\\].text-gray-500');
        assert.ok(primaryElEur.textContent.includes('200,00 EUR') || primaryElEur.textContent.includes('200.00 EUR'), 'Primary element contains EUR in EUR mode');
        assert.ok(!primaryElEur.textContent.includes('Ft'), 'Primary element does not contain Ft in EUR mode');
        assert.ok(secondaryElEur.textContent.includes('80\u00a0000 Ft') || secondaryElEur.textContent.includes('80 000 Ft'), 'Secondary element contains HUF in EUR mode');
        assert.ok(!secondaryElEur.textContent.includes('EUR') && !secondaryElEur.textContent.includes('€'), 'Secondary element does not contain EUR in EUR mode');

        // 3. Switch back to HUF:
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'HUF' });
        });

        const primaryElRestored = cell.querySelector('.font-bold.text-gray-800');
        const secondaryElRestored = cell.querySelector('.text-\\[10px\\].text-gray-500');
        assert.ok(primaryElRestored.textContent.includes('80\u00a0000 Ft') || primaryElRestored.textContent.includes('80 000 Ft'), 'Primary restored to HUF');
        assert.ok(secondaryElRestored.textContent.includes('200,00 EUR') || secondaryElRestored.textContent.includes('200.00 EUR'), 'Secondary restored to EUR');

        // 4. Assert that the original transaction objects in store were NEVER mutated
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

test('P2: StatsTab aggregates mixed-currency entries across explicitly labeled UI elements under HUF and EUR', async () => {
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

    // Helper to find a card's value paragraph by its label
    const getCardValueByLabel = (container, labelText) => {
        const paragraphs = Array.from(container.querySelectorAll('p'));
        const labelP = paragraphs.find(p => p.textContent.trim().includes(labelText));
        if (!labelP) return null;
        const parentCard = labelP.closest('.bg-white');
        if (!parentCard) return null;
        // The value paragraph is the subsequent element with text-[23]xl font-bold
        const valP = parentCard.querySelector('.font-bold.mt-2') || parentCard.querySelectorAll('p')[1];
        return valP ? valP.textContent.trim() : null;
    };

    try {
        await act(async () => {
            root.render(React.createElement(StatsTab));
        });

        // 1. HUF mode explicit card assertions:
        assert.ok(getCardValueByLabel(rootEl, 'Összes kiadás').includes('100\u00a0000 Ft') || getCardValueByLabel(rootEl, 'Összes kiadás').includes('100 000 Ft'), 'Card: Összes kiadás in HUF');
        assert.ok(getCardValueByLabel(rootEl, 'Kártya').includes('40\u00a0000 Ft') || getCardValueByLabel(rootEl, 'Kártya').includes('40 000 Ft'), 'Card: Kártya in HUF');
        assert.ok(getCardValueByLabel(rootEl, 'Készpénz').includes('40\u00a0000 Ft') || getCardValueByLabel(rootEl, 'Készpénz').includes('40 000 Ft'), 'Card: Készpénz in HUF');
        assert.ok(getCardValueByLabel(rootEl, 'Utalás').includes('20\u00a0000 Ft') || getCardValueByLabel(rootEl, 'Utalás').includes('20 000 Ft'), 'Card: Utalás in HUF');
        assert.ok(getCardValueByLabel(rootEl, 'Összes bejövő').includes('200\u00a0000 Ft') || getCardValueByLabel(rootEl, 'Összes bejövő').includes('200 000 Ft'), 'Card: Összes bejövő in HUF');
        assert.ok(getCardValueByLabel(rootEl, 'Egyenleg').includes('100\u00a0000 Ft') || getCardValueByLabel(rootEl, 'Egyenleg').includes('100 000 Ft'), 'Card: Egyenleg in HUF');
        assert.ok(getCardValueByLabel(rootEl, 'Legtöbb utaló').includes('Cég Kft (200\u00a0000 Ft)') || getCardValueByLabel(rootEl, 'Legtöbb utaló').includes('Cég Kft (200 000 Ft)'), 'Card: Legtöbb utaló in HUF');

        // 2. Switch to EUR mode:
        await act(async () => {
            useAppStore.setState({ primaryCurrency: 'EUR' });
        });

        // EUR mode explicit card assertions:
        assert.ok(getCardValueByLabel(rootEl, 'Összes kiadás').includes('250,00 EUR') || getCardValueByLabel(rootEl, 'Összes kiadás').includes('250.00 EUR'), 'Card: Összes kiadás in EUR');
        assert.ok(getCardValueByLabel(rootEl, 'Kártya').includes('100,00 EUR') || getCardValueByLabel(rootEl, 'Kártya').includes('100.00 EUR'), 'Card: Kártya in EUR');
        assert.ok(getCardValueByLabel(rootEl, 'Készpénz').includes('100,00 EUR') || getCardValueByLabel(rootEl, 'Készpénz').includes('100.00 EUR'), 'Card: Készpénz in EUR');
        assert.ok(getCardValueByLabel(rootEl, 'Utalás').includes('50,00 EUR') || getCardValueByLabel(rootEl, 'Utalás').includes('50.00 EUR'), 'Card: Utalás in EUR');
        assert.ok(getCardValueByLabel(rootEl, 'Összes bejövő').includes('500,00 EUR') || getCardValueByLabel(rootEl, 'Összes bejövő').includes('500.00 EUR'), 'Card: Összes bejövő in EUR');
        assert.ok(getCardValueByLabel(rootEl, 'Egyenleg').includes('250,00 EUR') || getCardValueByLabel(rootEl, 'Egyenleg').includes('250.00 EUR'), 'Card: Egyenleg in EUR');
        assert.ok(getCardValueByLabel(rootEl, 'Legtöbb utaló').includes('Cég Kft (500,00 EUR)') || getCardValueByLabel(rootEl, 'Legtöbb utaló').includes('Cég Kft (500.00 EUR)'), 'Card: Legtöbb utaló in EUR');

        // 3. Switch back to HUF:
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

test('P2: ChartsTab computes monetary chart datasets and dual-currency tooltips and preserves fuel metrics across HUF and EUR', async () => {
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

        // Verify Bar chart dual-currency tooltip formatter callback in HUF:
        // Must show both primary (80 000 Ft) and secondary (≈ 200,00 EUR)
        const barTooltipHuf = barChartHuf.config.options?.plugins?.tooltip?.callbacks?.label;
        assert.equal(typeof barTooltipHuf, 'function');
        const formattedBarHuf = barTooltipHuf({ parsed: { y: 80000 } });
        assert.ok(formattedBarHuf.includes('80\u00a0000 Ft') || formattedBarHuf.includes('80 000 Ft'), 'Bar tooltip includes primary HUF');
        assert.ok(formattedBarHuf.includes('200,00 EUR') || formattedBarHuf.includes('200.00 EUR'), 'Bar tooltip includes secondary EUR');

        // Doughnut payment method chart in HUF:
        // Cash: 40,000 Ft, Card: 80,000 Ft, Transfer: 0
        const doughnutChartHuf = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0] === 'Készpénz');
        assert.ok(doughnutChartHuf, 'Payment doughnut chart created');
        assert.deepEqual(doughnutChartHuf.config.data.datasets[0].data, [40000, 80000, 0], 'Payment methods aggregated in HUF');

        // Payment doughnut tooltip callback verification in HUF:
        const doughnutTooltipHuf = doughnutChartHuf.config.options?.plugins?.tooltip?.callbacks?.label;
        const formattedDoughnutHuf = doughnutTooltipHuf({ label: 'Kártya', raw: 80000 });
        assert.ok(formattedDoughnutHuf.includes('80\u00a0000 Ft') || formattedDoughnutHuf.includes('80 000 Ft'), 'Doughnut tooltip includes primary HUF');
        assert.ok(formattedDoughnutHuf.includes('200,00 EUR') || formattedDoughnutHuf.includes('200.00 EUR'), 'Doughnut tooltip includes secondary EUR');

        // Currency doughnut chart in HUF:
        // HUF entries: 80,000 Ft, EUR entries: 100 EUR = 40,000 Ft
        const currencyChartHuf = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0].includes('HUF'));
        assert.ok(currencyChartHuf, 'Currency distribution chart created');
        assert.equal(currencyChartHuf.config.data.labels[0], 'HUF bejegyzések (Ft)');
        assert.equal(currencyChartHuf.config.data.labels[1], 'EUR bejegyzések (Ft)');
        assert.deepEqual(currencyChartHuf.config.data.datasets[0].data, [80000, 40000]);

        // Currency distribution tooltip callback verification in HUF:
        const currencyTooltipHuf = currencyChartHuf.config.options?.plugins?.tooltip?.callbacks?.label;
        assert.equal(typeof currencyTooltipHuf, 'function');
        const formattedCurrHuf = currencyTooltipHuf({ label: 'HUF bejegyzések (Ft)', raw: 80000 });
        assert.ok(formattedCurrHuf.includes('80\u00a0000 Ft') || formattedCurrHuf.includes('80 000 Ft'), 'Currency tooltip includes primary HUF');
        assert.ok(formattedCurrHuf.includes('200,00 EUR') || formattedCurrHuf.includes('200.00 EUR'), 'Currency tooltip includes secondary EUR');

        // Incoming Trend chart in HUF:
        // 120,000 HUF -> dataset in HUF, label reflects (Ft), tooltip reflects dual-currency
        const incomingTrendHuf = chartInstances.find(c => c.config?.type === 'line' && c.config.data?.datasets[0]?.label?.includes('Bejövő utalások'));
        assert.ok(incomingTrendHuf, 'Incoming trend chart created in HUF');
        assert.equal(incomingTrendHuf.config.data.datasets[0].label, 'Bejövő utalások (Ft)', 'Incoming trend label in HUF');
        assert.deepEqual(incomingTrendHuf.config.data.datasets[0].data, [120000], 'Incoming trend data in HUF');

        const incomingTooltipHuf = incomingTrendHuf.config.options?.plugins?.tooltip?.callbacks?.label;
        assert.equal(typeof incomingTooltipHuf, 'function');
        const formattedIncHuf = incomingTooltipHuf({ parsed: { y: 120000 } });
        assert.ok(formattedIncHuf.includes('120\u00a0000 Ft') || formattedIncHuf.includes('120 000 Ft'), 'Incoming tooltip includes primary HUF');
        assert.ok(formattedIncHuf.includes('300,00 EUR') || formattedIncHuf.includes('300.00 EUR'), 'Incoming tooltip includes secondary EUR (120,000 / 400)');

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

        // Dual-currency tooltip in EUR mode:
        // Must show both primary (200,00 EUR) and secondary (≈ 80 000 Ft)
        const barTooltipEur = barChartEur.config.options?.plugins?.tooltip?.callbacks?.label;
        const formattedBarEur = barTooltipEur({ parsed: { y: 200 } });
        assert.ok(formattedBarEur.includes('200,00 EUR') || formattedBarEur.includes('200.00 EUR'), 'Bar tooltip includes primary EUR');
        assert.ok(formattedBarEur.includes('80\u00a0000 Ft') || formattedBarEur.includes('80 000 Ft'), 'Bar tooltip includes secondary HUF');

        // Payment doughnut in EUR:
        // Cash: 100 EUR, Card: 200 EUR, Transfer: 0
        const doughnutChartEur = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0] === 'Készpénz');
        assert.ok(doughnutChartEur, 'Payment doughnut recreated for EUR');
        assert.deepEqual(doughnutChartEur.config.data.datasets[0].data, [100, 200, 0], 'Payment methods aggregated in EUR');

        // Payment doughnut tooltip callback in EUR mode:
        const doughnutTooltipEur = doughnutChartEur.config.options?.plugins?.tooltip?.callbacks?.label;
        const formattedDoughnutEur = doughnutTooltipEur({ label: 'Kártya', raw: 200 });
        assert.ok(formattedDoughnutEur.includes('200,00 EUR') || formattedDoughnutEur.includes('200.00 EUR'), 'Doughnut tooltip includes primary EUR');
        assert.ok(formattedDoughnutEur.includes('80\u00a0000 Ft') || formattedDoughnutEur.includes('80 000 Ft'), 'Doughnut tooltip includes secondary HUF');

        // Currency distribution in EUR:
        const currencyChartEur = chartInstances.find(c => c.config?.type === 'doughnut' && c.config.data.labels[0].includes('HUF'));
        assert.ok(currencyChartEur, 'Currency distribution chart recreated for EUR');
        assert.equal(currencyChartEur.config.data.labels[0], 'HUF bejegyzések (EUR)');
        assert.equal(currencyChartEur.config.data.labels[1], 'EUR bejegyzések (EUR)');
        assert.deepEqual(currencyChartEur.config.data.datasets[0].data, [200, 100]);

        // Currency distribution tooltip callback in EUR mode:
        const currencyTooltipEur = currencyChartEur.config.options?.plugins?.tooltip?.callbacks?.label;
        assert.equal(typeof currencyTooltipEur, 'function');
        const formattedCurrEur = currencyTooltipEur({ label: 'HUF bejegyzések (EUR)', raw: 200 });
        assert.ok(formattedCurrEur.includes('200,00 EUR') || formattedCurrEur.includes('200.00 EUR'), 'Currency tooltip includes primary EUR');
        assert.ok(formattedCurrEur.includes('80\u00a0000 Ft') || formattedCurrEur.includes('80 000 Ft'), 'Currency tooltip includes secondary HUF');

        // Incoming Trend chart in EUR mode:
        // 120,000 HUF / 400 = 300 EUR
        const incomingTrendEur = chartInstances.find(c => c.config?.type === 'line' && c.config.data?.datasets[0]?.label?.includes('Bejövő utalások'));
        assert.ok(incomingTrendEur, 'Incoming trend chart recreated in EUR');
        assert.equal(incomingTrendEur.config.data.datasets[0].label, 'Bejövő utalások (EUR)', 'Incoming trend label in EUR');
        assert.deepEqual(incomingTrendEur.config.data.datasets[0].data, [300], 'Incoming trend data in EUR');

        const incomingTooltipEur = incomingTrendEur.config.options?.plugins?.tooltip?.callbacks?.label;
        assert.equal(typeof incomingTooltipEur, 'function');
        const formattedIncEur = incomingTooltipEur({ parsed: { y: 300 } });
        assert.ok(formattedIncEur.includes('300,00 EUR') || formattedIncEur.includes('300.00 EUR'), 'Incoming tooltip includes primary EUR');
        assert.ok(formattedIncEur.includes('120\u00a0000 Ft') || formattedIncEur.includes('120 000 Ft'), 'Incoming tooltip includes secondary HUF (300 * 400)');

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

test('P2: Exchange rate fallbacks and default 400 policy: exact numeric verification without NaN or fabricated values', async () => {
    const [React, { createRoot }, { act }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('react'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const items = [{ id: 'item1', name: 'Élelmiszer' }];
    const months = ['2026-08'];
    // 5000 HUF and 20 EUR
    const entries = [
        { id: 'e1', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08', amount: 5000, currency: 'HUF' },
        { id: 'e2', itemId: 'item1', month: '2026-08', cellKey: 'item1_2026-08_1', amount: 20, currency: 'EUR' }
    ];

    // MainTable uses `rate = eurRate || 400`, which implements the centralized fallback policy (DEFAULT_FALLBACK_EUR_RATE = 400)
    // When rate falls back to 400:
    // In HUF mode:
    // 5000 HUF + (20 EUR * 400) = 5000 + 8000 = 13,000 Ft
    // Secondary = 13000 / 400 = 32.50 EUR
    const fallbackRateScenarios = [
        { name: 'eurRate = null', rate: null, expectedPrimary: '13\u00a0000 Ft', expectedSecondary: '32,50 EUR' },
        { name: 'eurRate = 0', rate: 0, expectedPrimary: '13\u00a0000 Ft', expectedSecondary: '32,50 EUR' },
        { name: 'eurRate = undefined', rate: undefined, expectedPrimary: '13\u00a0000 Ft', expectedSecondary: '32,50 EUR' }
    ];

    for (const tc of fallbackRateScenarios) {
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
            const primaryEl = cell.querySelector('.font-bold.text-gray-800');
            const secondaryEl = cell.querySelector('.text-\\[10px\\].text-gray-500');

            assert.ok(
                primaryEl.textContent.includes(tc.expectedPrimary) || primaryEl.textContent.includes('13 000 Ft'),
                `Primary element shows exact calculated fallback total (13,000 Ft) for ${tc.name}`
            );
            assert.ok(
                secondaryEl.textContent.includes(tc.expectedSecondary) || secondaryEl.textContent.includes('32.50 EUR'),
                `Secondary element shows exact calculated fallback total (32.50 EUR) for ${tc.name}`
            );

            assert.ok(!cell.textContent.includes('NaN'), `No NaN for ${tc.name}`);
            assert.ok(!cell.textContent.includes('undefined'), `No undefined for ${tc.name}`);
            assert.ok(!cell.textContent.includes('null'), `No null for ${tc.name}`);
        } finally {
            await act(async () => {
                root.unmount();
            });
        }
    }

    // Now test extreme invalid rates passed directly into currency utilities
    const extremeCases = [NaN, -400, Infinity];
    for (const invalidRate of extremeCases) {
        const result = convertAmount(5000, 'HUF', 'EUR', invalidRate);
        assert.equal(result, null, `convertAmount returns null for invalid rate: ${invalidRate}`);
    }
});
