import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

import { Database, ConfigManager } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { generateUUID } from '../js/uuid-utils.js';

function setupEnvironment() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost/',
        runScripts: 'dangerously'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    Object.defineProperty(globalThis, 'navigator', {
        value: dom.window.navigator,
        configurable: true,
        writable: true
    });
    globalThis.localStorage = dom.window.localStorage;
    globalThis.localStorage.clear();
    return dom;
}

function simulateServerTrigger(tableName, incomingRecord, existingServerStore, deletedRecordsStore) {
    const recId = tableName === 'months' ? incomingRecord.month : incomingRecord.id;
    if (!recId) return { action: 'inserted', record: incomingRecord };

    const incomingTime = new Date(incomingRecord.updated_at || Date.now()).getTime();

    // 1. Check tombstone in deletedRecordsStore
    const tombstones = (deletedRecordsStore || []).filter(t => t.table_name === tableName && String(t.record_id) === String(recId));
    if (tombstones.length > 0) {
        const latestTombstone = tombstones.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime())[0];
        const tombstoneTime = new Date(latestTombstone.deleted_at).getTime();
        if (tombstoneTime >= incomingTime) {
            // Suppress write (trigger RETURN NULL)
            return { action: 'suppressed_tombstone', record: null };
        }
    }

    // 2. Check existing stored row
    const existingIndex = (existingServerStore || []).findIndex(r => (tableName === 'months' ? r.month : r.id) === recId);
    if (existingIndex !== -1) {
        const storedRow = existingServerStore[existingIndex];
        const storedTime = new Date(storedRow.updated_at || 0).getTime();
        if (storedTime >= incomingTime) {
            // Suppress update (trigger RETURN NULL)
            return { action: 'suppressed_stale', record: storedRow };
        }
        // Newer timestamp -> update row
        existingServerStore[existingIndex] = { ...incomingRecord };
        return { action: 'updated', record: existingServerStore[existingIndex] };
    }

    // 3. Insert new row
    existingServerStore.push({ ...incomingRecord });
    return { action: 'inserted', record: incomingRecord };
}

test('PLG3-P4-1 Scenario 1 — Newer write reaches server before an older delayed write', async () => {
    setupEnvironment();
    const serverStore = [
        { id: 'item-1', name: 'Newer Version (T2)', updated_at: '2026-01-01T12:00:00.000Z' }
    ];

    const delayedOlderWrite = { id: 'item-1', name: 'Delayed Older Version (T1)', updated_at: '2026-01-01T10:00:00.000Z' };

    const result = simulateServerTrigger('items', delayedOlderWrite, serverStore, []);
    assert.equal(result.action, 'suppressed_stale', 'Server trigger suppresses write with older updated_at');
    assert.equal(serverStore[0].name, 'Newer Version (T2)', 'Server store retains newer version');
});

