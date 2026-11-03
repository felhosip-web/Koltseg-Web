import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resolveDefaultCurrency, isValidCurrency } from '../src/utils/currency-utils.js';
import { CellModalController } from '../js/cell-modal-controller.js';
import { IncomingManager } from '../js/oop-core.js';
import { appService } from '../src/services/appService.js';
import { fuelLogModuleScript } from '../js/modules/fuel-log.js';

test('P1-1: resolveDefaultCurrency resolves correctly across all permutations', () => {
    // 1. Explicit currency overrides defaults
    assert.equal(resolveDefaultCurrency('HUF', 'EUR'), 'HUF');
    assert.equal(resolveDefaultCurrency('EUR', 'HUF'), 'EUR');
    assert.equal(resolveDefaultCurrency('eur', 'HUF'), 'EUR');
    assert.equal(resolveDefaultCurrency('huf', 'EUR'), 'HUF');

    // 2. Primary fallback
    assert.equal(resolveDefaultCurrency(null, 'EUR'), 'EUR');
    assert.equal(resolveDefaultCurrency(null, 'HUF'), 'HUF');

    // 3. Fallback to localStorage
    const originalLocalStorage = globalThis.localStorage;
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => store.get(k) || null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };

    localStorage.setItem('app_primary_currency', 'EUR');
    assert.equal(resolveDefaultCurrency(null, null), 'EUR');

    localStorage.setItem('app_primary_currency', 'HUF');
    assert.equal(resolveDefaultCurrency(null, null), 'HUF');

    // 4. Missing or invalid primary currency falls back to HUF
    localStorage.removeItem('app_primary_currency');
    assert.equal(resolveDefaultCurrency(null, null), 'HUF');
    assert.equal(resolveDefaultCurrency(null, 'INVALID'), 'HUF');

    if (originalLocalStorage) {
        globalThis.localStorage = originalLocalStorage;
    } else {
        delete globalThis.localStorage;
    }
});

