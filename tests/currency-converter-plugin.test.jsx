import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously'
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
globalThis.Node = dom.window.Node;
Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const { validatePluginManifest, KNOWN_PERMISSIONS } = await import('../src/services/plugin/PluginManifestValidator.js');
const { createPluginContext } = await import('../src/services/plugin/PluginCapabilityFactory.js');
const { PluginRegistry } = await import('../src/services/plugin/PluginRegistry.js');
const { PluginUIRegistry } = await import('../src/services/plugin/PluginUIRegistry.js');
const { PluginHost } = await import('../src/components/plugin/PluginHost.jsx');
const {
    CURRENCY_CONVERTER_MANIFEST,
    currencyConverterPluginSetup,
    CurrencyConverterComponent,
    registerCurrencyConverterPlugin
} = await import('../src/plugins/currencyConverterPlugin.jsx');
const { appService } = await import('../src/services/appService.js');
const { registerSamplePlugin } = await import('../src/plugins/samplePlugin.jsx');
const { useAppStore } = await import('../src/store/useAppStore.js');

function getRootElement() {
    let el = document.getElementById('root');
    if (!el) {
        el = document.createElement('div');
        el.id = 'root';
        document.body.appendChild(el);
    }
    el.innerHTML = '';
    return el;
}

// ==========================================
// 1. Permission and Capability Tests
// ==========================================
test('PLG3 PR1 — Permission Contract: "currency:read" is accepted and manifest is valid', () => {
    assert.ok(KNOWN_PERMISSIONS.has('currency:read'));
    assert.equal(validatePluginManifest(CURRENCY_CONVERTER_MANIFEST), true);
});

test('PLG3 PR1 — Capability Factory: Missing "currency:read" permission leaves context.currency null', () => {
    const manifestWithoutCurrency = {
        id: 'no.currency.plugin',
        name: 'No Currency Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    const ctx = createPluginContext(manifestWithoutCurrency, {
        appService: {
            getExchangeRateState: () => ({ rate: 410, status: 'live' }),
            getPrimaryCurrency: () => 'HUF'
        }
    });

    assert.equal(ctx.currency, null);
});

test('PLG3 PR1 — Capability Factory: Granted "currency:read" exposes only read-only, frozen currency API', () => {
    const mockAppService = {
        getExchangeRateState: () => ({ rate: 405.5, status: 'live' }),
        getPrimaryCurrency: () => 'EUR',
        subscribeExchangeRate: () => () => {}
    };

    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    assert.ok(ctx.currency);
    assert.ok(Object.isFrozen(ctx.currency));
    assert.equal(typeof ctx.currency.getRate, 'function');
    assert.equal(typeof ctx.currency.getStatus, 'function');
    assert.equal(typeof ctx.currency.getPrimaryCurrency, 'function');
    assert.equal(typeof ctx.currency.convert, 'function');
    assert.equal(typeof ctx.currency.subscribe, 'function');

    // Values match host service
    assert.equal(ctx.currency.getRate(), 405.5);
    assert.equal(ctx.currency.getStatus(), 'live');
    assert.equal(ctx.currency.getPrimaryCurrency(), 'EUR');

    // No mutation methods or internal leaks
    assert.equal(ctx.currency.setRate, undefined);
    assert.equal(ctx.currency.setUseLiveEur, undefined);
    assert.equal(ctx.currency.setManualFallbackRate, undefined);
    assert.equal(ctx.currency.fetchLiveRate, undefined);
    assert.equal(ctx.currency.app, undefined);
    assert.equal(ctx.currency.db, undefined);
    assert.equal(ctx.currency.syncService, undefined);
    assert.equal(ctx.currency.window, undefined);

    // Attempting to mutate capability properties must fail
    assert.throws(() => {
        ctx.currency.getRate = () => 999;
    }, TypeError);
});

// ==========================================
// 2. Conversion Tests (Math, Precision, Edges)
// ==========================================
test('PLG3 PR1 — Currency Capability: HUF -> EUR and EUR -> HUF conversion precision', () => {
    const mockAppService = {
        getExchangeRateState: () => ({ rate: 400, status: 'live' }),
        getPrimaryCurrency: () => 'HUF'
    };

    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    // HUF -> EUR
    assert.equal(ctx.currency.convert(40000, 'HUF', 'EUR'), 100);
    assert.equal(ctx.currency.convert(1000, 'HUF', 'EUR'), 2.5);

    // EUR -> HUF
    assert.equal(ctx.currency.convert(50, 'EUR', 'HUF'), 20000);
    assert.equal(ctx.currency.convert(1.25, 'EUR', 'HUF'), 500);

    // Same-currency conversion preserves amount exactly
    assert.equal(ctx.currency.convert(1234.56, 'HUF', 'HUF'), 1234.56);
    assert.equal(ctx.currency.convert(99.9, 'EUR', 'EUR'), 99.9);

    // Zero amount
    assert.equal(ctx.currency.convert(0, 'HUF', 'EUR'), 0);
    assert.equal(ctx.currency.convert(0, 'EUR', 'HUF'), 0);

    // Negative amount
    assert.equal(ctx.currency.convert(-400, 'HUF', 'EUR'), -1);

    // Invalid amount returns 0 (per convertAmount specification)
    assert.equal(ctx.currency.convert('invalid-number', 'HUF', 'EUR'), 0);
});

