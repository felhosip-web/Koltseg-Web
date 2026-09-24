import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { CloudSync, Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';

// Setup DOM environment for tests
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    url: 'http://localhost/'
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
if (globalThis.navigator) {
    Object.defineProperty(globalThis.navigator, 'onLine', {
        configurable: true,
        get: () => true
    });
}

test('Test 1 — successful push: CloudSync.push() resolves normally when cloud upsert/delete succeeds', async () => {
    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const cloudSync = new CloudSync(configManager);

    // Mock client with successful upsert and delete
    cloudSync.client = {
        from: (storeName) => ({
            upsert: async (data, opts) => ({ error: null }),
            delete: () => ({
                eq: async (key, val) => ({ error: null })
            })
        })
    };

    // Push create/update
    await assert.doesNotReject(async () => {
        await cloudSync.push('items', { id: 'item-1', name: 'Test Item' });
    });

    // Push delete
    await assert.doesNotReject(async () => {
        await cloudSync.push('items', { id: 'item-1' }, true);
    });
});

test('Test 2 — failed push: CloudSync.push() rejects and rethrows original error', async () => {
    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const cloudSync = new CloudSync(configManager);

    const networkError = new Error('Network error on upsert');
    cloudSync.client = {
        from: (storeName) => ({
            upsert: async (data, opts) => { throw networkError; },
            delete: () => ({
                eq: async (key, val) => { throw new Error('Database error on delete'); }
            })
        })
    };

    // Upsert failure must reject with original error
    await assert.rejects(
        async () => {
            await cloudSync.push('items', { id: 'item-1', name: 'Test Item' });
        },
        (err) => err === networkError || err.message === 'Network error on upsert'
    );

    // Delete failure must reject
    await assert.rejects(
        async () => {
            await cloudSync.push('items', { id: 'item-1' }, true);
        },
        /Database error on delete/
    );
});

test('Test 3 — successful empty pull: CloudSync.pull() resolves to [] when cloud has no records', async () => {
    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const cloudSync = new CloudSync(configManager);

    cloudSync.client = {
        from: (storeName) => ({
            select: async (cols) => ({ data: [], error: null })
        })
    };

    const result = await cloudSync.pull('items');
    assert.deepEqual(result, []);
});

test('Test 4 — failed pull: CloudSync.pull() rejects and does NOT resolve to []', async () => {
    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const cloudSync = new CloudSync(configManager);

    const pullError = new Error('Supabase query failed: 500 Internal Server Error');
    cloudSync.client = {
        from: (storeName) => ({
            select: async (cols) => ({ data: null, error: pullError })
        })
    };

    await assert.rejects(
        async () => {
            await cloudSync.pull('items');
        },
        (err) => err === pullError || err.message.includes('500 Internal Server Error')
    );
});

test('Test 5 — sync failure safety: a failed cloud pull must not wipe local records', async () => {
    const db = new Database();
    db._enableMockDb();
    await db.save('items', { id: 'local-item-1', name: 'Local Item 1' });
    await db.save('items', { id: 'local-item-2', name: 'Local Item 2' });

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Mock CloudSync client where 'items' pull fails, but other tables succeed
    syncService.cloud.client = {
        from: (storeName) => ({
            select: async (cols) => {
                if (storeName === 'items') {
                    return { data: null, error: new Error('Cloud pull failed for items') };
                }
                return { data: [], error: null };
            },
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = {
        db,
        items: { items: [{ id: 'local-item-1', name: 'Local Item 1' }, { id: 'local-item-2', name: 'Local Item 2' }] },
        months: { months: [] },
        entries: { entries: [] },
        templates: { templates: [] },
        reminderManager: { reminders: [] },
        incomingManager: { incomings: [], senders: [] },
        workLogManager: { works: [] },
        refreshAllTabs: () => {}
    };
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify error was logged in sync results
    assert.equal(syncResult.errors.length >= 1, true);
    assert.equal(syncResult.errors.some(e => e.table === 'items' && e.operation === 'pull'), true);

    // Local items in DB must NOT be purged
    const remainingItems = await db.getAll('items');
    assert.equal(remainingItems.length, 2);
    assert.equal(remainingItems.some(i => i.id === 'local-item-1'), true);
    assert.equal(remainingItems.some(i => i.id === 'local-item-2'), true);
});

test('Test 6 — tombstone safety on failed table pull: tombstones must NOT be applied to local records when target table pull fails', async () => {
    const db = new Database();
    db._enableMockDb();
    await db.save('items', { id: 'local-item-tombstone', name: 'Preserved Local Item' });

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Mock CloudSync client where 'items' pull fails, but 'deleted_records' succeeds returning a tombstone for 'items'
    syncService.cloud.client = {
        from: (storeName) => ({
            select: async (cols) => {
                if (storeName === 'items') {
                    return { data: null, error: new Error('Cloud pull failed for items') };
                }
                if (storeName === 'deleted_records') {
                    return {
                        data: [{
                            id: 'tombstone-1',
                            table_name: 'items',
                            record_id: 'local-item-tombstone',
                            deleted_at: new Date().toISOString()
                        }],
                        error: null
                    };
                }
                return { data: [], error: null };
            },
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = {
        db,
        items: { items: [{ id: 'local-item-tombstone', name: 'Preserved Local Item' }] },
        months: { months: [] },
        entries: { entries: [] },
        templates: { templates: [] },
        reminderManager: { reminders: [] },
        incomingManager: { incomings: [], senders: [] },
        workLogManager: { works: [] },
        refreshAllTabs: () => {}
    };
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify error was reported
    assert.equal(syncResult.errors.length >= 1, true);
    assert.equal(syncResult.errors.some(e => e.table === 'items' && e.operation === 'pull'), true);

    // Assert local "items" record still exists after sync
    const remainingItems = await db.getAll('items');
    assert.equal(remainingItems.length, 1);
    assert.equal(remainingItems[0].id, 'local-item-tombstone');
});
