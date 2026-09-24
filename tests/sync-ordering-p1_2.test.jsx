import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { Database } from '../js/oop-core.js';
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
        items: { items: initialData.items || [], load: async () => {} },
        months: { months: initialData.months || [], load: async () => {} },
        entries: { entries: initialData.entries || [], load: async () => {} },
        templates: { templates: initialData.templates || [], load: async () => {} },
        reminderManager: { reminders: initialData.reminders || [], load: async () => {} },
        incomingManager: { incomings: initialData.incomings || [], senders: initialData.senders || [], load: async () => {} },
        workLogManager: { works: initialData.works || [], load: async () => {} },
        refreshAllTabs: () => {}
    };
}

test('Sync Ordering — Operation Sequence: pull < merge < save < queue push', async () => {
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

    const callSequence = [];

    // Spy on pull
    const originalPull = syncService.pull.bind(syncService);
    syncService.pull = async (storeName) => {
        if (!callSequence.includes('pull')) {
            callSequence.push('pull');
        }
        return originalPull(storeName);
    };

    // Spy on _mergeTable
    const originalMergeTable = syncService._mergeTable.bind(syncService);
    syncService._mergeTable = (localItems, cloudItems, table) => {
        if (!callSequence.includes('merge')) {
            callSequence.push('merge');
        }
        return originalMergeTable(localItems, cloudItems, table);
    };

    // Spy on _saveMergedToLocal
    const originalSaveMerged = syncService._saveMergedToLocal.bind(syncService);
    syncService._saveMergedToLocal = async (mergedData) => {
        if (!callSequence.includes('saveMergedToLocal')) {
            callSequence.push('saveMergedToLocal');
        }
        return originalSaveMerged(mergedData);
    };

    // Spy on processQueue
    const originalProcessQueue = syncService.processQueue.bind(syncService);
    syncService.processQueue = async (fromSync, failedTables) => {
        if (!callSequence.includes('processQueue')) {
            callSequence.push('processQueue');
        }
        return originalProcessQueue(fromSync, failedTables);
    };

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    syncService.setApp(createMockApp(db));

    // Add a queued item
    syncService.addToQueue('update', { id: 'item-1', name: 'Local Item' }, 'items');

    await syncService.sync();

    // Verify call sequence strictly matches pull < merge < saveMergedToLocal < processQueue
    assert.deepEqual(callSequence, ['pull', 'merge', 'saveMergedToLocal', 'processQueue']);
});

test('Test A — Queue + Fresh Cloud Update: Pull first, Cloud wins, Queue pruned, No silent overwrite', async () => {
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

    const T1 = '2026-01-01T11:00:00.000Z'; // Local change timestamp
    const T2 = '2026-01-01T12:00:00.000Z'; // Fresh cloud update timestamp

    // 1. User made a local change offline (at T1)
    const localItem = { id: 'item-1', name: 'Stale Local Version', updated_at: T1 };
    await db.save('items', localItem);

    // Add queued update for item-1
    syncService.addToQueue('update', localItem, 'items');

    // Track upserts to ensure Cloud version is NOT overwritten
    let cloudUpserts = [];

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => {
                if (storeName === 'items') {
                    // Cloud has fresh update at T2
                    return {
                        data: [{ id: 'item-1', name: 'Fresh Cloud Version', updated_at: T2 }],
                        error: null
                    };
                }
                return { data: [], error: null };
            },
            upsert: async (data) => {
                cloudUpserts.push({ storeName, data });
                return { error: null };
            },
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = createMockApp(db, { items: [localItem] });
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify sync succeeded without errors
    assert.equal(syncResult.errors.length, 0);

    // Verify cloud.upsert was NOT called with stale local version for item-1
    const staleUpserts = cloudUpserts.filter(u => u.storeName === 'items' && u.data.name === 'Stale Local Version');
    assert.equal(staleUpserts.length, 0, 'Stale local queued update must NOT be pushed over fresh cloud data');

    // Local IndexedDB must now contain the fresh cloud version
    const updatedLocal = await db.getAll('items');
    assert.equal(updatedLocal.length, 1);
    assert.equal(updatedLocal[0].name, 'Fresh Cloud Version');

    // Queue must no longer contain the stale pending item
    const queueStatus = syncService.getQueueStatus();
    const itemInQueue = queueStatus.items.find(i => i.table === 'items' && i.data.id === 'item-1');
    assert.equal(itemInQueue, undefined, 'Stale queue item must be pruned from queue');
});

test('Test B — Queue + No Cloud Conflict: Merge succeeds, Queue Push succeeds, Consistent state', async () => {
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

    const T1 = '2026-01-01T11:00:00.000Z';
    const localItem = { id: 'item-1', name: 'New Offline Item', updated_at: T1 };
    await db.save('items', localItem);

    syncService.addToQueue('create', localItem, 'items');

    let pushedToCloud = [];

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async (data) => {
                pushedToCloud.push({ storeName, data });
                return { error: null };
            },
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = createMockApp(db, { items: [localItem] });
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify sync succeeded and queue pushed
    assert.equal(syncResult.errors.length, 0);
    assert.equal(syncResult.queueSucceeded, 1);
    assert.equal(syncResult.queuePending, 0);

    // Checkpoint must advance
    assert.equal(syncResult.checkpointUpdated, true);

    // Verify item was pushed to cloud
    const itemsPushed = pushedToCloud.filter(p => p.storeName === 'items');
    assert.ok(itemsPushed.length >= 1, 'Items table update must be pushed to cloud');
    assert.equal(itemsPushed[0].data.name, 'New Offline Item');
});