test('PLG3 PR1 — Currency Capability: Invalid or unavailable rate returns null without inventing fallbacks', () => {
    // Missing / invalid rate
    const mockAppServiceZero = {
        getExchangeRateState: () => ({ rate: 0, status: 'error' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctxZero = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppServiceZero });
    assert.equal(ctxZero.currency.getRate(), null);
    assert.equal(ctxZero.currency.convert(1000, 'HUF', 'EUR'), null);

    const mockAppServiceNegative = {
        getExchangeRateState: () => ({ rate: -400, status: 'error' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctxNeg = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppServiceNegative });
    assert.equal(ctxNeg.currency.getRate(), null);
    assert.equal(ctxNeg.currency.convert(1000, 'HUF', 'EUR'), null);

    const mockAppServiceNull = {
        getExchangeRateState: () => ({ rate: null, status: 'error' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctxNull = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppServiceNull });
    assert.equal(ctxNull.currency.getRate(), null);
    assert.equal(ctxNull.currency.convert(1000, 'HUF', 'EUR'), null);
});

// ==========================================
// 3. UI Component Rendering & Exchange Rate State
// ==========================================
test('PLG3 PR1 — CurrencyConverterComponent: Renders live rate, performs conversion, and allows swap', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 400, status: 'live' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    const text = rootEl.textContent;
    assert.ok(text.includes('1 EUR = 400,00 Ft'));
    assert.ok(text.includes('Élő árfolyam'));
    assert.ok(text.includes('Elsődleges: HUF'));

    // Default amount is 1000 HUF -> 2,50 EUR
    assert.ok(text.includes('2,50 EUR'));

    // Trigger swap button
    const swapBtn = rootEl.querySelector('button[aria-label="Irány megfordítása"]');
    assert.ok(swapBtn);

    await act(async () => {
        swapBtn.click();
    });

    // Now converting 1000 EUR -> 400 000 Ft (Hungarian locale non-breaking space)
    assert.ok(/400[\s\u00A0]000 Ft/.test(rootEl.textContent));

    root.unmount();
});

test('PLG3 PR1 — CurrencyConverterComponent: Displays configured manual fallback status', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 395, status: 'manual' }),
        getPrimaryCurrency: () => 'EUR'
    };
    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    const text = rootEl.textContent;
    assert.ok(text.includes('1 EUR = 395,00 Ft'));
    assert.ok(text.includes('Kézi beállítás'));

    root.unmount();
});

test('PLG3 PR1 — CurrencyConverterComponent: Handles stale cached rate status', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 402.5, status: 'stale' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    const text = rootEl.textContent;
    assert.ok(text.includes('Lejárt / Offline cache'));
    assert.ok(text.includes('1 EUR = 402,50 Ft'));

    root.unmount();
});

