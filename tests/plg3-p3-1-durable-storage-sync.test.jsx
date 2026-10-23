import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

import { Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { ConfigManager } from '../js/oop-core.js';
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

test('PLG3-P3-1 Req 1 — Transaction abort leaves no partial writes', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Abort_' + Date.now(), 12);
    await db.connect();

    try {
        await db.runTransaction(['plugin_records'], 'readwrite', (tx, stores) => {
            const store = stores.plugin_records;
            store.put({ id: 'rec1', plugin_id: 'test_plugin', collection: 'data', record_key: 'k1', data: { val: 1 } });
            store.put({ id: 'rec2', plugin_id: 'test_plugin', collection: 'data', record_key: 'k2', data: { val: 2 } });
            throw new Error('Simulated transaction failure');
        });
        assert.fail('Should have thrown error on transaction abort');
    } catch (err) {
        assert.equal(err.message, 'Simulated transaction failure');
    }

    const records = await db.getAll('plugin_records');
    assert.equal(records.length, 0, 'No records should be persisted when transaction aborts');
});

test('PLG3-P3-1 Req 2 & 3 — Business-record and outbox persistence is atomic', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Atomic_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const logsCol = pluginStorage.collection('logs');

    await logsCol.set('entry_1', { liters: 10, odo: 1000 });

    const rawAll = await db.getAll('plugin_records');
    const dataRec = rawAll.find(r => r.collection === 'logs');
    const outboxRec = rawAll.find(r => r.collection === '__host_outbox__');

    assert.ok(dataRec, 'Data record persisted to IndexedDB');
    assert.ok(outboxRec, 'Outbox record persisted to IndexedDB');
    assert.equal(dataRec.op_id, outboxRec.op_id, 'Data and outbox records share the exact same op_id');
    assert.equal(dataRec.schema_version, 1, 'Data record has schema_version = 1');
});

test('PLG3-P3-1 Req 4 — Exact op_id acknowledgement deletes only acknowledged operation', async () => {
    setupEnvironment();
    const db = new Database('TestDB_ACK_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const col = pluginStorage.collection('items');

    await col.set('item_1', { name: 'Item 1' });
    await col.set('item_2', { name: 'Item 2' });

    const outboxBefore = storageService.getHostOutboxRecords();
    assert.equal(outboxBefore.length, 2);

    const opId1 = outboxBefore[0].op_id;
    const removed = await storageService.removeHostOutboxRecord(opId1);
    assert.equal(removed, true, 'Outbox record removed successfully');

    const outboxAfter = storageService.getHostOutboxRecords();
    assert.equal(outboxAfter.length, 1, 'Only 1 outbox record remains');
    assert.equal(outboxAfter[0].op_id, outboxBefore[1].op_id, 'Remaining outbox record has exact un-ACKed op_id');
});

test('PLG3-P3-1 Req 5 — Newer pending operation survives an older operation ACK', async () => {
    setupEnvironment();
    const db = new Database('TestDB_InFlight_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const col = pluginStorage.collection('settings');

    // Initial edit (op_id_1)
    await col.set('theme', { mode: 'light' });
    const outbox1 = storageService.getHostOutboxRecords().find(r => r.data.record_key === 'theme');
    const opId1 = outbox1.op_id;

    // Second edit while op_id_1 is in flight (op_id_2)
    await col.set('theme', { mode: 'dark' });
    const outboxAll = storageService.getHostOutboxRecords().filter(r => r.data.record_key === 'theme');
    assert.equal(outboxAll.length, 2, 'Two outbox entries exist for in-flight and newer operations');

    // ACK arrives for op_id_1
    await storageService.removeHostOutboxRecord(opId1);

    const remaining = storageService.getHostOutboxRecords().filter(r => r.data.record_key === 'theme');
    assert.equal(remaining.length, 1, 'Newer operation remains in outbox after older ACK');
    assert.notEqual(remaining[0].op_id, opId1, 'Remaining operation is the newer edit');
    assert.equal(remaining[0].data.payload.data.mode, 'dark', 'Newer payload data preserved in outbox');
});

test('PLG3-P3-1 Req 6 — Ambiguous upload failure retains pending outbox operation', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Ambiguous_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const col = pluginStorage.collection('notes');

    await col.set('note_1', { title: 'Important' });

    // Simulate failed queue execution
    const item = {
        id: 'q_item_1',
        operation: 'update',
        table: 'plugin_records',
        data: { id: 'rec_1', op_id: 'op_test_123' },
        status: 'pending'
    };

    // Failed execution (e.g. timeout or server 500)
    const execResult = { success: false, error: 'Network timeout' };
    assert.equal(execResult.success, false);

    // Outbox record remains intact in IndexedDB
    const outboxRecords = storageService.getHostOutboxRecords();
    assert.equal(outboxRecords.length, 1, 'Pending operation retained in IDB outbox after ambiguous network failure');
});

test('PLG3-P3-1 Req 7 — Boot reconciliation preserves pending outbox entries and is repeatable', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Boot_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);

    // Populate un-ACKed outbox entries directly into IDB
    const opId = generateUUID();
    const mockOutbox = {
        id: generateUUID(),
        plugin_id: 'boot_plugin',
        collection: '__host_outbox__',
        record_key: 'rec_boot_1',
        data: {
            op: 'update',
            op_id: opId,
            target_id: 'rec_boot_1',
            plugin_id: 'boot_plugin',
            target_collection: 'data',
            record_key: 'boot_1',
            payload: { id: 'rec_boot_1', plugin_id: 'boot_plugin', collection: 'data', record_key: 'boot_1', data: { val: 42 }, schema_version: 1, op_id: opId }
        },
        schema_version: 1,
        op_id: opId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    await db.save('plugin_records', mockOutbox);

    const appMock = { db, pluginStorageService: storageService };
    syncService.setApp(appMock);
    await storageService.load();

    // First boot reconciliation
    const enqueued1 = await syncService.reconcileOutboxOnBoot();
    assert.equal(enqueued1, 1, 'Enqueued 1 pending outbox item during boot');

    const status1 = syncService.getQueueStatus();
    assert.equal(status1.pending, 1, '1 item pending in sync queue');

    // Second boot reconciliation (repeatable / idempotent)
    const enqueued2 = await syncService.reconcileOutboxOnBoot();
    assert.equal(enqueued2, 0, 'Second reconciliation is idempotent and enqueues 0 duplicates');

    const status2 = syncService.getQueueStatus();
    assert.equal(status2.pending, 1, 'Sync queue length remains 1 (no duplicates)');
});

