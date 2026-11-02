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
