import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';

import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { CellModalController } from '../js/cell-modal-controller.js';

function setupEnvironment() {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
            <div id="costAppCellEditorRoot"></div>
            <div id="subEntriesContainer"></div>
            <input id="cellAmountInput" value="" />
            <select id="cellCurrencyInput"><option value="HUF" selected>HUF</option></select>
            <select id="cellMethodInput"><option value="Kártya" selected>Kártya</option></select>
            <input id="cellNoteInput" value="" />
            <input type="checkbox" id="cellIsStorno" />
            <button id="btnSaveCellModal">Tétel Hozzáadása</button>
            <div id="root"></div>
        </body>
        </html>
    `, { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;
    return dom;
}

test('A. Underscore-containing item ID — saving sub-entry preserves exact itemId and month', async () => {
    const dom = setupEnvironment();
    const db = new Database();
    db._enableMockDb();

    const mockSync = { push: async () => {} };
    const entries = new EntryManager(db, mockSync);
    const items = new ItemManager(db, mockSync);
    const months = new MonthManager(db, mockSync);

    const app = {
        db,
        entries,
        items,
        months,
        hmiNotif: { showToast: () => {}, showConfirm: async () => true },
        updateReactStore: () => {},
        setSystemStatus: () => {}
    };

    // Pre-seed an existing entry in the same cell
    await entries.saveEntry({
        itemId: 'cat_food',
        month: '2026-08',
        cellKey: 'cat_food_2026-08_100',
        amount: 8000,
        currency: 'HUF'
    });
    const preExistingId = entries.entries[0].id;

    const controller = new CellModalController(app);
    controller.currentCellBaseKey = 'cat_food_2026-08';

    // Simulate user input in modal form
    document.getElementById('cellAmountInput').value = '4500';
    document.getElementById('cellNoteInput').value = 'Konzerv és táp';
    document.getElementById('cellCurrencyInput').value = 'HUF';
    document.getElementById('cellMethodInput').value = 'Kártya';

    await controller.save();

    assert.equal(entries.entries.length, 2, 'Cell now contains 2 entries');

    const newEntry = entries.entries.find(e => e.id !== preExistingId);
    assert.ok(newEntry, 'New entry created');
    assert.equal(newEntry.itemId, 'cat_food', 'Stored itemId is exactly "cat_food" despite underscores');
    assert.equal(newEntry.month, '2026-08', 'Stored month is exactly "2026-08"');
    assert.equal(newEntry.amount, 4500);
    assert.equal(newEntry.note, 'Konzerv és táp');

    const oldEntry = entries.entries.find(e => e.id === preExistingId);
    assert.equal(oldEntry.itemId, 'cat_food');
    assert.equal(oldEntry.amount, 8000, 'Pre-existing sibling entry remains unchanged');

    dom.window.close();
});

test('F. Real IndexedDB — Database.prototype.getByCellKey exercises non-mock store.getAll coordinate filtering', async () => {
    const dom = setupEnvironment();
    const dbName = 'RealIndexedDB_MultiItem_' + Date.now();
    const db = new Database(dbName, 12);
    await db.connect();

    // Verify this is a real IndexedDB instance, NOT running in mock mode
    assert.equal(db.isMock, undefined, 'Database MUST NOT be in mock mode');
    assert.ok(db.db && typeof db.db.transaction === 'function', 'Real IDBDatabase connection must be established');

    // 1. Standard key: itemId_month
    const stdEntry = {
        id: 'real-std-1',
        itemId: 'cat_real',
        month: '2026-08',
        cellKey: 'cat_real_2026-08',
        amount: 14000,
        currency: 'HUF',
        updated_at: new Date().toISOString()
    };

    // 2. Timestamp-suffixed standard key: itemId_month_timestamp
    const tsEntry = {
        id: 'real-ts-2',
        itemId: 'cat_real',
        month: '2026-08',
        cellKey: 'cat_real_2026-08_1700000001',
        amount: 26000,
        currency: 'HUF',
        updated_at: new Date().toISOString()
    };

    // 3. Legacy month-first key: month_itemId_timestamp
    const legEntry = {
        id: 'real-leg-3',
        itemId: 'cat_real',
        month: '2026-08',
        cellKey: '2026-08_cat_real_1700000002',
        amount: 32000,
        currency: 'HUF',
        updated_at: new Date().toISOString()
    };

    // 4. Entry belonging to another month: 2026-09
    const otherMonthEntry = {
        id: 'real-other-4',
        itemId: 'cat_real',
        month: '2026-09',
        cellKey: 'cat_real_2026-09_1700000003',
        amount: 99000,
        currency: 'HUF',
        updated_at: new Date().toISOString()
    };

    // Persist all 4 entries to real IndexedDB
    await db.save('entries', stdEntry);
    await db.save('entries', tsEntry);
    await db.save('entries', legEntry);
    await db.save('entries', otherMonthEntry);

    // Call Database.prototype.getByCellKey on real IndexedDB instance
    const results = await db.getByCellKey('cat_real_2026-08');

    // Assert exactly 3 matching records are returned
    assert.equal(results.length, 3, 'Exactly 3 entries belonging to cat_real/2026-08 are returned');

    // Assert the unrelated month is excluded
    assert.ok(!results.some(r => r.id === 'real-other-4'), 'Unrelated month entry (2026-09) is excluded');

    // Assert IDs and amounts are preserved
    const foundStd = results.find(r => r.id === 'real-std-1');
    const foundTs = results.find(r => r.id === 'real-ts-2');
    const foundLeg = results.find(r => r.id === 'real-leg-3');

    assert.ok(foundStd && foundStd.amount === 14000, 'Standard key entry preserved with correct amount');
    assert.ok(foundTs && foundTs.amount === 26000, 'Timestamped key entry preserved with correct amount');
    assert.ok(foundLeg && foundLeg.amount === 32000, 'Legacy month-first key entry preserved with correct amount');

    // Reload / reopen real database to verify persistence
    const reloadedDb = new Database(dbName, 12);
    await reloadedDb.connect();
    assert.equal(reloadedDb.isMock, undefined, 'Reloaded database is also real IndexedDB');

    const reloadedResults = await reloadedDb.getByCellKey('cat_real_2026-08');
    assert.equal(reloadedResults.length, 3, 'Post-reload lookup returns all 3 persisted entries');

    dom.window.close();
});

test('B. Legacy month-first key — getByCellKey("cat1_2026-08") returns legacy entry', async () => {
    const dom = setupEnvironment();
    const db = new Database();
    db._enableMockDb();

    const mockSync = { push: async () => {} };
    const entries = new EntryManager(db, mockSync);

    // Save legacy entry with month-first key format
    await entries.saveEntry({
        id: 'legacy-1',
        cellKey: '2026-08_cat1_123',
        amount: 19000,
        currency: 'HUF'
    });

    // Lookup using standard cell base key
    const found = await entries.getByCellKey('cat1_2026-08');
    assert.equal(found.length, 1, 'Legacy month-first entry returned by standard coordinate lookup');
    assert.equal(found[0].id, 'legacy-1');
    assert.equal(found[0].amount, 19000);

    // Also verify Database.prototype.getByCellKey
    const dbFound = await db.getByCellKey('cat1_2026-08');
    assert.equal(dbFound.length, 1, 'Database.prototype.getByCellKey returns legacy entry');

    dom.window.close();
});

test('C. Mixed-format multi-item cell — canonical and legacy entries appear in cell modal without duplicates', async () => {
    const dom = setupEnvironment();
    const db = new Database();
    db._enableMockDb();

    const mockSync = { push: async () => {} };
    const entries = new EntryManager(db, mockSync);

    const app = {
        db,
        entries,
        hmiNotif: { showToast: () => {} },
        updateReactStore: () => {}
    };

    // 1. Standard key without timestamp
    await entries.saveEntry({
        id: 'ent-std-1',
        itemId: 'catMix',
        month: '2026-08',
        cellKey: 'catMix_2026-08',
        amount: 5000,
        currency: 'HUF'
    });

    // 2. Standard key with timestamp
    await entries.saveEntry({
        id: 'ent-std-2',
        cellKey: 'catMix_2026-08_1700000001',
        amount: 7500,
        currency: 'HUF'
    });

    // 3. Legacy month-first key
    await entries.saveEntry({
        id: 'ent-leg-3',
        cellKey: '2026-08_catMix_1700000002',
        amount: 11000,
        currency: 'HUF'
    });

    // 4. Entry belonging to another month
    await entries.saveEntry({
        id: 'ent-other',
        cellKey: 'catMix_2026-09_1700000003',
        amount: 99999,
        currency: 'HUF'
    });

    const controller = new CellModalController(app);
    controller.currentCellBaseKey = 'catMix_2026-08';

    await controller.refreshList();

    const container = document.getElementById('subEntriesContainer');
    const renderedButtons = container.querySelectorAll('.btn-edit-sub-entry');

    assert.equal(renderedButtons.length, 3, 'Exactly 3 sub-entries rendered in modal list');
    assert.ok(container.innerHTML.includes('5') && container.innerHTML.includes('000 HUF'));
    assert.ok(container.innerHTML.includes('7') && container.innerHTML.includes('500 HUF'));
    assert.ok(container.innerHTML.includes('11') && container.innerHTML.includes('000 HUF'));
    assert.ok(!container.innerHTML.includes('99999'), 'Other month entry is not included');

    dom.window.close();
});

test('D. Selective editing — editing one entry preserves sibling ID, amount, and note', async () => {
    const dom = setupEnvironment();
    const db = new Database();
    db._enableMockDb();

    const mockSync = { push: async () => {} };
    const entries = new EntryManager(db, mockSync);

    const app = {
        db,
        entries,
        hmiNotif: { showToast: () => {} },
        updateReactStore: () => {}
    };

    const entry1 = await entries.saveEntry({
        itemId: 'catA',
        month: '2026-08',
        cellKey: 'catA_2026-08_100',
        amount: 10000,
        note: 'Tétel 1 eredeti',
        currency: 'HUF'
    });

    const entry2 = await entries.saveEntry({
        itemId: 'catA',
        month: '2026-08',
        cellKey: 'catA_2026-08_200',
        amount: 20000,
        note: 'Tétel 2 érintetlen',
        currency: 'HUF'
    });

    const controller = new CellModalController(app);
    controller.currentCellBaseKey = 'catA_2026-08';

    // Start editing entry 1
    controller.editEntry(entry1.id);
    assert.equal(controller.editingEntryId, entry1.id);

    // Change amount and note
    document.getElementById('cellAmountInput').value = '15000';
    document.getElementById('cellNoteInput').value = 'Tétel 1 módosítva';

    await controller.save();

    // Verify entry 1 was updated
    const updated1 = entries.entries.find(e => e.id === entry1.id);
    assert.equal(updated1.amount, 15000);
    assert.equal(updated1.note, 'Tétel 1 módosítva');

    // Verify entry 2 retains exact original ID, amount, and note
    const sibling2 = entries.entries.find(e => e.id === entry2.id);
    assert.equal(sibling2.id, entry2.id);
    assert.equal(sibling2.amount, 20000, 'Sibling amount preserved');
    assert.equal(sibling2.note, 'Tétel 2 érintetlen', 'Sibling note preserved');

    dom.window.close();
});

test('E. Selective deletion — deleting one entry from 3-item cell preserves the other two and updates cell total', async () => {
    const dom = setupEnvironment();
    const db = new Database();
    db._enableMockDb();

    const mockSync = { push: async () => {} };
    const entries = new EntryManager(db, mockSync);

    const app = {
        db,
        entries,
        hmiNotif: { showToast: () => {}, showConfirm: async () => true },
        updateReactStore: () => {}
    };

    const e1 = await entries.saveEntry({ itemId: 'catDel', month: '2026-08', cellKey: 'catDel_2026-08_1', amount: 5000 });
    const e2 = await entries.saveEntry({ itemId: 'catDel', month: '2026-08', cellKey: 'catDel_2026-08_2', amount: 15000 });
    const e3 = await entries.saveEntry({ itemId: 'catDel', month: '2026-08', cellKey: 'catDel_2026-08_3', amount: 25000 });

    const controller = new CellModalController(app);
    controller.currentCellBaseKey = 'catDel_2026-08';

    // Delete e2
    await controller.deleteEntry(e2.id);

    assert.equal(entries.entries.length, 2, 'Cell now contains 2 entries');
    assert.ok(!entries.entries.some(e => e.id === e2.id), 'Deleted entry e2 is removed');

    const remainingE1 = entries.entries.find(e => e.id === e1.id);
    const remainingE3 = entries.entries.find(e => e.id === e3.id);
    assert.ok(remainingE1, 'Entry e1 remains intact');
    assert.ok(remainingE3, 'Entry e3 remains intact');

    // Verify cell total recalculation (5000 + 25000 = 30000)
    const activeEntries = await entries.getByCellKey('catDel_2026-08');
    const recalculatedTotal = activeEntries.reduce((acc, e) => acc + e.amount, 0);
    assert.equal(recalculatedTotal, 30000, 'Cell total correctly recalculated to 30000 after deletion');

    dom.window.close();
});
