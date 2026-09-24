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

function createMockApp(db, initialData = {}) {
    return {
        db,
        items: { items: initialData.items || [] },
        months: { months: initialData.months || [] },
        entries: { entries: initialData.entries || [] },
        templates: { templates: initialData.templates || [] },
        reminderManager: { reminders: initialData.reminders || [] },
        incomingManager: { incomings: initialData.incomings || [], senders: initialData.senders || [] },
        workLogManager: { works: initialData.works || [] },
        refreshAllTabs: () => {}
    };
}

test('Test 1 — Full success advances checkpoint', async () => {
    localStorage.clear();
    const oldTime = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldTime.toISOString());

    const db = new Database();
    db._enableMockDb();

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    syncService.setApp(createMockApp(db));

    assert.equal(syncService.lastSyncTime.toISOString(), oldTime.toISOString());

    const syncResult = await syncService.sync();

    // Verify sync had no errors
    assert.equal(syncResult.errors.length, 0);

    // Checkpoint must be advanced
    assert.ok(syncService.lastSyncTime > oldTime);
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), syncService.lastSyncTime.toISOString());
});

test('Test 2 — Failed pull does NOT advance checkpoint', async () => {
    localStorage.clear();
    const oldTime = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldTime.toISOString());

    const db = new Database();
    db._enableMockDb();
    await db.save('items', { id: 'local-item-1', name: 'Preserved Item' });

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => {
                if (storeName === 'items') {
                    return { data: null, error: new Error('Network error on items pull') };
                }
                return { data: [], error: null };
            },
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = createMockApp(db, { items: [{ id: 'local-item-1', name: 'Preserved Item' }] });
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify partial sync recorded error
    assert.ok(syncResult.errors.length >= 1);
    assert.ok(syncResult.errors.some(e => e.table === 'items' && e.operation === 'pull'));

    // Checkpoint must NOT be advanced
    assert.equal(syncService.lastSyncTime.toISOString(), oldTime.toISOString());
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldTime.toISOString());

    // Failed table protection: local data preserved
    const remainingItems = await db.getAll('items');
    assert.equal(remainingItems.length, 1);
    assert.equal(remainingItems[0].id, 'local-item-1');
});

test('Test 3 — Failed push does NOT advance checkpoint', async () => {
    localStorage.clear();
    const oldTime = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldTime.toISOString());

    const db = new Database();
    db._enableMockDb();

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => {
                throw new Error('Supabase write error during push');
            },
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    // App has a local item that will trigger push
    const app = createMockApp(db, {
        items: [{ id: 'item-new', name: 'New Local Item', _source: 'local' }]
    });
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify push error recorded
    assert.ok(syncResult.errors.length >= 1);
    assert.ok(syncResult.errors.some(e => e.table === 'items' && e.operation === 'push'));

    // Checkpoint must NOT be advanced
    assert.equal(syncService.lastSyncTime.toISOString(), oldTime.toISOString());
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldTime.toISOString());
});

test('Test 4 — Critical sync exception does NOT advance checkpoint', async () => {
    localStorage.clear();
    const oldTime = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldTime.toISOString());

    const db = new Database();
    db._enableMockDb();

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    // Force processQueue to throw a critical unhandled exception
    syncService.processQueue = async () => {
        throw new Error('Critical failure during processQueue');
    };

    syncService.setApp(createMockApp(db));

    await assert.rejects(
        async () => {
            await syncService.sync();
        },
        /Critical failure during processQueue/
    );

    // Checkpoint must NOT be advanced
    assert.equal(syncService.lastSyncTime.toISOString(), oldTime.toISOString());
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldTime.toISOString());
});

test('Conflict-detection regression — preserved checkpoint enables conflict detection on subsequent sync', async () => {
    localStorage.clear();
    // 1. Establish an old successful checkpoint
    const oldCheckpoint = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldCheckpoint.toISOString());

    const db = new Database();
    db._enableMockDb();

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    const localItemTime = '2026-01-01T11:00:00.000Z'; // > oldCheckpoint
    const cloudItemTime = '2026-01-01T12:00:00.000Z'; // > oldCheckpoint

    let worksPullShouldFail = true;

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => {
                if (storeName === 'works' && worksPullShouldFail) {
                    return { data: null, error: new Error('Works pull failed') };
                }
                if (storeName === 'items') {
                    return {
                        data: [{
                            id: 'item-1',
                            name: 'Cloud Updated Name',
                            updated_at: cloudItemTime
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

    const app = createMockApp(db, {
        items: [{
            id: 'item-1',
            name: 'Local Updated Name',
            updated_at: localItemTime
        }]
    });
    syncService.setApp(app);

    // 2. Run a partial sync where 'works' table pull fails
    const syncResult1 = await syncService.sync();
    assert.ok(syncResult1.errors.some(e => e.table === 'works' && e.operation === 'pull'));

    // 3. Verify that the checkpoint remains the old value
    assert.equal(syncService.lastSyncTime.toISOString(), oldCheckpoint.toISOString());
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldCheckpoint.toISOString());

    // 4. On a subsequent successful sync, fix the 'works' pull failure
    worksPullShouldFail = false;

    const syncResult2 = await syncService.sync();
    assert.equal(syncResult2.errors.length, 0);

    // Verify that conflict detection was triggered for item-1 because localTime > lastSyncTime AND cloudTime > lastSyncTime
    assert.ok(syncService.lastSyncConflicts.length > 0 || syncService.currentSyncConflicts.length > 0);
    const recordedConflict = syncService.lastSyncConflicts.find(c => c.key === 'item-1') ||
                             syncService.currentSyncConflicts.find(c => c.key === 'item-1');
    assert.ok(recordedConflict, 'Conflict for item-1 should have been detected because lastSyncTime was preserved at oldCheckpoint');

    // And after full success, the checkpoint is now advanced
    assert.ok(syncService.lastSyncTime > oldCheckpoint);
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), syncService.lastSyncTime.toISOString());
});