test('Test C — Pull Failure: Queue items for failed table skipped, pending queue preserved, local data safe, checkpoint unchanged', async () => {
    localStorage.clear();
    const oldTime = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldTime.toISOString());

    const db = new Database();
    db._enableMockDb();

    const localItem = { id: 'item-1', name: 'Unpushed Local Item' };
    await db.save('items', localItem);

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Add queued change for items table
    const queuedItem = syncService.addToQueue('update', localItem, 'items');

    let itemsUpsertCalled = false;

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => {
                if (storeName === 'items') {
                    throw new Error('Network error pulling items');
                }
                return { data: [], error: null };
            },
            upsert: async () => {
                if (storeName === 'items') {
                    itemsUpsertCalled = true;
                }
                return { error: null };
            },
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = createMockApp(db, { items: [localItem] });
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Pull error must be recorded
    assert.ok(syncResult.errors.some(e => e.table === 'items' && e.operation === 'pull'));

    // Checkpoint must NOT be updated
    assert.equal(syncResult.checkpointUpdated, false);
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldTime.toISOString());

    // Queue item for items must NOT have been pushed blindly
    assert.equal(itemsUpsertCalled, false);

    // Queue item must remain in pending state
    const status = syncService.getQueueStatus();
    assert.equal(status.pending, 1);
    assert.equal(status.items[0].id, queuedItem.id);
    assert.equal(status.items[0].status, 'pending');

    // Local IndexedDB item preserved
    const remainingLocal = await db.getAll('items');
    assert.equal(remainingLocal.length, 1);
    assert.equal(remainingLocal[0].name, 'Unpushed Local Item');
});

test('Test D — Merge Failure: Queue Push does not run, queue remains retry-capable, checkpoint unchanged', async () => {
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

    const queuedItem = syncService.addToQueue('update', { id: 'item-1', name: 'Pending Item' }, 'items');

    let processQueueExecuted = false;

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    // Force _mergeTable to throw an unhandled merge exception
    syncService._mergeTable = () => {
        throw new Error('Merge calculation error');
    };

    // Spy processQueue
    const originalProcessQueue = syncService.processQueue.bind(syncService);
    syncService.processQueue = async (fromSync, failedTables) => {
        processQueueExecuted = true;
        return originalProcessQueue(fromSync, failedTables);
    };

    syncService.setApp(createMockApp(db));

    // Sync must fail with the merge exception
    await assert.rejects(
        async () => {
            await syncService.sync();
        },
        /Merge calculation error/
    );

    // Queue Push must NOT have been executed
    assert.equal(processQueueExecuted, false);

    // Queue item must remain pending and retryable
    const status = syncService.getQueueStatus();
    assert.equal(status.pending, 1);
    assert.equal(status.items[0].id, queuedItem.id);
    assert.equal(status.items[0].status, 'pending');

    // Checkpoint must remain unchanged
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldTime.toISOString());
});

test('Test E — Queue Push Failure: Local merged save retained, queue remains pending/retryable, checkpoint unchanged, SyncReport indicates error', async () => {
    localStorage.clear();
    const oldTime = new Date('2026-01-01T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldTime.toISOString());

    const db = new Database();
    db._enableMockDb();

    // Local DB has a merged/updated item
    const mergedItem = { id: 'item-1', name: 'Merged Local Item' };
    await db.save('items', mergedItem);

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Add queue item that will fail during push
    const queuedItem = syncService.addToQueue('update', mergedItem, 'items');

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => {
                throw new Error('500 Internal Server Error pushing queue');
            },
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const app = createMockApp(db, { items: [mergedItem] });
    syncService.setApp(app);

    const syncResult = await syncService.sync();

    // Verify local merged save was retained in DB
    const savedInLocal = await db.getAll('items');
    assert.equal(savedInLocal.length, 1);
    assert.equal(savedInLocal[0].name, 'Merged Local Item');

    // Queue item remains in queue in retryable pending/failed state
    const queueStatus = syncService.getQueueStatus();
    assert.equal(queueStatus.hasPending, true);
    assert.equal(queueStatus.items[0].id, queuedItem.id);

    // Checkpoint must NOT be updated
    assert.equal(syncResult.checkpointUpdated, false);
    assert.equal(localStorage.getItem('hmi_lastSyncTime'), oldTime.toISOString());

    // SyncReport must report queue error and partial/error status
    assert.ok(syncResult.errors.some(e => e.operation === 'queue'));
    assert.ok(syncResult.report);
    assert.equal(syncResult.report.status, 'partial');
});