test('PLG3 PR1 — CurrencyConverterComponent: Disables conversion cleanly when rate is unavailable', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    const mockAppService = {
        getExchangeRateState: () => ({ rate: null, status: 'error' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    const text = rootEl.textContent;
    assert.ok(text.includes('Nem elérhető'));
    assert.ok(text.includes('Az árfolyam nem érhető el vagy érvénytelen. Az átváltás szünetel.'));

    root.unmount();
});

test('PLG3 PR1 — CurrencyConverterComponent: Handles invalid or empty numeric input safely', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 400, status: 'live' }),
        getPrimaryCurrency: () => 'HUF'
    };
    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    const input = rootEl.querySelector('#currencyConverterAmountInput');
    assert.ok(input);

    const inputSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;

    // Invalid numeric input
    await act(async () => {
        inputSetter.call(input, 'abc');
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.ok(rootEl.textContent.includes('Kérjük, érvényes számot adjon meg összegként.'));

    // Empty input
    await act(async () => {
        inputSetter.call(input, '');
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.ok(rootEl.textContent.includes('Adjon meg egy összeget az átváltáshoz.'));

    root.unmount();
});

// ==========================================
// 4. Reactive Subscription & Event Updates Tests
// ==========================================
test('PLG3 PR1 — Reactive Updates: Live rate update changes displayed rate and conversion result immediately', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    let currentRateState = { rate: 400, status: 'live' };
    const subscribers = new Set();

    const mockAppService = {
        getExchangeRateState: () => currentRateState,
        getPrimaryCurrency: () => 'HUF',
        subscribeExchangeRate: (cb) => {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        }
    };

    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    assert.ok(rootEl.textContent.includes('1 EUR = 400,00 Ft'));
    assert.ok(rootEl.textContent.includes('2,50 EUR')); // 1000 HUF / 400 = 2.5 EUR

    // Simulate exchange-rate update event
    currentRateState = { rate: 500, status: 'live' };
    await act(async () => {
        for (const sub of subscribers) sub(currentRateState);
    });

    assert.ok(rootEl.textContent.includes('1 EUR = 500,00 Ft'));
    assert.ok(rootEl.textContent.includes('2,00 EUR')); // 1000 HUF / 500 = 2.0 EUR

    root.unmount();
});

test('PLG3 PR1 — Reactive Updates: Status-only update dynamically updates status badge', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    let currentRateState = { rate: 400, status: 'live' };
    const subscribers = new Set();

    const mockAppService = {
        getExchangeRateState: () => currentRateState,
        getPrimaryCurrency: () => 'HUF',
        subscribeExchangeRate: (cb) => {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        }
    };

    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    assert.ok(rootEl.textContent.includes('Élő árfolyam'));

    // Status change from live to stale
    currentRateState = { rate: 400, status: 'stale' };
    await act(async () => {
        for (const sub of subscribers) sub(currentRateState);
    });

    assert.ok(rootEl.textContent.includes('Lejárt / Offline cache'));

    root.unmount();
});

test('PLG3 PR1 — Reactive Updates: Primary currency change updates UI reactively', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    useAppStore.setState({ primaryCurrency: 'HUF' });

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 400, status: 'live' }),
        getPrimaryCurrency: () => useAppStore.getState().primaryCurrency,
        subscribeExchangeRate: () => () => {}
    };

    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    assert.ok(rootEl.textContent.includes('Elsődleges: HUF'));

    // Update store primaryCurrency
    await act(async () => {
        useAppStore.setState({ primaryCurrency: 'EUR' });
    });

    assert.ok(rootEl.textContent.includes('Elsődleges: EUR'));

    // Restore store state
    useAppStore.setState({ primaryCurrency: 'HUF' });
    root.unmount();
});

test('PLG3 PR1 — Reactive Updates: Unsubscribes on unmount and prevents duplicate subscriptions', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    let subscribeCalls = 0;
    let unsubscribeCalls = 0;

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 400, status: 'live' }),
        getPrimaryCurrency: () => 'HUF',
        subscribeExchangeRate: () => {
            subscribeCalls++;
            return () => {
                unsubscribeCalls++;
            };
        }
    };

    const ctx = createPluginContext(CURRENCY_CONVERTER_MANIFEST, { appService: mockAppService });

    await act(async () => {
        root.render(React.createElement(CurrencyConverterComponent, { context: ctx }));
    });

    assert.equal(subscribeCalls, 1, 'Exactly one subscription should be opened');
    assert.equal(unsubscribeCalls, 0);

    // Unmount
    await act(async () => {
        root.unmount();
    });

    assert.equal(unsubscribeCalls, 1, 'Subscription must be cleaned up on unmount');
});

