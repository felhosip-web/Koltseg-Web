import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { SyncService } from '../js/sync-service.js';
import { Database } from '../js/oop-core.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

function createService(useSupabase = false) {
    localStorage.clear();
    return new SyncService({ useSupabase, supabaseConfig: { url: '', key: '' } }, { getPendingCount: () => 0 });
}

function createMockDb() {
    const db = new Database();
    db._enableMockDb();
    return db;
}

test('restores interrupted queue items and migrates legacy month payloads without changing other tables', async () => {
    const savedQueue = [
        { id: 'legacy', table: 'months', operation: 'update', data: { id: '2026-08', label: 'August' }, customKey: 'id', status: 'processing' },
        { id: 'string', table: 'months', operation: 'delete', data: '2026-09', customKey: 'id', status: 'pending' },
        { id: 'both', table: 'months', operation: 'update', data: { id: 'obsolete', month: '2026-10' }, customKey: 'id', status: 'pending' },
        { id: 'missing', table: 'months', operation: 'delete', data: null, customKey: 'id', status: 'failed' },
        { id: 'other', table: 'items', operation: 'update', data: { id: 'item1' }, customKey: 'id', status: 'processing' }
    ];
    localStorage.clear();
    localStorage.setItem('hmi_syncQueue', JSON.stringify(savedQueue));

    const service = new SyncService({ useSupabase: false }, { getPendingCount: () => 0 });
    const [legacy, string, both, missing, other] = service._syncQueue;
    assert.deepEqual(legacy, { ...savedQueue[0], data: { month: '2026-08', label: 'August' }, customKey: 'month', status: 'pending' });
    assert.deepEqual(string, { ...savedQueue[1], data: { month: '2026-09' }, customKey: 'month' });
    assert.deepEqual(both, { ...savedQueue[2], data: { month: '2026-10' }, customKey: 'month' });
    assert.deepEqual(missing, { ...savedQueue[3], customKey: 'month' });
    assert.deepEqual(other, { ...savedQueue[4], status: 'pending' });
    assert.deepEqual(JSON.parse(localStorage.getItem('hmi_syncQueue')), service._syncQueue);

    const calls = [];
    service.cloud = {
        client: {},
        upsert: async (...args) => calls.push(['upsert', ...args]),
        delete: async (...args) => calls.push(['delete', ...args])
    };
    assert.deepEqual(await service._executeQueueItem(legacy), { success: true });
    assert.deepEqual(await service._executeQueueItem(string), { success: true });
    assert.deepEqual(calls, [
        ['upsert', 'months', { month: '2026-08', label: 'August' }, 'month'],
        ['delete', 'months', { month: '2026-09' }, 'month']
    ]);
});

test('compares numeric equivalents but never coerces boolean or empty values', () => {
    const service = createService();
    const cases = [
        [true, 'true', true],
        [false, 'false', true],
        [true, 1, true],
        [0, false, true],
        [1000, ' 1000 ', false],
        ['001.50', 1.5, false],
        ['-2.50', '-2.5', false],
        [0, '', true],
        ['1e3', '1000', true],
        [1000, '1001', true],
        [null, undefined, false],
        [null, 0, true]
    ];
    for (const [local, cloud, expected] of cases) {
        assert.equal(service._isRecordDifferent({ value: local }, { value: cloud }), expected, `${String(local)} versus ${String(cloud)}`);
        assert.equal(service._isRecordDifferent({ value: cloud }, { value: local }), expected, `reverse: ${String(cloud)} versus ${String(local)}`);
    }
});

test('an empty or malformed merge does not remove local records from any table', async () => {
    const db = createMockDb();
    await db.save('items', { id: 'item1', name: 'Keep' });
    await db.save('months', { month: '2026-08' });
    const service = createService();
    service.setApp({ db });

    await service._saveMergedToLocal({ items: null, months: [], entries: undefined });
    await service._saveMergedToLocal({});
    await service._saveMergedToLocal(null);

    assert.deepEqual((await db.getAll('items')).map(item => item.id), ['item1']);
    assert.deepEqual((await db.getAll('months')).map(month => month.month), ['2026-08']);
});

test('a nonempty month merge purges by month key and saves records without sync metadata', async () => {
    const db = createMockDb();
    await db.save('months', { month: '2026-07' });
    await db.save('months', { month: '2026-08', label: 'Old' });
    await db.save('items', { id: 'item1', name: 'Untouched' });
    const service = createService();
    service.setApp({ db });

    await service._saveMergedToLocal({ months: [{ month: '2026-08', label: 'New', _source: 'cloud', _updated_at: 'internal' }] });

    const months = await db.getAll('months');
    assert.equal(months.length, 1);
    assert.equal(months[0].month, '2026-08');
    assert.equal(months[0].label, 'New');
    assert.match(months[0].updated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal('_source' in months[0], false);
    assert.equal('_updated_at' in months[0], false);
    assert.deepEqual((await db.getAll('items')).map(item => item.id), ['item1']);
});

test('sync queues tombstone deletes with high priority, deduplicates, and does not delete from cloud immediately', async (context) => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    context.after(() => {
        if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
        else delete globalThis.navigator;
    });

    const db = createMockDb();
    await db.save('items', { id: 'item1', name: 'Delete' });
    await db.save('items', { id: 'item2', name: 'Keep' });
    await db.save('months', { month: '2026-08' });
    const service = createService(true);
    service.setApp({ db });
    const queuedUpdate = service.addToQueue('update', { id: 'item1', name: 'Old' }, 'items');
    service.updateQueueItem(queuedUpdate.id, { status: 'failed', retryCount: 2 });
    const calls = [];
    service.cloud = {
        client: {},
        pull: async () => [],
        upsert: async (...args) => calls.push(['upsert', ...args]),
        delete: async (...args) => calls.push(['delete', ...args])
    };
    service.processQueue = async () => ({ processed: 0, failed: 0 });
    service.pull = async (table) => table === 'deleted_records' ? [
        { id: 't1', table_name: 'items', record_id: 'item1' },
        { id: 't2', table_name: 'months', record_id: '2026-08' },
        { id: 't3', table_name: 'items', record_id: 'item1' },
        { id: 't4', table_name: 'deleted_records', record_id: 't1' },
        { id: 't5', table_name: '', record_id: 'item2' }
    ] : [];
    service._mergeTable = (local, cloud) => cloud;
    service._reloadAndRender = async () => {};

    const result = await service.sync();

    assert.equal(result.status, 'success');
    assert.equal(service._syncQueue.length, 2);
    assert.deepEqual(service._syncQueue.map(({ operation, table, data, priority, customKey }) => ({ operation, table, data, priority, customKey })), [
        { operation: 'delete', table: 'months', data: { month: '2026-08' }, priority: 'high', customKey: 'month' },
        { operation: 'delete', table: 'items', data: { id: 'item1' }, priority: 'high', customKey: 'id' }
    ]);
    assert.equal(service._syncQueue[1].id, queuedUpdate.id);
    assert.equal(service._syncQueue[1].retryCount, 0);
    assert.equal(service._syncQueue[1].status, 'pending');
    assert.equal(calls.some(([operation]) => operation === 'delete'), false);
    assert.deepEqual((await db.getAll('items')).map(item => item.id), ['item2']);
    assert.equal((await db.getAll('months')).length, 0);
    assert.deepEqual(JSON.parse(localStorage.getItem('hmi_syncQueue')), service._syncQueue);

    assert.deepEqual(await service._executeQueueItem(service._syncQueue[0]), { success: true });
    assert.deepEqual(calls.at(-1), ['delete', 'months', { month: '2026-08' }, 'month']);
});
