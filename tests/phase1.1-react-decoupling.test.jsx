import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { appService } from '../src/services/appService.js';

function setupEnvironment() {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="root"></div><div id="costAppView" class="hidden"></div><div id="workAppView" class="hidden"></div><div id="appLandingScreenRoot"><div></div></div></body></html>',
        { url: 'http://localhost/' }
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Node = dom.window.Node;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    // Ensure window.app is deleted for pure decoupling test
    delete globalThis.window.app;

    return dom;
}

let savedWindowApp = undefined;

beforeEach(() => {
    if (globalThis.window) {
        savedWindowApp = globalThis.window.app;
    }
});

afterEach(() => {
    appService.unbind();
    if (globalThis.window) {
        if (savedWindowApp !== undefined) {
            globalThis.window.app = savedWindowApp;
        } else {
            delete globalThis.window.app;
        }
    }
});

test('1. appService operates via explicit bind(fakeApp) without global window.app', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    let testDataCalls = 0;
    let monthSeqCalls = [];
    let cellClickCalls = [];

    const fakeApp = {
        isBooted: true,
        generateTestData: async (count) => { testDataCalls += count; },
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        updateReactStore: () => {},
        hmiNotif: { showToast: () => {} },
        uiController: {
            handleMonthDeleteSequence: (m) => monthSeqCalls.push(m),
            handleCellClick: (el) => cellClickCalls.push(el)
        }
    };

    appService.bind(fakeApp);

    assert.equal(appService.getAppInstance(), fakeApp);
    assert.equal(globalThis.window.app, undefined);

    await appService.generateTestData(30);
    assert.equal(testDataCalls, 30);

    appService.deleteMonthSequence('2026-09');
    assert.deepEqual(monthSeqCalls, ['2026-09']);

    const fakeEl = { dataset: { cellbasekey: 'item1_2026-09' } };
    appService.handleCellClick(fakeEl);
    assert.equal(cellClickCalls.length, 1);

    dom.window.close();
});

test('2. MainTable mounts and renders with bound appService when window.app is deleted', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: MainTable }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx')
    ]);

    const { act } = React;

    act(() => {
        useAppStore.setState({ items: [], months: [], entries: [], eurRate: 400 });
    });

    let deleteMonthCalls = [];
    let cellClickCalls = [];
    let generateTestDataCalls = 0;

    const fakeApp = {
        isBooted: true,
        generateTestData: async (count) => { generateTestDataCalls += count; },
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        updateReactStore: () => {},
        hmiNotif: { showToast: () => {} },
        uiController: {
            handleMonthDeleteSequence: (m) => deleteMonthCalls.push(m),
            handleCellClick: (el) => cellClickCalls.push(el)
        }
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(MainTable));
    });

    // Renders empty state placeholder when window.app is completely deleted
    assert.ok(container.textContent.includes('Nincs még adat'));

    // Test generate test data button action via Zustand/appService
    const btnGenerate = container.querySelector('#vtGenerateTestData');
    assert.ok(btnGenerate);
    await act(async () => {
        btnGenerate.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(generateTestDataCalls, 30);

    // Reactively updates when Zustand state changes
    await act(async () => {
        useAppStore.setState({
            items: [{ id: 'item-1', name: 'Élelmiszer' }],
            months: ['2026-09'],
            entries: [{ id: 'e-1', cellKey: 'item-1_2026-09', amount: 12000, currency: 'HUF' }],
            eurRate: 400
        });
    });

    assert.ok(container.textContent.includes('Élelmiszer'));
    assert.ok(container.textContent.includes('2026-09'));
    assert.ok(container.textContent.includes((12000).toLocaleString('hu-HU')));

    // Test category dblclick cancel modal does not trigger deletion
    let deleteRowCalls = [];
    const fakeAppCategoryModal = {
        isBooted: true,
        hmiNotif: { showCategoryActionsModal: async () => null }, // User cancels
        uiController: {
            handleRowDeleteSequence: (id, name) => deleteRowCalls.push(id),
            handleMonthDeleteSequence: (m) => deleteMonthCalls.push(m),
            handleCellClick: (el) => cellClickCalls.push(el)
        }
    };
    appService.bind(fakeAppCategoryModal);

    const categoryCell = container.querySelector('td[data-itemid="item-1"]');
    assert.ok(categoryCell);
    await act(async () => {
        categoryCell.dispatchEvent(new Event('dblclick', { bubbles: true, cancelable: true }));
    });
    assert.equal(deleteRowCalls.length, 0, 'Cancelling category modal should NOT trigger row deletion');

    // Test month dblclick handler through appService
    const monthHeader = container.querySelector('th[data-month="2026-09"]');
    assert.ok(monthHeader);
    await act(async () => {
        monthHeader.dispatchEvent(new Event('dblclick', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(deleteMonthCalls, ['2026-09']);

    // Test cell click handler through appService
    const dataCell = container.querySelector('td[data-cellbasekey="item-1_2026-09"]');
    assert.ok(dataCell);
    await act(async () => {
        dataCell.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(cellClickCalls.length, 1);

    await act(async () => root.unmount());
    dom.window.close();
});

test('3. CostAppFooter renders without window.app and reactively consumes Zustand lastSyncTime', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: CostAppFooter }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/CostAppFooter.jsx')
    ]);

    const { act } = React;

    act(() => {
        useAppStore.setState({ lastSyncTime: null });
    });

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(CostAppFooter));
    });

    assert.ok(container.textContent.includes('Utolsó mentés: Soha'));

    // Update Zustand lastSyncTime reactively
    const testDate = '2026-09-26T15:30:00.000Z';
    await act(async () => {
        useAppStore.setState({ lastSyncTime: testDate });
    });

    const expectedTimeStr = new Date(testDate).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    assert.ok(container.textContent.includes(expectedTimeStr));

    await act(async () => root.unmount());
    dom.window.close();
});

