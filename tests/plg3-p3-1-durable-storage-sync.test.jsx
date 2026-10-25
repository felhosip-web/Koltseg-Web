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

test('PLG3-P3-1 Req 4 — Delete outbox entry targets user record target_id (Finding 1 Fix)', async () => {
    setupEnvironment();
    const db = new Database('TestDB_DeleteTarget_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const col = pluginStorage.collection('notes');

    await col.set('note_1', { title: 'To Delete' });

    const rawData = storageService.getAllRecords().find(r => r.collection === 'notes');
    const userRecordId = rawData.id;

    // Delete record
    await col.delete('note_1');

    const outboxRec = storageService.getHostOutboxRecords().find(r => r.data.op === 'delete');
    assert.ok(outboxRec, 'Delete outbox record created');
    assert.equal(outboxRec.data.target_id, userRecordId, 'Delete outbox record data.target_id MUST match user record ID');
    assert.notEqual(outboxRec.data.target_id, outboxRec.id, 'Delete outbox target_id MUST NOT be internal outbox ID');
});

test('PLG3-P3-1 Req 5 — Delete ACK removes exact corresponding outbox operation (Finding 3 Fix)', async () => {
    setupEnvironment();
    const db = new Database('TestDB_DeleteACK_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const pluginStorage = storageService.createPluginStorage('my_plugin');
    const col = pluginStorage.collection('items');

    await col.set('item_1', { name: 'Item 1' });
    const userRec = storageService.getAllRecords().find(r => r.collection === 'items');
    await col.delete('item_1');

    const deleteOutbox = storageService.getHostOutboxRecords().find(r => r.data.op === 'delete');
    assert.ok(deleteOutbox, 'Delete outbox present');
    const deleteOpId = deleteOutbox.op_id;

    // Execute exact ACK removal
    const removed = await storageService.removeHostOutboxRecord(deleteOpId);
    assert.equal(removed, true, 'Delete outbox operation removed on exact ACK');

    const remaining = storageService.getHostOutboxRecords().filter(r => r.op_id === deleteOpId);
    assert.equal(remaining.length, 0, 'Acknowledged delete outbox operation removed');
});

test('PLG3-P3-1 Req 6 — Operation identity (op_id) reconciliation & safe coalescing (Finding 2 Fix)', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Identity_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);

    const targetId = generateUUID();
    const opId1 = generateUUID();
    const opId2 = generateUUID();

    // Outbox 1 (Older mutation)
    const outbox1 = {
        id: 'a_outbox_1',
        plugin_id: 'test_plugin',
        collection: '__host_outbox__',
        record_key: targetId,
        data: {
            op: 'update',
            op_id: opId1,
            target_id: targetId,
            payload: { id: targetId, plugin_id: 'test_plugin', collection: 'data', record_key: 'key1', data: { v: 1 }, schema_version: 1, op_id: opId1 }
        },
        schema_version: 1,
        op_id: opId1,
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-01T10:00:00.000Z'
    };

    // Outbox 2 (Newer mutation for same target ID)
    const outbox2 = {
        id: 'z_outbox_2',
        plugin_id: 'test_plugin',
        collection: '__host_outbox__',
        record_key: targetId,
        data: {
            op: 'update',
            op_id: opId2,
            target_id: targetId,
            payload: { id: targetId, plugin_id: 'test_plugin', collection: 'data', record_key: 'key1', data: { v: 2 }, schema_version: 1, op_id: opId2 }
        },
        schema_version: 1,
        op_id: opId2,
        created_at: '2026-01-01T11:00:00.000Z',
        updated_at: '2026-01-01T11:00:00.000Z'
    };

    await db.save('plugin_records', outbox1);
    await db.save('plugin_records', outbox2);

    const mockApp = { db, pluginStorageService: storageService };
    syncService.setApp(mockApp);
    await storageService.load();

    // Reconcile on boot
    await syncService.reconcileOutboxOnBoot();

    const queueStatus = syncService.getQueueStatus();
    assert.equal(queueStatus.total, 1, 'Coalesced to exactly 1 queue item for target record ID');
    assert.equal(queueStatus.items[0].data.op_id, opId2, 'Coalesced queue item has newer operation op_id2');
    assert.equal(queueStatus.items[0].data.data.v, 2, 'Coalesced queue item contains newer payload data (v=2)');
});

test('PLG3-P3-1 Req 7 — Newer pending operation survives an older operation ACK', async () => {
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

test('PLG3-P3-1 Req 8 — Corrupt or invalid outbox entries are handled safely without crashing', async () => {
    setupEnvironment();
    const db = new Database('TestDB_Corrupt_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    const syncService = new SyncService(config, null);
    const storageService = new PluginStorageService(db, syncService);

    // Corrupt outbox entry missing op_id
    const corrupt1 = {
        id: generateUUID(),
        plugin_id: 'p1',
        collection: '__host_outbox__',
        record_key: 'r1',
        data: { op: 'update' }
    };

    // Corrupt delete outbox entry missing target_id
    const corrupt2 = {
        id: generateUUID(),
        plugin_id: 'p1',
        collection: '__host_outbox__',
        record_key: 'r2',
        op_id: generateUUID(),
        data: { op: 'delete', op_id: generateUUID() }
    };

    await db.save('plugin_records', corrupt1);
    await db.save('plugin_records', corrupt2);

    const mockApp = { db, pluginStorageService: storageService };
    syncService.setApp(mockApp);
    await storageService.load();

    const reconciled = await syncService.reconcileOutboxOnBoot();
    assert.equal(reconciled, 0, 'Corrupt entries safely skipped without enqueuing or crashing');
});

test('PLG3-P3-1 Req 9 — Reserved __host_ collection protection denies plugin code access', async () => {
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

test('PLG3-P3-1 Req 10 — Existing legacy records without op_id continue to synchronize', async () => {
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

test('PLG3-P3-1 Req 11 — Version-aware merge policy protects local higher schema_version against stale cloud records', async () => {
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
