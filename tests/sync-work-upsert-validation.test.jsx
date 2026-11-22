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

let online = true;
Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    get: () => online
});

function createSyncService() {
    localStorage.clear();
    const syncService = new SyncService(
        {
            useSupabase: true,
            supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
        },
        { getPendingCount: () => 0 }
    );
    syncService.cloud.client = {};
    return syncService;
}

function validLegacyWork(id) {
    return {
        id,
        name: `Work ${id}`,
        date: '2026-08-01',
        duration: 1,
        status: 'folyamatban'
    };
}

test('SyncService.push rejects invalid Work Log records before cloud or offline queue writes', async () => {
    online = true;
    const syncService = createSyncService();
    const cloudWrites = [];
    const offlineChanges = [];
    syncService.offline.addPendingChange = (...args) => offlineChanges.push(args);
    syncService.cloud.upsert = async (...args) => cloudWrites.push(args);
    const invalidWork = {
        ...validLegacyWork('invalid-work'),
        date: '2026-02-30'
    };

    await assert.rejects(
        syncService.push('works', invalidWork),
        /Work Log record invalid-work rejected/
    );
    assert.equal(cloudWrites.length, 0);
    assert.equal(syncService._syncQueue.length, 0);

    await assert.rejects(
        syncService.pushOnly('works', invalidWork),
        /Work Log record invalid-work rejected/
    );
    assert.equal(cloudWrites.length, 0);

    await syncService.pushOnly('works', validLegacyWork('valid-push-only'));
    assert.deepEqual(cloudWrites.map(([, data]) => data.id), ['valid-push-only']);

    online = false;
    await assert.rejects(
        syncService.push('works', invalidWork),
        /Work Log record invalid-work rejected/
    );
    await assert.rejects(
        syncService.pushOnly('works', invalidWork),
        /Work Log record invalid-work rejected/
    );
    assert.equal(offlineChanges.length, 0);
    assert.equal(syncService._syncQueue.length, 0);
    assert.equal(syncService.addToQueue('update', invalidWork, 'works'), null);
    assert.equal(syncService._syncQueue.length, 0);
});

test('SyncService.processQueue drops invalid Work Log upserts without blocking valid or non-Work-Log operations', async () => {
    const syncService = createSyncService();
    const upserts = [];
    const deletes = [];
    syncService.cloud.upsert = async (table, data) => upserts.push({ table, data });
    syncService.cloud.delete = async (...args) => deletes.push(args);
    syncService._syncQueue = [
        {
            id: 'invalid-work-op',
            operation: 'update',
            table: 'works',
            data: { ...validLegacyWork('invalid-work'), duration: -1 },
            customKey: 'id',
            status: 'pending',
            retryCount: 0
        },
        {
            id: 'valid-work-op',
            operation: 'update',
            table: 'works',
            data: validLegacyWork('valid-work'),
            customKey: 'id',
            status: 'pending',
            retryCount: 0
        },
        {
            id: 'valid-item-op',
            operation: 'update',
            table: 'items',
            data: { id: 'item-1', name: 'Item' },
            customKey: 'id',
            status: 'pending',
            retryCount: 0
        },
        {
            id: 'work-delete-op',
            operation: 'delete',
            table: 'works',
            data: { id: 'deleted-work' },
            customKey: 'id',
            status: 'pending',
            retryCount: 0
        }
    ];

    const result = await syncService.processQueue();

    assert.deepEqual(result, { processed: 4, succeeded: 3, failed: 1, pending: 0 });
    assert.deepEqual(
        upserts.map(({ table, data }) => [table, data.id]),
        [['works', 'valid-work'], ['items', 'item-1']]
    );
    assert.deepEqual(deletes, [['works', { id: 'deleted-work' }, 'id']]);
    assert.equal(syncService._syncQueue.length, 0);
});