// ==========================================
// 5. Plugin Lifecycle Integration Tests
// ==========================================
test('PLG3 PR1 — Lifecycle: Registration, initialization, setup validation, activation, deactivation, and disposal', async () => {
    const mockAppService = {
        getExchangeRateState: () => ({ rate: 400, status: 'live' }),
        getPrimaryCurrency: () => 'HUF',
        subscribeExchangeRate: () => () => {}
    };

    const registry = new PluginRegistry(null, mockAppService);
    const uiRegistry = new PluginUIRegistry();

    // 1. Register plugin
    registerCurrencyConverterPlugin(registry, uiRegistry);

    assert.ok(registry.has('firstparty.currency.converter'));
    assert.ok(uiRegistry.hasUI('firstparty.currency.converter'));

    const regRecord = registry.get('firstparty.currency.converter');
    assert.equal(regRecord.state, 'registered');

    // 2. Initialize and activate
    const activeRecord = await registry.initialize('firstparty.currency.converter');
    assert.equal(activeRecord.state, 'active');

    // Context is active and valid
    const ctx = registry.getContext('firstparty.currency.converter');
    assert.ok(ctx);
    assert.ok(ctx.currency);

    // 3. Setup function validation with missing capability
    await assert.rejects(async () => {
        await currencyConverterPluginSetup({});
    }, /Missing currency capability/);

    // 4. Dispose (deactivate)
    assert.equal(registry.dispose('firstparty.currency.converter'), true);
    assert.equal(registry.get('firstparty.currency.converter').state, 'disposed');
    assert.equal(registry.getContext('firstparty.currency.converter'), null);

    // 5. Re-enable (reactivate)
    assert.equal(registry.enable('firstparty.currency.converter'), true);
    assert.equal(registry.get('firstparty.currency.converter').state, 'registered');

    const reactivatedRecord = await registry.initialize('firstparty.currency.converter');
    assert.equal(reactivatedRecord.state, 'active');
});

test('PLG3 PR1 — Host Integration: PluginHost renders CurrencyConverterComponent seamlessly', async () => {
    const rootEl = getRootElement();
    const root = createRoot(rootEl);

    const mockAppService = {
        getExchangeRateState: () => ({ rate: 412.3, status: 'live' }),
        getPrimaryCurrency: () => 'HUF',
        subscribeExchangeRate: () => () => {}
    };

    const registry = new PluginRegistry(null, mockAppService);
    const uiRegistry = new PluginUIRegistry();

    registerCurrencyConverterPlugin(registry, uiRegistry);

    await act(async () => {
        root.render(React.createElement(PluginHost, {
            pluginId: 'firstparty.currency.converter',
            registry,
            uiRegistry
        }));
    });

    assert.ok(rootEl.textContent.includes('Valutaváltó'));
    assert.ok(rootEl.textContent.includes('1 EUR = 412,30 Ft'));

    root.unmount();
});

// ==========================================
// 6. Regression & Application Composition Root Tests
// ==========================================
test('PLG3 PR1 — Application Composition Root: App constructor registers Currency Converter and Sample plugins cleanly', async () => {
    globalThis.window.__DISABLE_AUTO_INIT__ = true;
    const { PwaManager } = await import('../js/pwa-manager.js');
    const { TimeTrackerModule } = await import('../js/modules/time-tracker/time-tracker.js');

    // Isolate only the legacy background polling intervals during App instantiation
    const origAutoUpdate = PwaManager.prototype.setupAutoUpdateCheck;
    PwaManager.prototype.setupAutoUpdateCheck = () => {};

    const origTimeTrackerInit = TimeTrackerModule.prototype.init;
    TimeTrackerModule.prototype.init = () => {};

    let app = null;

    try {
        const { App } = await import('../js/app.js');
        app = new App();

        // Verify App's pluginRegistry contains both first-party plugins
        assert.ok(app.pluginRegistry.has('firstparty.sample.plugin'));
        assert.ok(app.pluginRegistry.has('firstparty.currency.converter'));

        // Verify App's pluginUIRegistry contains both UI entries
        assert.ok(app.pluginUIRegistry.hasUI('firstparty.sample.plugin'));
        assert.ok(app.pluginUIRegistry.hasUI('firstparty.currency.converter'));

        // Verify manifests and permissions
        const converterRecord = app.pluginRegistry.get('firstparty.currency.converter');
        assert.equal(converterRecord.manifest.name, 'Valutaváltó');
        assert.deepEqual(converterRecord.manifest.permissions, ['currency:read']);

        const sampleRecord = app.pluginRegistry.get('firstparty.sample.plugin');
        assert.deepEqual(sampleRecord.manifest.permissions, ['storage:private', 'ui:toast', 'expenses:read']);

        // Verify UI contract title and component
        const uiEntry = app.pluginUIRegistry.getUI('firstparty.currency.converter');
        assert.equal(uiEntry.title, 'Valutaváltó');
        assert.equal(uiEntry.icon, 'fas fa-exchange-alt');
        assert.equal(uiEntry.hasUI, true);
        assert.equal(typeof uiEntry.component, 'function');

        // Verify transaction data and stores remain completely untouched
        assert.equal(app.entries.entries.length, 0);
        assert.equal(app.items.items.length, 0);
        assert.equal(app.months.months.length, 0);
    } finally {
        if (app && typeof app.destroy === 'function') {
            app.destroy();
        }
        PwaManager.prototype.setupAutoUpdateCheck = origAutoUpdate;
        TimeTrackerModule.prototype.init = origTimeTrackerInit;
    }
});
