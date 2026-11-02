import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { Database, EntryManager, ConfigManager } from '../js/oop-core.js';

let dom;

beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
});

afterEach(() => {
    dom.window.close();
});

test('Switching primaryCurrency from HUF to EUR and back never modifies stored database records', async () => {
    const db = new Database('test_immutability_db_' + Date.now());
    await db.connect();

    const mockSyncService = { push: async () => {} };
    const entryManager = new EntryManager(db, mockSyncService);

    // Seed transactions with mixed currencies
    const originalRecords = [
        { id: 'e1', itemId: 'itemA', month: '2026-08', cellKey: 'itemA_2026-08', amount: 40000, currency: 'HUF' },
        { id: 'e2', itemId: 'itemA', month: '2026-08', cellKey: 'itemA_2026-08_1', amount: 100, currency: 'EUR' },
        { id: 'e3', itemId: 'itemB', month: '2026-08', cellKey: 'itemB_2026-08', amount: 250, currency: 'EUR' }
    ];

    for (const rec of originalRecords) {
        await entryManager.saveEntry(rec);
    }

    const config = new ConfigManager();
    assert.equal(config.primaryCurrency, 'HUF');

    // Switch to EUR
    config.saveSettings({ primaryCurrency: 'EUR' });
    assert.equal(config.primaryCurrency, 'EUR');
    assert.equal(localStorage.getItem('app_primary_currency'), 'EUR');

    // Reload from Database
    await entryManager.load();
    const loadedEURMode = entryManager.entries;

    // Verify all records in IndexedDB retain exact original amounts and currencies
    for (const orig of originalRecords) {
        const found = loadedEURMode.find(e => e.id === orig.id);
        assert.ok(found, `Record ${orig.id} exists`);
        assert.equal(found.amount, orig.amount, `Amount must not be rewritten for ${orig.id}`);
        assert.equal(found.currency, orig.currency, `Currency must not be rewritten for ${orig.id}`);
    }

    // Switch back to HUF
    config.saveSettings({ primaryCurrency: 'HUF' });
    assert.equal(config.primaryCurrency, 'HUF');
    assert.equal(localStorage.getItem('app_primary_currency'), 'HUF');

    await entryManager.load();
    const loadedHUFMode = entryManager.entries;

    for (const orig of originalRecords) {
        const found = loadedHUFMode.find(e => e.id === orig.id);
        assert.ok(found, `Record ${orig.id} exists`);
        assert.equal(found.amount, orig.amount);
        assert.equal(found.currency, orig.currency);
    }
});
