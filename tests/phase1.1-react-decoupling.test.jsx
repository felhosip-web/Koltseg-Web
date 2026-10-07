import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { appService } from '../src/services/appService.js';
import { db } from '../js/db.js';

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
    globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
    globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    globalThis.Node = dom.window.Node;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.window.Dexie = Dexie;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ current_weather: { temperature: 20, weathercode: 0 } })
    });

    // Mock db.timeEntries methods cleanly without breaking Dexie
    if (db.timeEntries) {
        db.timeEntries.where = () => ({
            equals: () => ({
                toArray: async () => []
            }),
            between: () => ({
                toArray: async () => []
            })
        });
        db.timeEntries.get = async () => null;
    }

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
    if (db && typeof db.close === 'function') {
        try { db.close(); } catch (_) {}
    }
    if (globalThis.window) {
        if (savedWindowApp !== undefined) {
            globalThis.window.app = savedWindowApp;
        } else {
            delete globalThis.window.app;
        }
    }
});

console.log('[TOP LEVEL] Loaded phase1.1 file');

test('1. appService operates via explicit bind(fakeApp) without global window.app', async () => {
    console.log('[TEST 1] Starting test 1');
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
        handleMonthDeleteSequence: (m) => monthSeqCalls.push(m),
        handleCellClick: (el) => cellClickCalls.push(el)
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
        handleMonthDeleteSequence: (m) => deleteMonthCalls.push(m),
        handleCellClick: (el) => cellClickCalls.push(el)
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
        handleRowDeleteSequence: (id, name) => deleteRowCalls.push(id),
        handleMonthDeleteSequence: (m) => deleteMonthCalls.push(m),
        handleCellClick: (el) => cellClickCalls.push(el)
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

test('10. HmiInputModal, CellEditorModal, WorkEditorModal, and AiEntryModal delegate actions through appService without window.app', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [
        React,
        { createRoot },
        { default: HmiInputModal },
        { default: CellEditorModal },
        { default: WorkEditorModal },
        { default: AiEntryModal }
    ] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/components/HmiInputModal.jsx'),
        import('../src/components/CellEditorModal.jsx'),
        import('../src/components/WorkEditorModal.jsx'),
        import('../src/components/AiEntryModal.jsx')
    ]);

    const { act } = React;

    let inputSaveCalls = [];
    let inputRenameCalls = [];
    let resetCellModalCalls = 0;
    let openModalCalls = [];
    let closeModalCalls = [];
    let closeWorkCalls = 0;
    let deleteWorkCalls = 0;
    let submitWorkCalls = 0;
    let closeAiCalls = 0;
    let analyzeAiCalls = [];
    let confirmAiCalls = [];
    let toastCalls = [];

    const fakeApp = {
        inputModal: {
            performSave: async (type, val, col) => {
                inputSaveCalls.push({ type, val, col });
                return true;
            },
            performRename: async (id, cur, val) => {
                inputRenameCalls.push({ id, cur, val });
                return true;
            }
        },
        cellModal: {
            resetForm: () => { resetCellModalCalls++; },
            refreshList: () => {}
        },
        modalManager: {
            open: (id) => openModalCalls.push(id),
            close: (id) => closeModalCalls.push(id)
        },
        closeWorkModal: () => { closeWorkCalls++; },
        deleteWorkLog: () => { deleteWorkCalls++; },
        submitWorkForm: (e) => { submitWorkCalls++; },
        aiModal: {
            close: () => { closeAiCalls++; },
            analyze: async (text) => {
                analyzeAiCalls.push(text);
                return { amount: 5000, currency: 'HUF', paymentMethod: 'Kártya', category: 'Élelmiszer', month: '2026-09' };
            },
            confirmAndInsert: async (data) => { confirmAiCalls.push(data); }
        },
        hmiNotif: {
            showToast: (msg, type) => toastCalls.push({ msg, type })
        }
    };

    appService.bind(fakeApp);

    // 1. HmiInputModal
    const hmiRoot = document.createElement('div');
    hmiRoot.id = 'costAppHmiInputRoot';
    document.body.appendChild(hmiRoot);
    const root1 = createRoot(hmiRoot);
    await act(async () => { root1.render(React.createElement(HmiInputModal)); });

    await act(async () => {
        document.dispatchEvent(new CustomEvent('hmi-input-open', { detail: { type: 'item' } }));
    });
    const saveBtn = Array.from(hmiRoot.querySelectorAll('button')).find(b => b.textContent.includes('Mentés'));
    assert.ok(saveBtn, 'Save button should exist');

    const hmiInput = hmiRoot.querySelector('input');
    assert.ok(hmiInput, 'Input element should exist');
    await act(async () => {
        delete hmiInput._valueTracker;
        const nativeSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(hmiInput, 'Új kategória');
        hmiInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
        saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    assert.equal(inputSaveCalls.length, 1);
    assert.deepEqual(inputSaveCalls[0], { type: 'item', val: 'Új kategória', col: '#dbeafe' });

    await act(async () => root1.unmount());

    // 2. CellEditorModal
    const cellRoot = document.createElement('div');
    cellRoot.id = 'costAppCellEditorRoot';
    document.body.appendChild(cellRoot);
    const root2 = createRoot(cellRoot);
    await act(async () => { root2.render(React.createElement(CellEditorModal)); });

    await act(async () => {
        cellRoot.dispatchEvent(new CustomEvent('cell-editor-open', { bubbles: true }));
    });
    assert.equal(resetCellModalCalls, 1);
    assert.deepEqual(openModalCalls, ['cellEditorModal']);

    await act(async () => root2.unmount());

    // 3. WorkEditorModal
    const workRoot = document.createElement('div');
    workRoot.id = 'workAppEditorRoot';
    document.body.appendChild(workRoot);
    const root3 = createRoot(workRoot);
    await act(async () => { root3.render(React.createElement(WorkEditorModal)); });

    await act(async () => {
        workRoot.dispatchEvent(new CustomEvent('work-editor-open'));
    });
    assert.ok(openModalCalls.includes('workEditorModal'));

    const btnCancelWork = workRoot.querySelector('#btnCancelWorkModal');
    assert.ok(btnCancelWork);
    await act(async () => {
        btnCancelWork.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(closeWorkCalls, 1);

    await act(async () => root3.unmount());

    // 4. AiEntryModal
    const aiRoot = document.createElement('div');
    aiRoot.id = 'costAppAiModalRoot';
    document.body.appendChild(aiRoot);
    const root4 = createRoot(aiRoot);
    await act(async () => { root4.render(React.createElement(AiEntryModal)); });

    await act(async () => {
        aiRoot.dispatchEvent(new CustomEvent('ai-modal-open'));
    });

    const aiTextarea = aiRoot.querySelector('textarea');
    assert.ok(aiTextarea);
    await act(async () => {
        delete aiTextarea._valueTracker;
        const nativeAreaSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
        nativeAreaSetter.call(aiTextarea, '5000 Ft ebédre');
        aiTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        aiTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const btnAnalyze = Array.from(aiRoot.querySelectorAll('button')).find(b => b.textContent.includes('Költség Elemzése'));
    assert.ok(btnAnalyze);
    await act(async () => {
        btnAnalyze.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    assert.deepEqual(analyzeAiCalls, ['5000 Ft ebédre']);

    const btnConfirm = Array.from(aiRoot.querySelectorAll('button')).find(b => b.textContent.includes('Jóváhagyás & Mentés'));
    assert.ok(btnConfirm, 'btnConfirm should exist after analyze');
    await act(async () => {
        btnConfirm.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    assert.equal(confirmAiCalls.length, 1);
    assert.deepEqual(confirmAiCalls[0], { amount: 5000, currency: 'HUF', paymentMethod: 'Kártya', category: 'Élelmiszer', month: '2026-09' });

    await act(async () => root4.unmount());

    assert.equal(globalThis.window.app, undefined);
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
        inputModal: { open: (type) => inputModalCalls.push(type) },
        exportController: { exportExcel: () => { exportExcelCalls++; } },
        openSyncModal: () => { syncModalCalls++; },
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
        openWorkModal: () => { workModalCalls++; }
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

    let costLaunched = false;
    let workLaunched = false;

    const fakeApp = {
        isBooted: true
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
    assert.equal(localStorage.getItem('hmi_selected_module'), 'cost');

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
    assert.equal(localStorage.getItem('hmi_selected_module'), 'work');

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

test('9. DashboardTab executes navigation, weather, and quick actions through bound appService without window.app', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: DashboardTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/dashboard/DashboardTab.jsx')
    ]);

    const { act } = React;

    let switchTabCalls = [];
    let launchModuleCalls = [];
    let showViewCalls = [];
    let openInputModalCalls = [];

    const fakeApp = {
        config: { weatherCity: 'Budapest' },
        weatherCache: null,
        switchTab: (tab) => switchTabCalls.push(tab),
        showView: (v) => showViewCalls.push(v),
        moduleManager: {
            launchModule: (modId) => launchModuleCalls.push(modId)
        },
        inputModal: {
            open: (type) => openInputModalCalls.push(type)
        }
    };

    appService.bind(fakeApp);

    act(() => {
        useAppStore.setState({
            isLoaded: true,
            entries: [],
            items: [],
            months: [],
            incomings: [],
            reminders: [],
            eurRate: 400
        });
    });

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(DashboardTab));
    });

    assert.ok(container.textContent.includes('Aktuális Havi Egyenleg'));

    // Test quick action: new_cost triggers inputModal open
    const quickCostBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Kiadás'));
    assert.ok(quickCostBtn);
    await act(async () => {
        quickCostBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(openInputModalCalls, ['item']);

    // Test Időmérő card click triggers showView('time')
    const timeCard = container.querySelector('.bg-rose-50')?.closest('div.bg-white');
    assert.ok(timeCard);
    await act(async () => {
        timeCard.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(showViewCalls, ['time']);

    // Confirm window.app remains completely undefined
    assert.equal(globalThis.window.app, undefined);

    await act(async () => root.unmount());
    dom.window.close();
});