test('P1-2: Manual expense entry: resetForm defaults to primaryCurrency, explicit selection overrides, and editing preserves original currency', async () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
            <body>
                <input id="cellAmountInput" />
                <input id="cellNoteInput" />
                <select id="cellMethodInput">
                    <option value="Kártya">Kártya</option>
                    <option value="Készpénz">Készpénz</option>
                </select>
                <select id="cellCurrencyInput">
                    <option value="HUF">HUF</option>
                    <option value="EUR">EUR</option>
                </select>
                <input type="checkbox" id="cellIsStorno" />
                <button id="btnSaveCellModal"></button>
                <div id="subEntriesContainer"></div>
                <div id="costAppCellEditorRoot"></div>
            </body>
        </html>
    `);

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;

    let savedEntries = [];
    const fakeApp = {
        config: { primaryCurrency: 'EUR' },
        entries: {
            entries: [],
            saveEntry: async (e) => { savedEntries.push(e); },
            load: async () => {},
            getByCellKey: async () => []
        },
        hmiNotif: {
            showToast: () => {},
            showConfirm: async () => true
        },
        updateReactStore: () => {},
        setSystemStatus: () => {}
    };

    const controller = new CellModalController(fakeApp);

    // 1. New entry with EUR primary defaults to EUR
    controller.resetForm();
    assert.equal(document.getElementById('cellCurrencyInput').value, 'EUR');

    // 2. Explicit selection of HUF overrides primary default
    document.getElementById('cellAmountInput').value = '15000';
    document.getElementById('cellCurrencyInput').value = 'HUF';
    controller.currentExplicitItemId = 'item-1';
    controller.currentExplicitMonth = '2026-07';
    controller.currentCellBaseKey = 'item-1_2026-07';

    await controller.save();
    assert.equal(savedEntries.length, 1);
    assert.equal(savedEntries[0].amount, 15000);
    assert.equal(savedEntries[0].currency, 'HUF');

    // 3. Editing an existing EUR transaction preserves EUR even when primary is HUF
    fakeApp.config.primaryCurrency = 'HUF';
    fakeApp.entries.entries = [
        { id: 'entry-eur', itemId: 'item-1', month: '2026-07', amount: 50, currency: 'EUR', paymentMethod: 'Kártya' }
    ];

    controller.editEntry('entry-eur');
    assert.equal(document.getElementById('cellCurrencyInput').value, 'EUR');
    assert.equal(document.getElementById('cellAmountInput').value, '50');

    // 4. Legacy transaction without currency field is preserved / interpreted as HUF
    fakeApp.entries.entries = [
        { id: 'entry-legacy', itemId: 'item-1', month: '2026-07', amount: 3000, paymentMethod: 'Kártya' } // missing currency
    ];
    controller.editEntry('entry-legacy');
    assert.equal(document.getElementById('cellCurrencyInput').value, 'HUF');

    dom.window.close();
});

test('P1-3: IncomingManager and appService: creation, editing, and currency preservation', async () => {
    const mockStore = [];
    const mockDb = {
        getAll: async (store) => {
            if (store === 'incomings') return [...mockStore];
            return [];
        },
        save: async (store, record) => {
            if (store === 'incomings') {
                const idx = mockStore.findIndex(r => r.id === record.id);
                if (idx >= 0) mockStore[idx] = record;
                else mockStore.push(record);
            }
            return record.id;
        },
        delete: async (store, id) => {
            const idx = mockStore.findIndex(r => r.id === id);
            if (idx >= 0) mockStore.splice(idx, 1);
        }
    };
    const mockSync = { push: async () => {} };

    const incomingManager = new IncomingManager(mockDb, mockSync);
    await incomingManager.load();

    const fakeApp = {
        incomingManager,
        updateReactStore: () => {}
    };
    appService.bind(fakeApp);

    // 1. Add incoming without explicit currency under EUR primary
    globalThis.localStorage = {
        getItem: (k) => k === 'app_primary_currency' ? 'EUR' : null,
        setItem: () => {},
        removeItem: () => {}
    };

    const inc1 = await incomingManager.add('Client A', '2026-07-01', 500);
    assert.equal(inc1.currency, 'EUR');
    assert.equal(inc1.amount, 500);

    // 2. Add incoming with explicit HUF under EUR primary
    const inc2 = await incomingManager.add('Client B', '2026-07-02', 20000, 'HUF');
    assert.equal(inc2.currency, 'HUF');

    // 3. Edit incoming preserves currency if not changed, or updates when explicitly changed
    const updatedInc1 = await incomingManager.update(inc1.id, { amount: 600 });
    assert.equal(updatedInc1.currency, 'EUR');
    assert.equal(updatedInc1.amount, 600);

    const updatedInc1Curr = await incomingManager.update(inc1.id, { currency: 'HUF' });
    assert.equal(updatedInc1Curr.currency, 'HUF');

    // 4. Save and delete via appService bridge
    await appService.saveIncomingEntry({
        id: null,
        sender: 'Client C',
        date: '2026-07-03',
        amount: 80,
        currency: 'EUR'
    });
    assert.equal(incomingManager.incomings.length, 3);
    const clientCEntry = incomingManager.incomings.find(i => i.sender === 'Client C');
    assert.ok(clientCEntry);
    assert.equal(clientCEntry.currency, 'EUR');

    await appService.deleteIncomingEntry(clientCEntry.id);
    assert.equal(incomingManager.incomings.length, 2);

    appService.unbind();
    delete globalThis.localStorage;
});

test('P1-4: Fuel-log generated expense entries are invariant and strictly recorded in HUF', () => {
    // Invariant: Fuel calculations (Ft/liter) must always produce HUF currency entries, never EUR
    assert.ok(fuelLogModuleScript.includes("currency: 'HUF'"));
    assert.ok(!fuelLogModuleScript.includes("currency: primaryCurrency"));
});

test('P1-5: Reminders to expense conversion preserves reminder original currency', async () => {
    let savedEntry = null;
    const fakeApp = {
        reminderManager: {
            reminders: [
                {
                    id: 'rem-eur',
                    title: 'Cloud Server hosting',
                    amount: 45,
                    currency: 'EUR',
                    due_date: '2026-07-15',
                    completed: false
                }
            ],
            markAsCompleted: async (id) => {
                fakeApp.reminderManager.reminders[0].completed = true;
            }
        },
        items: {
            items: [{ id: 'cat-hosting', name: 'Hosting' }]
        },
        entries: {
            saveEntry: async (e) => { savedEntry = e; },
            load: async () => {}
        },
        hmiNotif: {
            showConfirm: async () => true, // User approves expense conversion
            showSelectModal: async () => 'Hosting',
            showToast: () => {}
        },
        updateReactStore: () => {}
    };

    appService.bind(fakeApp);
    await appService.completeReminder('rem-eur');

    assert.ok(savedEntry, 'Expense entry should be generated');
    assert.equal(savedEntry.amount, 45);
    assert.equal(savedEntry.currency, 'EUR');
    assert.equal(savedEntry.itemId, 'cat-hosting');

    appService.unbind();
});

test('P1-6: AI currency precedence: explicit HUF/EUR overrides primary, missing resolves to primary, invalid falls back safely', async () => {
    const { AiModalController } = await import('../js/ai-modal-controller.js');
    let savedEntry = null;
    const fakeApp = {
        config: { primaryCurrency: 'EUR' },
        items: {
            items: [{ id: 'item-1', name: 'Élelmiszer' }],
            add: async (name) => ({ id: `cat-${name}`, name }),
            load: async () => {}
        },
        months: {
            months: ['2026-07'],
            add: async (m) => {},
            load: async () => {}
        },
        entries: {
            saveEntry: async (e) => { savedEntry = e; },
            load: async () => {}
        },
        hmiNotif: { showToast: () => {} },
        updateReactStore: () => {}
    };

    const aiController = new AiModalController(fakeApp);

    // 1. Explicit EUR in AI item persists as EUR
    await aiController.confirmAndInsert({
        category: 'Élelmiszer',
        amount: 45,
        currency: 'EUR',
        month: '2026-07',
        paymentMethod: 'Kártya'
    });
    assert.equal(savedEntry.currency, 'EUR');

    // 2. Explicit HUF in AI item persists as HUF even when primary is EUR
    await aiController.confirmAndInsert({
        category: 'Élelmiszer',
        amount: 15000,
        currency: 'HUF',
        month: '2026-07',
        paymentMethod: 'Készpénz'
    });
    assert.equal(savedEntry.currency, 'HUF');

    // 3. Missing currency in AI item defaults to primaryCurrency EUR
    await aiController.confirmAndInsert({
        category: 'Élelmiszer',
        amount: 30,
        month: '2026-07',
        paymentMethod: 'Kártya'
    });
    assert.equal(savedEntry.currency, 'EUR');

    // 4. Invalid currency in AI item falls back to primaryCurrency EUR, or HUF if primary invalid
    await aiController.confirmAndInsert({
        category: 'Élelmiszer',
        amount: 30,
        currency: 'BTC',
        month: '2026-07',
        paymentMethod: 'Kártya'
    });
    assert.equal(savedEntry.currency, 'EUR');

    fakeApp.config.primaryCurrency = 'HUF';
    await aiController.confirmAndInsert({
        category: 'Élelmiszer',
        amount: 1200,
        month: '2026-07',
        paymentMethod: 'Kártya'
    });
    assert.equal(savedEntry.currency, 'HUF');

    delete globalThis.localStorage;
});

test('P1-7: Template currency defaulting and immutability', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const originalLocalStorage = globalThis.localStorage;
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => store.get(k) || null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };

    localStorage.setItem('app_primary_currency', 'EUR');

    const [React, { createRoot }, { default: SettingsPanel }, { TemplateManager }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/components/SettingsPanel.jsx'),
        import('../js/oop-core.js')
    ]);

    // Mount SettingsPanel under primaryCurrency: 'EUR'
    const container = document.getElementById('root');
    const root = createRoot(container);

    await React.act(async () => {
        root.render(React.createElement(SettingsPanel));
    });

    const tplCurrencySelect = container.querySelector('#tplCurrencySelect');
    assert.ok(tplCurrencySelect, '#tplCurrencySelect must exist in SettingsPanel');
    assert.equal(tplCurrencySelect.value, 'EUR', 'SettingsPanel template currency select must default to primaryCurrency EUR');

    // Persistence with TemplateManager:
    const persistedTemplates = [];
    const mockDb = {
        getAll: async () => [...persistedTemplates],
        save: async (storeName, rec) => {
            const idx = persistedTemplates.findIndex(t => t.id === rec.id);
            if (idx >= 0) persistedTemplates[idx] = rec;
            else persistedTemplates.push(rec);
            return rec.id;
        },
        delete: async (storeName, id) => {
            const idx = persistedTemplates.findIndex(t => t.id === id);
            if (idx >= 0) persistedTemplates.splice(idx, 1);
        }
    };
    const mockSync = { push: async () => {} };
    const templateManager = new TemplateManager(mockDb, mockSync);
    await templateManager.load();

    // 1. Newly created template without explicit currency change uses the SettingsPanel default (EUR)
    const tpl1 = await templateManager.add({
        name: 'Havi bérlet',
        amount: 30,
        currency: resolveDefaultCurrency(tplCurrencySelect.value),
        paymentMethod: 'Bankkártya'
    });
    assert.equal(tpl1.currency, 'EUR');
    assert.equal(persistedTemplates[0].currency, 'EUR');

    // 2. User explicitly selects HUF in SettingsPanel and creates a template
    tplCurrencySelect.value = 'HUF';
    tplCurrencySelect.dispatchEvent(new Event('change', { bubbles: true }));
    const tpl2 = await templateManager.add({
        name: 'Lakásbiztosítás',
        amount: 18000,
        currency: resolveDefaultCurrency(tplCurrencySelect.value),
        paymentMethod: 'Utalás'
    });
    assert.equal(tpl2.currency, 'HUF');
    assert.equal(persistedTemplates[1].currency, 'HUF');

    // 3. Changing primaryCurrency in SettingsPanel/localStorage later does NOT mutate previously saved templates
    localStorage.setItem('app_primary_currency', 'HUF');
    await templateManager.load();
    assert.equal(templateManager.templates[0].currency, 'EUR', 'Previously saved EUR template remains EUR');
    assert.equal(templateManager.templates[1].currency, 'HUF', 'Previously saved HUF template remains HUF');

    if (originalLocalStorage) {
        globalThis.localStorage = originalLocalStorage;
    } else {
        delete globalThis.localStorage;
    }
    dom.window.close();
});

test('P1-8: IncomingTab React integration: create first sender, create with existing, edit, preserve and change currency', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: IncomingTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/incoming/IncomingTab.jsx')
    ]);

    // Setup initial state: 0 senders, 0 incomings, primaryCurrency EUR
    let localIncomings = [];
    const initialSenders = [];

    await React.act(async () => {
        useAppStore.setState({
            incomings: localIncomings,
            incomingSenders: initialSenders,
            primaryCurrency: 'EUR'
        });
    });

    const fakeIncomingManager = {
        incomings: localIncomings,
        load: async () => {
            useAppStore.setState({ incomings: [...localIncomings] });
        },
        add: async (sender, date, amount, currency) => {
            const entry = {
                id: `inc-${Date.now()}-${Math.random()}`,
                sender,
                date,
                amount,
                currency: currency || 'EUR'
            };
            localIncomings.push(entry);
            return entry;
        },
        update: async (id, data) => {
            const idx = localIncomings.findIndex(i => String(i.id) === String(id));
            if (idx >= 0) {
                localIncomings[idx] = { ...localIncomings[idx], ...data };
                return localIncomings[idx];
            }
            return null;
        },
        delete: async (id) => {
            localIncomings = localIncomings.filter(i => String(i.id) !== String(id));
            fakeIncomingManager.incomings = localIncomings;
        }
    };

    const fakeApp = {
        incomingManager: fakeIncomingManager,
        updateReactStore: () => {
            useAppStore.setState({ incomings: [...localIncomings] });
        },
        hmiNotif: {
            showToast: () => {},
            showConfirm: async () => true
        }
    };
    appService.bind(fakeApp);

    const container = document.getElementById('root');
    const root = createRoot(container);

    await React.act(async () => {
        root.render(React.createElement(IncomingTab));
    });

    // 1. Verify initially empty state
    assert.ok(container.textContent.includes('Még nincs rögzített bejövő utalás'));

    // 2. Open create modal when 0 senders exist and create very first partner
    const addBtn = container.querySelector('#btnAddIncoming');
    assert.ok(addBtn);

    await React.act(async () => {
        addBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    // Modal is open, verify inputs exist
    const modalInputs = container.querySelectorAll('.fixed input');
    const partnerInput = Array.from(modalInputs).find(input => input.placeholder && input.placeholder.includes('partner'));
    assert.ok(partnerInput, 'New partner input must be rendered when senders is empty');

    const amountInput = Array.from(modalInputs).find(input => input.type === 'number');
    assert.ok(amountInput);

    const dateInput = Array.from(modalInputs).find(input => input.type === 'date');
    assert.ok(dateInput);

    const currencySelect = container.querySelector('.fixed select:not([class*="mb-2"])');
    assert.ok(currencySelect);
    assert.equal(currencySelect.value, 'EUR', 'Should default to primaryCurrency EUR');

    const triggerValueChange = (element, val) => {
        const reactPropsKey = Object.keys(element).find(k => k.startsWith('__reactProps'));
        if (reactPropsKey && typeof element[reactPropsKey]?.onChange === 'function') {
            element[reactPropsKey].onChange({ target: { value: val } });
        } else {
            const proto = element instanceof globalThis.window.HTMLSelectElement
                ? globalThis.window.HTMLSelectElement.prototype
                : globalThis.window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(element, val);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    // Enter first partner details without touching the select
    await React.act(async () => {
        triggerValueChange(partnerInput, 'Első Partner Kft');
        triggerValueChange(amountInput, '500');
        triggerValueChange(dateInput, '2026-07-01');
    });

    const saveBtn = Array.from(container.querySelectorAll('.fixed button')).find(b => b.textContent.trim() === 'Mentés');
    assert.ok(saveBtn);

    await React.act(async () => {
        saveBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    // Wait for async save operation
    await new Promise(r => setTimeout(r, 50));

    // Verify first entry was created and store updated
    assert.equal(localIncomings.length, 1);
    assert.equal(localIncomings[0].sender, 'Első Partner Kft');
    assert.equal(localIncomings[0].amount, 500);
    assert.equal(localIncomings[0].currency, 'EUR');

    // 3. Create another incoming entry using an existing sender, explicitly selecting HUF
    await React.act(async () => {
        addBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    const modalInputs2 = container.querySelectorAll('.fixed input');
    const amountInput2 = Array.from(modalInputs2).find(input => input.type === 'number');
    const dateInput2 = Array.from(modalInputs2).find(input => input.type === 'date');
    const currencySelect2 = Array.from(container.querySelectorAll('.fixed select')).find(s => Array.from(s.options).some(o => o.value === 'HUF'));

    await React.act(async () => {
        triggerValueChange(amountInput2, '30000');
        triggerValueChange(dateInput2, '2026-07-05');
        triggerValueChange(currencySelect2, 'HUF');
    });

    const saveBtn2 = Array.from(container.querySelectorAll('.fixed button')).find(b => b.textContent.trim() === 'Mentés');
    await React.act(async () => {
        saveBtn2.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    await new Promise(r => setTimeout(r, 50));

    assert.equal(localIncomings.length, 2);
    const secondEntry = localIncomings.find(i => i.amount === 30000);
    assert.ok(secondEntry);
    assert.equal(secondEntry.sender, 'Első Partner Kft');
    assert.equal(secondEntry.currency, 'HUF');

    // 4. Open the first entry (EUR) for editing from the table cell
    const cellEl = container.querySelector('.incoming-cell');
    assert.ok(cellEl);

    await React.act(async () => {
        cellEl.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    // In edit modal, verify stored currency EUR is preserved
    const editCurrencySelect = Array.from(container.querySelectorAll('.fixed select')).find(s => Array.from(s.options).some(o => o.value === 'HUF'));
    assert.equal(editCurrencySelect.value, 'EUR');

    // 5. Explicitly change its currency to HUF and save
    await React.act(async () => {
        triggerValueChange(editCurrencySelect, 'HUF');
    });

    const editSaveBtn = Array.from(container.querySelectorAll('.fixed button')).find(b => b.textContent.trim() === 'Mentés');
    await React.act(async () => {
        editSaveBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    await new Promise(r => setTimeout(r, 50));

    // Verify first entry currency is now updated to HUF
    const updatedFirst = localIncomings.find(i => i.id === localIncomings[0].id);
    assert.equal(updatedFirst.currency, 'HUF');

    appService.unbind();
    dom.window.close();
});
