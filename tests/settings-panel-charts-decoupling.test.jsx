import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { appService } from '../src/services/appService.js';

function setupEnvironment() {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
        { url: 'http://localhost/' }
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Node = dom.window.Node;
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

test('SettingsPanel renders and routes all user actions through appService when window.app is undefined', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { default: SettingsPanel }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/components/SettingsPanel.jsx')
    ]);

    const { act } = React;

    let togglePanelCalls = [];
    let googleSaveCalls = 0;
    let testSupabaseCalls = 0;
    let openHelpCalls = 0;
    let saveSettingsCalls = 0;
    let applyDarkModeCalls = [];
    let applyBgThemeCalls = [];
    let exportLogsCalls = 0;
    let clearLogsCalls = 0;
    let verifyUpgradeCalls = [];
    let lockAppCalls = 0;

    const fakeApp = {
        togglePanel: (id) => togglePanelCalls.push(id),
        handleGoogleClientSave: () => { googleSaveCalls++; },
        testSupabaseConnection: () => { testSupabaseCalls++; },
        handleSettingsSave: () => { saveSettingsCalls++; },
        applyDarkMode: (isDark) => applyDarkModeCalls.push(isDark),
        applyBgTheme: (theme) => applyBgThemeCalls.push(theme),
        updateBgThemeSelectorUI: () => {},
        hmiNotif: {
            openHelp: (topic) => openHelpCalls++
        },
        logger: {
            exportToText: () => { exportLogsCalls++; return 'Log text'; },
            clear: () => { clearLogsCalls++; }
        },
        securityGuard: {
            _verifyAndUpgradeToOwner: (pass) => verifyUpgradeCalls.push(pass),
            lock: () => { lockAppCalls++; },
            saveSettingsFromUI: () => {},
            populateForm: () => {}
        },
        moduleManager: {
            renderModuleSettingsUI: () => {}
        }
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(SettingsPanel));
    });

    assert.ok(container.textContent.includes('Belépés, Felhő & Beállítások'));

    const clickEvent = (el) => {
        el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    // 1. Close modal button
    const btnCloseModal = container.querySelector('#btnCloseSettingsModal');
    assert.ok(btnCloseModal);
    await act(async () => {
        clickEvent(btnCloseModal);
    });
    assert.deepEqual(togglePanelCalls, ['settingsPanel']);

    // 2. Google Client save button
    const btnSaveGDrive = container.querySelector('#btnSaveGDriveClientGeneral');
    assert.ok(btnSaveGDrive);
    await act(async () => {
        clickEvent(btnSaveGDrive);
    });
    assert.equal(googleSaveCalls, 1);

    // 3. Test Supabase connection button
    const btnTestSupa = container.querySelector('#btnTestSupabaseConnSettings');
    assert.ok(btnTestSupa);
    await act(async () => {
        clickEvent(btnTestSupa);
    });
    assert.equal(testSupabaseCalls, 1);

    // 4. Help inline button
    const btnHelp = container.querySelector('#btnHelpInline');
    assert.ok(btnHelp);
    await act(async () => {
        clickEvent(btnHelp);
    });
    assert.equal(openHelpCalls, 1);

    // 5. Save settings button
    const btnSaveSettings = container.querySelector('#btnSaveSettings');
    assert.ok(btnSaveSettings);
    await act(async () => {
        clickEvent(btnSaveSettings);
    });
    assert.equal(saveSettingsCalls, 1);

    // 6. Reset appearance button
    const btnResetAppearance = container.querySelector('#btnResetAppearance');
    assert.ok(btnResetAppearance);
    await act(async () => {
        clickEvent(btnResetAppearance);
    });
    assert.deepEqual(applyDarkModeCalls, [false]);
    assert.deepEqual(applyBgThemeCalls, ['white']);

    // Confirm window.app is completely undefined
    assert.equal(globalThis.window.app, undefined);

    await act(async () => root.unmount());
    dom.window.close();
});

test('ChartsTab queries fuel log plugin through appService.getFuelLogModule and renders without window.app', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: ChartsTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/charts/ChartsTab.jsx')
    ]);

    const { act } = React;

    let getModuleCalls = 0;
    const fakeFuelModule = {
        getFuelEntries: () => [{ date: '2026-09-01', liters: 40, priceHuf: 24000 }]
    };

    const fakeApp = {
        moduleManager: {
            modules: {
                get: (id) => {
                    getModuleCalls++;
                    return fakeFuelModule;
                }
            }
        }
    };

    appService.bind(fakeApp);

    act(() => {
        useAppStore.setState({
            isLoaded: true,
            entries: [{ id: 'e1', itemId: 'item1', month: '2026-09', amount: 5000, currency: 'HUF' }],
            items: [{ id: 'item1', name: 'Kávé' }],
            months: ['2026-09'],
            incomings: [],
            eurRate: 400
        });
    });

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(ChartsTab));
    });

    assert.ok(container.textContent.includes('Kiadások tételenként'));

    // Confirm appService query was invoked
    assert.ok(getModuleCalls > 0);

    // Confirm window.app is completely undefined
    assert.equal(globalThis.window.app, undefined);

    await act(async () => root.unmount());
    dom.window.close();
});