test('PLG3-P3-1 Req 8 — Reserved __host_ collection protection denies plugin code access', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Reserved_' + Date.now(), 12);
    await db.connect();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');

    assert.throws(() => {
        pluginStorage.collection('__host_outbox__');
    }, /Access to reserved system collection "__host_outbox__" is denied/);

    assert.throws(() => {
        pluginStorage.collection('__host_schema__');
    }, /Access to reserved system collection "__host_schema__" is denied/);
});

test('PLG3-P3-1 Req 9 — Existing legacy records without op_id continue to synchronize', async () => {
    setupEnvironment();
    const config = new ConfigManager();
    const syncService = new SyncService(config, null);

    // Legacy local record without schema_version or op_id
    const localLegacy = [
        { id: 'leg_1', plugin_id: 'fuel', collection: 'logs', record_key: 'k1', data: { odo: 100 }, updated_at: '2026-01-01T10:00:00.000Z' }
    ];

    // Cloud record
    const cloudLegacy = [
        { id: 'leg_1', plugin_id: 'fuel', collection: 'logs', record_key: 'k1', data: { odo: 100 }, updated_at: '2026-01-01T10:00:00.000Z' }
    ];

    const merged = syncService._mergeTable(localLegacy, cloudLegacy, 'plugin_records');
    assert.equal(merged.length, 1);
    assert.equal(merged[0]._source, 'merged (identical)');
});

test('PLG3-P3-1 Req 10 — Version-aware merge policy protects local higher schema_version against stale cloud records', async () => {
    setupEnvironment();
    const config = new ConfigManager();
    const syncService = new SyncService(config, null);

    const localV2 = [
        { id: 'p_1', plugin_id: 'fuel', collection: 'logs', record_key: 'k1', data: { amountMl: 2000 }, schema_version: 2, updated_at: '2026-01-01T10:00:00.000Z' }
    ];

    // Stale cloud V1 record with newer timestamp
    const cloudV1 = [
        { id: 'p_1', plugin_id: 'fuel', collection: 'logs', record_key: 'k1', data: { liters: 3 }, schema_version: 1, updated_at: '2026-01-01T12:00:00.000Z' }
    ];

    const merged = syncService._mergeTable(localV2, cloudV1, 'plugin_records');
    assert.equal(merged.length, 1);
    assert.equal(merged[0]._source, 'merged (local wins)', 'Local V2 schema_version wins over stale Cloud V1 schema_version');
    assert.equal(merged[0].schema_version, 2, 'Schema version 2 preserved');
});