test('PLG3-P4-1 Scenario 2 — Older write retried after newer write committed', async () => {
    setupEnvironment();
    const db = new Database('TestDB_RetryStale_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    config.useSupabase = true;
    const syncService = new SyncService(config, null);

    const T1 = '2026-01-01T10:00:00.000Z';
    const T2 = '2026-01-01T12:00:00.000Z';

    // Server has T2
    const serverStore = [{ id: 'entry-1', amount: 500, updated_at: T2 }];

    // Client queue item has stale T1
    syncService.addToQueue('update', { id: 'entry-1', amount: 100, updated_at: T1 }, 'entries');

    let upsertAttempts = 0;
    syncService.cloud = {
        client: {},
        upsert: async (table, data) => {
            upsertAttempts++;
            const trigRes = simulateServerTrigger(table, data, serverStore, []);
            if (trigRes.action.startsWith('suppressed')) {
                // PostgREST returns HTTP 200/204 success on trigger suppression
                return;
            }
        }
    };

    const res = await syncService.processQueue(true);
    assert.equal(res.succeeded, 1, 'Stale write request resolves cleanly without throwing HTTP error');
    assert.equal(upsertAttempts, 1, 'Upsert executed exactly once without infinite retries');
    assert.equal(serverStore[0].amount, 500, 'Server row preserved at newer T2 amount');

    const status = syncService.getQueueStatus();
    assert.equal(status.pending, 0, 'Stale item removed from queue after clean resolution');
});

test('PLG3-P4-1 Scenario 3 — Equal timestamps with differing payloads handled deterministically', async () => {
    setupEnvironment();
    const T0 = '2026-01-01T12:00:00.000Z';
    const serverStore = [{ id: 'item-eq', name: 'Server Version', updated_at: T0 }];
    const incomingEq = { id: 'item-eq', name: 'Incoming Equal Version', updated_at: T0 };

    const result = simulateServerTrigger('items', incomingEq, serverStore, []);
    assert.equal(result.action, 'suppressed_stale', 'Equal timestamp write is suppressed deterministically');
    assert.equal(serverStore[0].name, 'Server Version', 'Existing stored row preserved on equal timestamp');
});

test('PLG3-P4-1 Scenario 4 — Upsert arrives after matching tombstone exists', async () => {
    setupEnvironment();
    const deletedStore = [
        { id: generateUUID(), record_id: 'item-del-1', table_name: 'items', deleted_at: '2026-01-01T12:00:00.000Z' }
    ];
    const serverStore = [];

    const staleUpsert = { id: 'item-del-1', name: 'Resurrected Item', updated_at: '2026-01-01T11:00:00.000Z' };

    const result = simulateServerTrigger('items', staleUpsert, serverStore, deletedStore);
    assert.equal(result.action, 'suppressed_tombstone', 'Upsert suppressed when active tombstone exists with deleted_at >= updated_at');
    assert.equal(serverStore.length, 0, 'Record was NOT resurrected in server store');
});

test('PLG3-P4-1 Scenario 5 — Existing legacy records without optional fields remain compatible', async () => {
    setupEnvironment();
    const serverStore = [];
    const legacyRecord = { id: 'legacy-1', name: 'Legacy Entry', updated_at: '2026-01-01T10:00:00.000Z' };

    const result = simulateServerTrigger('items', legacyRecord, serverStore, []);
    assert.equal(result.action, 'inserted', 'Legacy record inserted successfully');
    assert.equal(serverStore.length, 1);
    assert.equal(serverStore[0].id, 'legacy-1');
});

test('PLG3-P4-1 Scenario 6 — Legitimate new record can be inserted or recreated after tombstone', async () => {
    setupEnvironment();
    const deletedStore = [
        { id: generateUUID(), record_id: 'item-recreate', table_name: 'items', deleted_at: '2026-01-01T10:00:00.000Z' }
    ];
    const serverStore = [];

    // Re-creation with newer timestamp
    const newInsert = { id: 'item-recreate', name: 'Recreated Item', updated_at: '2026-01-01T12:00:00.000Z' };

    const result = simulateServerTrigger('items', newInsert, serverStore, deletedStore);
    assert.equal(result.action, 'inserted', 'Legitimate recreation allowed when updated_at > deleted_at');
    assert.equal(serverStore.length, 1);
    assert.equal(serverStore[0].name, 'Recreated Item');
});

test('PLG3-P4-1 Scenario 7 — Rejected stale operation does not delete newer outbox entry or cause infinite retries', async () => {
    setupEnvironment();
    const db = new Database('TestDB_OutboxSafety_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    config.useSupabase = true;
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const col = pluginStorage.collection('metrics');

    // Newer operation (op_id_2) created
    await col.set('metric_key', { val: 200 });
    const userRec = storageService.getAllRecords().find(r => r.record_key === 'metric_key');
    const outbox2 = storageService.getHostOutboxRecords().find(r => r.data.record_key === 'metric_key');
    const opId2 = outbox2.op_id;

    // Stale ACK attempt for older op_id_1 should NOT remove op_id_2
    const staleOpId1 = generateUUID();
    const removedStale = await storageService.removeHostOutboxRecord(staleOpId1);
    assert.equal(removedStale, false, 'Stale ACK returns false for non-matching op_id');

    const remainingOutbox = storageService.getHostOutboxRecords().filter(r => r.data.record_key === 'metric_key');
    assert.equal(remainingOutbox.length, 1, 'Newer outbox operation retained');
    assert.equal(remainingOutbox[0].op_id, opId2, 'Newer operation op_id preserved');
});

test('PLG3-P4-1 Scenario 8 — Full sync pull reconciliation updates local state after server trigger suppression', async () => {
    setupEnvironment();
    const db = new Database('TestDB_PullReconcile_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    config.useSupabase = true;
    const syncService = new SyncService(config, null);

    const T1 = '2026-01-01T10:00:00.000Z';
    const T2 = '2026-01-01T12:00:00.000Z';

    // Local DB has stale T1 version
    const localStale = { id: 'item-1', name: 'Stale Local (T1)', updated_at: T1 };
    await db.save('items', localStale);

    // Cloud has authoritative T2 version
    const cloudFresh = [{ id: 'item-1', name: 'Fresh Cloud (T2)', updated_at: T2 }];

    syncService.cloud = {
        client: {},
        pull: async (table) => table === 'items' ? cloudFresh : [],
        upsert: async () => {},
        delete: async () => {}
    };

    const mockApp = {
        db,
        items: { items: [localStale], load: async () => {} },
        months: { months: [], load: async () => {} },
        entries: { entries: [], load: async () => {} },
        templates: { templates: [], load: async () => {} },
        reminderManager: { reminders: [], load: async () => {} },
        incomingManager: { incomings: [], senders: [], load: async () => {} },
        workLogManager: { works: [], load: async () => {} },
        pluginStorageService: { load: async () => {}, getAllRecords: () => [] }
    };
    syncService.setApp(mockApp);

    const syncRes = await syncService.sync();
    assert.equal(syncRes.status, 'success');

    // Local IndexedDB must now hold the fresh cloud T2 version
    const updatedLocal = await db.getAll('items');
    assert.equal(updatedLocal.length, 1);
    assert.equal(updatedLocal[0].name, 'Fresh Cloud (T2)', 'Local state updated to fresh cloud version on pull reconciliation');
});
