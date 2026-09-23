import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { SyncService } from '../js/sync-service.js';
import { WorkLogManager } from '../js/work-log.js';
import { Database } from '../js/oop-core.js';
import { useAppStore } from '../js/store.js';

// Setup DOM environment for tests
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    url: 'http://localhost/'
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

test('SyncService._isRecordDifferent handles primitive type variations without false positives', () => {
    const configManager = { useSupabase: false };
    const offlineHandler = { getPendingCount: () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Number vs string number
    assert.equal(syncService._isRecordDifferent({ amount: 1000 }, { amount: '1000' }), false);
    // Boolean vs boolean
    assert.equal(syncService._isRecordDifferent({ completed: true }, { completed: true }), false);
    // String vs string
    assert.equal(syncService._isRecordDifferent({ name: 'Test' }, { name: 'Test' }), false);
    // Truly different values
    assert.equal(syncService._isRecordDifferent({ amount: 1000 }, { amount: 2000 }), true);
});

test('SyncService.addToQueue correctly resolves customKey for months', () => {
    const configManager = { useSupabase: false };
    const offlineHandler = { getPendingCount: () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Add month update
    const item1 = syncService.addToQueue('update', { month: '2026-08' }, 'months');
    assert.equal(item1.customKey, 'month');

    // Add month delete
    const item2 = syncService.addToQueue('delete', { month: '2026-08' }, 'months', 'high');
    assert.equal(item2.customKey, 'month');
});

test('WorkLogManager updates Zustand central store on load', async () => {
    const mockDb = {
        getAll: async (table) => {
            if (table === 'works') {
                return [{ id: 'w1', name: 'Work 1', created_at: '2026-08-01T10:00:00Z' }];
            }
            return [];
        }
    };

    const workLogManager = new WorkLogManager(mockDb, null);
    await workLogManager.load();

    const storeWorks = useAppStore.getState().works;
    assert.equal(storeWorks.length, 1);
    assert.equal(storeWorks[0].name, 'Work 1');
});

test('SyncService._saveMergedToLocal purges stale local records from IndexedDB', async () => {
    const db = new Database();
    db._enableMockDb();
    await db.save('items', { id: 'item1', name: 'Item 1' });
    await db.save('items', { id: 'item2', name: 'Item 2 (To be purged)' });

    const configManager = { useSupabase: false };
    const offlineHandler = { getPendingCount: () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    const app = {
        db,
        items: { load: async () => {} },
        refreshAllTabs: () => {}
    };
    syncService.setApp(app);

    // mergedData only has item1 (item2 was deleted on Cloud)
    const mergedData = {
        items: [{ id: 'item1', name: 'Item 1' }]
    };

    await syncService._saveMergedToLocal(mergedData);

    const remainingLocalItems = await db.getAll('items');
    assert.equal(remainingLocalItems.length, 1);
    assert.equal(remainingLocalItems[0].id, 'item1');
});
