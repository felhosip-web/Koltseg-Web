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
    globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
    globalThis.Node = dom.window.Node;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Blob = dom.window.Blob;
    globalThis.URL = dom.window.URL;
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
    let updateBgThemeUiCalls = [];
    let showToastCalls = [];
    let logEventCalls = [];
    let exportLogsCalls = 0;
    let showConfirmCalls = [];
    let clearLogsCalls = 0;
    let renderLogsCalls = 0;
    let verifyAndUpgradeCalls = [];
    let lockAppCalls = 0;
    let saveSecuritySettingsCalls = 0;
    let setAiConfigCalls = [];
    let populateSecurityFormCalls = 0;
    let renderModuleSettingsCalls = 0;

    const fakeApp = {
        togglePanel: (p) => togglePanelCalls.push(p),
        _handleGoogleClientSave: () => { googleSaveCalls++; },
        _testSupabaseConnection: () => { testSupabaseCalls++; },
        _handleSettingsSave: () => { saveSettingsCalls++; },
        applyDarkMode: (d) => applyDarkModeCalls.push(d),
        applyBgTheme: (t) => applyBgThemeCalls.push(t),
        updateBgThemeSelectorUI: (t) => updateBgThemeUiCalls.push(t),
        renderLogs: () => { renderLogsCalls++; },
        hmiNotif: {
            openHelp: (topic) => { openHelpCalls++; },
            showToast: (msg, type) => showToastCalls.push({ msg, type }),
            showConfirm: async (opts) => {
                showConfirmCalls.push(opts);
                return true;
            }
        },
        logger: {
            log: (cat, level, msg) => logEventCalls.push({ cat, level, msg }),
            exportToText: () => {
                exportLogsCalls++;
                return '[2026-09-29 LOG] Test log export';
            },
            clear: () => { clearLogsCalls++; }
        },
        securityGuard: {
            _verifyAndUpgradeToOwner: (pass) => verifyAndUpgradeCalls.push(pass),
            lock: () => { lockAppCalls++; },
            saveSettingsFromUI: () => { saveSecuritySettingsCalls++; },
            populateForm: () => { populateSecurityFormCalls++; }
        },
        config: {
            aiConfig: {}
        },
        moduleManager: {
            renderModuleSettingsUI: () => { renderModuleSettingsCalls++; }
        }
    };

    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(SettingsPanel));
    });

    assert.ok(container.textContent.includes('Belépés, Felhő & Beállítások'));

    // 1. Close modal button
    const btnCloseModal = container.querySelector('#btnCloseSettingsModal');
    assert.ok(btnCloseModal);
    await act(async () => {
        btnCloseModal.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(togglePanelCalls, ['settingsPanel']);

    // 2. Google Client save button
    const btnSaveGDrive = container.querySelector('#btnSaveGDriveClientGeneral');
    assert.ok(btnSaveGDrive);
    await act(async () => {
        btnSaveGDrive.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(googleSaveCalls, 1);

    // 3. Test Supabase connection button
    const btnTestSupa = container.querySelector('#btnTestSupabaseConnSettings');
    assert.ok(btnTestSupa);
    await act(async () => {
        btnTestSupa.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(testSupabaseCalls, 1);

    // 4. Help inline button
    const btnHelp = container.querySelector('#btnHelpInline');
    assert.ok(btnHelp);
    await act(async () => {
        btnHelp.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(openHelpCalls, 1);

    // 5. Save settings button
    const btnSaveSettings = container.querySelector('#btnSaveSettings');
    assert.ok(btnSaveSettings);
    await act(async () => {
        btnSaveSettings.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(saveSettingsCalls, 1);

    // 6. Reset appearance button
    const btnResetAppearance = container.querySelector('#btnResetAppearance');
    assert.ok(btnResetAppearance);
    await act(async () => {
        btnResetAppearance.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(applyDarkModeCalls, [false]);
    assert.deepEqual(applyBgThemeCalls, ['white']);
    assert.deepEqual(updateBgThemeUiCalls, ['white']);
    assert.ok(showToastCalls.some(t => t.msg.includes('Megjelenés visszaállítva')));
    assert.ok(logEventCalls.some(l => l.msg.includes('Visszaállítás alapértelmezett')));

    // 7. Save logs button
    const btnSaveLogs = container.querySelector('#btnSaveLogs');
    assert.ok(btnSaveLogs);
    let createObjectURLCalled = false;
    dom.window.URL.createObjectURL = () => { createObjectURLCalled = true; return 'blob:test'; };
    dom.window.URL.revokeObjectURL = () => {};
    await act(async () => {
        btnSaveLogs.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(exportLogsCalls, 1);
    assert.ok(createObjectURLCalled);
    assert.ok(logEventCalls.some(l => l.msg.includes('Eseménynapló exportálva')));

    // 8. Clear logs button
    const btnClearLogs = container.querySelector('#btnClearLogs');
    assert.ok(btnClearLogs);
    await act(async () => {
        btnClearLogs.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 20));
    });
    assert.equal(showConfirmCalls.length, 1);
    assert.equal(clearLogsCalls, 1);
    assert.equal(renderLogsCalls, 1);
    assert.ok(showToastCalls.some(t => t.msg.includes('Eseménynapló sikeresen törölve')));

    // 9. Security Upgrade to Owner button
    const rootInput = container.querySelector('#securityRootPasswordInput');
    assert.ok(rootInput);
    rootInput.value = 'secret123';

    const btnUpgradeOwner = container.querySelector('#btnUpgradeToOwner');
    assert.ok(btnUpgradeOwner);
    await act(async () => {
        btnUpgradeOwner.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(verifyAndUpgradeCalls, ['secret123']);

    // 10. Lock app now button
    const btnLockNow = container.querySelector('#btnLockAppNow');
    assert.ok(btnLockNow);
    await act(async () => {
        btnLockNow.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(lockAppCalls, 1);

    // 11. Save security settings button
    const btnSaveSecurity = container.querySelector('#btnSaveSecuritySettings');
    assert.ok(btnSaveSecurity);
    await act(async () => {
        btnSaveSecurity.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(saveSecuritySettingsCalls, 1);

    // 12. Save AI settings button
    const aiInput = container.querySelector('#aiApiKey');
    assert.ok(aiInput);
    aiInput.value = 'test-key';

    const btnSaveAi = container.querySelector('#btnSaveAiSettings');
    assert.ok(btnSaveAi);
    await act(async () => {
        btnSaveAi.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(fakeApp.config.aiConfig, { apiKey: 'test-key', model: 'gemini-3.5-flash' });
    assert.ok(showToastCalls.some(t => t.msg.includes('AI beállítások mentve')));

    // 13. Tab switching buttons
    const tabButtons = Array.from(container.querySelectorAll('.settings-tab-btn'));
    const logsTabBtn = tabButtons.find(b => b.getAttribute('data-settings-tab') === 'logs');
    const securityTabBtn = tabButtons.find(b => b.getAttribute('data-settings-tab') === 'security');
    const modulesTabBtn = tabButtons.find(b => b.getAttribute('data-settings-tab') === 'modules');

    assert.ok(logsTabBtn && securityTabBtn && modulesTabBtn);

    const prevRenderLogs = renderLogsCalls;
    await act(async () => {
        logsTabBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(renderLogsCalls, prevRenderLogs + 1);

    await act(async () => {
        securityTabBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(populateSecurityFormCalls, 1);

    await act(async () => {
        modulesTabBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(renderModuleSettingsCalls, 1);

    // 14. Theme click button
    const creamThemeBtn = container.querySelector('button[data-bg-theme="cream"]');
    assert.ok(creamThemeBtn);
    await act(async () => {
        creamThemeBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.ok(applyBgThemeCalls.includes('cream'));
    assert.ok(updateBgThemeUiCalls.includes('cream'));
    assert.ok(logEventCalls.some(l => l.msg.includes('cream')));

    // 15. Dark mode toggle
    const darkModeToggle = container.querySelector('#darkModeToggle');
    assert.ok(darkModeToggle);
    await act(async () => {
        darkModeToggle.click();
    });
    assert.ok(applyDarkModeCalls.includes(true));
    assert.ok(logEventCalls.some(l => l.msg.includes('bekapcsolva')));

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

    let getFuelLogModuleCalls = 0;

    const fakeApp = {
        moduleManager: {
            modules: {
                get: (id) => {
                    getFuelLogModuleCalls++;
                    if (id === 'plugin_fuel_log') {
                        return { id: 'plugin_fuel_log', enabled: true };
                    }
                    return null;
                }
            }
        }
    };

    appService.bind(fakeApp);

    act(() => {
        useAppStore.setState({
            isLoaded: true,
            entries: [],
            items: [],
            incomings: [],
            months: ['2026-09'],
            eurRate: 400,
            fuelLogs: [
                { id: 'f1', odo: 100000, liters: 40, price: 600, timestamp: Date.now(), date: '2026-09-01' },
                { id: 'f2', odo: 100500, liters: 35, price: 610, timestamp: Date.now() + 86400000, date: '2026-09-10' }
            ]
        });
    });

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(ChartsTab));
    });

    assert.equal(getFuelLogModuleCalls, 1);
    assert.ok(container.textContent.includes('Kiadások tételenként'));
    assert.ok(container.textContent.includes('Összes hónap'));

    // Test when appService is unbound (returns null for fuel module)
    appService.unbind();
    await act(async () => {
        useAppStore.setState({ isLoaded: true });
    });

    assert.equal(globalThis.window.app, undefined);

    await act(async () => root.unmount());
    dom.window.close();
});