test('4. CostAppHeader renders without window.app and routes actions through bound appService', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { default: CostAppHeader }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/CostAppHeader.jsx')
    ]);

    const { act } = React;

    let inputModalCalls = [];
    let exportExcelCalls = 0;
    let syncModalCalls = 0;

    const fakeApp = {
        uiController: {
            inputModal: { open: (type) => inputModalCalls.push(type) },
            exportController: { exportExcel: () => { exportExcelCalls++; } },
            openSyncModal: () => { syncModalCalls++; }
        },
        syncService: {
            getQueueStatus: () => ({ total: 0 }),
            onQueueChange: () => () => {}
        }
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(CostAppHeader));
    });

    assert.ok(container.textContent.includes('Költség Nyilvántartó'));

    // Test item modal button
    const btnNewItem = container.querySelector('#btnNewItem');
    assert.ok(btnNewItem);
    await act(async () => {
        btnNewItem.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(inputModalCalls, ['item']);

    // Test month modal button
    const btnNewMonth = container.querySelector('#btnNewMonth');
    assert.ok(btnNewMonth);
    await act(async () => {
        btnNewMonth.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(inputModalCalls, ['item', 'month']);

    // Test export menu and excel export action
    const btnDataControl = container.querySelector('#btnDataControl');
    assert.ok(btnDataControl);
    await act(async () => {
        btnDataControl.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    const btnExportExcel = container.querySelector('#btnExportExcel');
    assert.ok(btnExportExcel);
    await act(async () => {
        btnExportExcel.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(exportExcelCalls, 1);

    await act(async () => root.unmount());
    dom.window.close();
});

test('5. WorkAppHeader renders without window.app and routes actions through bound appService', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { default: WorkAppHeader }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/WorkAppHeader.jsx')
    ]);

    const { act } = React;

    let workModalCalls = 0;

    const fakeApp = {
        workLogRenderer: { openModal: () => { workModalCalls++; } }
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(WorkAppHeader));
    });

    assert.ok(container.textContent.includes('Munka Nyilvántartás'));

    const btnNewWork = container.querySelector('#btnNewWork');
    assert.ok(btnNewWork);
    await act(async () => {
        btnNewWork.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(workModalCalls, 1);

    await act(async () => root.unmount());
    dom.window.close();
});

test('6. LandingApp renders without window.app and routes launch handlers through bound appService', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;
    localStorage.removeItem('hmi_selected_module');

    const [React, { createRoot }, { default: LandingApp }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/LandingApp.jsx')
    ]);

    const { act } = React;

    let renderTableCalls = 0;
    let renderWorkCalls = 0;

    const fakeApp = {
        renderer: { renderTable: () => { renderTableCalls++; } },
        workLogRenderer: { render: () => { renderWorkCalls++; } }
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(LandingApp));
    });

    assert.ok(container.textContent.includes('MULTI-DASHBOARD'));

    const btnCost = container.querySelector('#btnLaunchCostApp');
    assert.ok(btnCost);
    await act(async () => {
        btnCost.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(renderTableCalls, 1);

    await act(async () => root.unmount());

    // Re-mount to test work launch
    localStorage.removeItem('hmi_selected_module');
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const root2 = createRoot(container2);
    await act(async () => {
        root2.render(React.createElement(LandingApp));
    });

    const btnWork = container2.querySelector('#btnLaunchWorkApp');
    assert.ok(btnWork);
    await act(async () => {
        btnWork.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(renderWorkCalls, 1);

    await act(async () => root2.unmount());
    dom.window.close();
});

test('7. StoreSync operates via appService.getInitialSnapshot without direct window.app checks', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: StoreSync }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/StoreSync.jsx')
    ]);

    const { act } = React;

    act(() => {
        useAppStore.setState({ isLoaded: false });
    });

    const fakeApp = {
        isBooted: true,
        getAppSnapshot: () => ({
            items: [{ id: 'boot-item-1', name: 'Boot Test' }],
            months: ['2026-09'],
            entries: [],
            eurRate: 400
        })
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(StoreSync));
    });

    assert.equal(useAppStore.getState().isLoaded, true);
    assert.equal(useAppStore.getState().items.length, 1);
    assert.equal(useAppStore.getState().items[0].name, 'Boot Test');

    await act(async () => root.unmount());
    dom.window.close();
});
