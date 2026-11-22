import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { SyncService } from '../js/sync-service.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/'
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true
});
Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    get: () => true
});

const T1 = '2026-11-22T10:00:00.000Z';
const T2 = '2026-11-22T11:00:00.000Z';
const T3 = '2026-11-22T12:00:00.000Z';
const SYNC_TABLES = [
    'items', 'months', 'entries', 'templates', 'reminders', 'incomings',
    'incoming_senders', 'works', 'plugin_records', 'deleted_records'
];

function clone(value) {
    return structuredClone(value);
}

function createHarness(initialCloudData = {}) {
    localStorage.clear();
    localStorage.setItem('settings_updated_at', T1);

    const localTables = new Map();
    const db = {
        async getAll(table) {
            return clone(localTables.get(table) || []);
        },
        async save(table, record) {
            const rows = localTables.get(table) || [];
            const keyField = table === 'months' ? 'month' : 'id';
            const index = rows.findIndex(row => String(row[keyField]) === String(record[keyField]));
            if (index === -1) rows.push(clone(record));
            else rows[index] = clone(record);
            localTables.set(table, rows);
        },
        async _directDelete(table, key) {
            const keyField = table === 'months' ? 'month' : 'id';
            localTables.set(
                table,
                (localTables.get(table) || []).filter(row => String(row[keyField]) !== String(key))
            );
        }
    };

    const cloudTables = Object.fromEntries(SYNC_TABLES.map(table => [table, clone(initialCloudData[table] || [])]));
    cloudTables.app_settings = [{
        id: 'user_settings',
        settings_json: {},
        updated_at: T1
    }];
    const cloudDeletes = [];
    const cloud = {
        client: {},
        async pull(table) {
            return clone(cloudTables[table] || []);
        },
        async upsert(table, data) {
            const rows = cloudTables[table] || [];
            const keyField = table === 'months' ? 'month' : 'id';
            const index = rows.findIndex(row => String(row[keyField]) === String(data[keyField]));
            if (index === -1) rows.push(clone(data));
            else rows[index] = clone(data);
            cloudTables[table] = rows;
        },
        async delete(table, data, customKey = 'id') {
            const keyField = customKey || 'id';
            const key = data[keyField] ?? data.id ?? data.month;
            cloudDeletes.push({ table, keyField, key });
            cloudTables[table] = (cloudTables[table] || [])
                .filter(row => String(row[keyField]) !== String(key));
        }
    };

    const manager = (table, property) => ({
        [property]: [],
        async load() {
            this[property] = await db.getAll(table);
        }
    });
    const app = {
        db,
        items: manager('items', 'items'),
        months: {
            months: [],
            async load() {
                this.months = (await db.getAll('months')).map(row => row.month);
            }
        },
        entries: manager('entries', 'entries'),
        templates: manager('templates', 'templates'),
        reminderManager: manager('reminders', 'reminders'),
        incomingManager: {
            incomings: [],
            senders: [],
            async load() {
                this.incomings = await db.getAll('incomings');
                this.senders = await db.getAll('incoming_senders');
            }
        },
        workLogManager: manager('works', 'works'),
        pluginStorageService: {
            async load() {},
            getAllRecords: () => localTables.get('plugin_records') || []
        }
    };

    const syncService = new SyncService(
        { useSupabase: true, supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' } },
        { getPendingCount: () => 0 }
    );
    syncService.cloud = cloud;
    syncService.setApp(app);

    return { syncService, db, cloudTables, cloudDeletes };
}

function tombstone(table, recordId, deletedAt, id = `tombstone-${recordId}`) {
    return { id, table_name: table, record_id: recordId, deleted_at: deletedAt };
}

function workRecord(id, updatedAt) {
    return {
        id,
        name: `Work ${id}`,
        date: '2026-11-22',
        duration: 1,
        status: 'folyamatban',
        updated_at: updatedAt
    };
}

test('older tombstone preserves a newer Work Log record without local or queued deletion', async () => {
    const { syncService, db, cloudDeletes } = createHarness({
        works: [workRecord('work-newer', T2)],
        deleted_records: [tombstone('works', 'work-newer', T1)]
    });

    const firstSync = await syncService.sync();
    assert.equal(firstSync.status, 'success');
    assert.deepEqual((await db.getAll('works')).map(record => record.id), ['work-newer']);
    assert.equal(syncService._syncQueue.some(item => item.operation === 'delete' && item.table === 'works'), false);
    assert.equal(cloudDeletes.some(item => item.table === 'works' && item.key === 'work-newer'), false);

    const secondSync = await syncService.sync();
    assert.equal(secondSync.status, 'success');
    assert.deepEqual((await db.getAll('works')).map(record => record.id), ['work-newer']);
    assert.equal(syncService._syncQueue.some(item => item.operation === 'delete' && item.table === 'works'), false);
    assert.equal(cloudDeletes.some(item => item.table === 'works' && item.key === 'work-newer'), false);
});

test('newer tombstone deletes an older record through the existing queue flow', async () => {
    const { syncService, db, cloudDeletes } = createHarness({
        items: [{ id: 'item-old', name: 'Old', updated_at: T1 }],
        deleted_records: [tombstone('items', 'item-old', T2)]
    });

    const result = await syncService.sync();

    assert.equal(result.status, 'success');
    assert.deepEqual(await db.getAll('items'), []);
    assert.equal(cloudDeletes.length, 1);
    assert.deepEqual(cloudDeletes[0], { table: 'items', keyField: 'id', key: 'item-old' });
});

test('equal record and tombstone timestamps apply the tombstone', async () => {
    const { syncService, db, cloudDeletes } = createHarness({
        items: [{ id: 'item-equal', name: 'Equal', updated_at: T2 }],
        deleted_records: [tombstone('items', 'item-equal', T2)]
    });

    const result = await syncService.sync();

    assert.equal(result.status, 'success');
    assert.deepEqual(await db.getAll('items'), []);
    assert.equal(cloudDeletes.length, 1);
    assert.equal(cloudDeletes[0].key, 'item-equal');
});

test('multiple tombstones are compared with their matching record IDs only', async () => {
    const { syncService, db, cloudDeletes } = createHarness({
        months: [{ month: '2026-11', updated_at: T3 }],
        items: [
            { id: 'keep-newer', name: 'Keep', updated_at: T3 },
            { id: 'delete-older', name: 'Delete', updated_at: T1 },
            { id: 'delete-equal', name: 'Delete too', updated_at: T2 }
        ],
        deleted_records: [
            tombstone('months', '2026-11', T2),
            tombstone('items', 'keep-newer', T2),
            tombstone('items', 'delete-older', T2),
            tombstone('items', 'delete-equal', T2)
        ]
    });

    const result = await syncService.sync();

    assert.equal(result.status, 'success');
    assert.deepEqual((await db.getAll('items')).map(record => record.id), ['keep-newer']);
    assert.deepEqual(await db.getAll('months'), [{ month: '2026-11', updated_at: T3 }]);
    assert.deepEqual(cloudDeletes.map(item => item.key).sort(), ['delete-equal', 'delete-older']);
});

test('missing, null, or invalid timestamps retain the existing tombstone behavior', async () => {
    const { syncService, db, cloudDeletes } = createHarness({
        items: [
            { id: 'item-missing', name: 'Missing timestamp' },
            { id: 'item-null', name: 'Null timestamp', updated_at: null },
            { id: 'item-invalid', name: 'Invalid timestamp', updated_at: 'not-a-timestamp' }
        ],
        deleted_records: [
            tombstone('items', 'item-missing', T2),
            tombstone('items', 'item-null', T2),
            tombstone('items', 'item-invalid', T2)
        ]
    });

    const result = await syncService.sync();

    assert.equal(result.status, 'success');
    assert.deepEqual(await db.getAll('items'), []);
    assert.deepEqual(cloudDeletes.map(item => item.key).sort(), ['item-invalid', 'item-missing', 'item-null']);
});

test('a queued tombstone delete is discarded if a newer record appears before retry', async () => {
    const { syncService, db, cloudTables } = createHarness({
        items: [{ id: 'item-recreated', name: 'Old version', updated_at: T1 }],
        deleted_records: [tombstone('items', 'item-recreated', T2)]
    });
    const deleteCloudRecord = syncService.cloud.delete.bind(syncService.cloud);
    let deleteAttempts = 0;
    syncService.cloud.delete = async (...args) => {
        deleteAttempts++;
        if (deleteAttempts === 1) throw new Error('temporary network failure');
        return deleteCloudRecord(...args);
    };

    const failedAttempt = await syncService.sync();
    assert.equal(failedAttempt.queueFailed, 1);
    assert.equal(syncService._syncQueue.length, 1);
    assert.equal(syncService._syncQueue[0].tombstoneDeletedAt, T2);

    cloudTables.items[0].updated_at = T3;
    const retrySync = await syncService.sync();

    assert.equal(retrySync.status, 'success');
    assert.equal(deleteAttempts, 1);
    assert.deepEqual((await db.getAll('items')).map(record => record.id), ['item-recreated']);
    assert.equal(syncService._syncQueue.length, 0);
});
