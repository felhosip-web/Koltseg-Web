import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { SyncManager } from '../js/sync-manager.js';
import { UIController } from '../js/ui-controller.js';

function installSyncModalDom() {
    const dom = new JSDOM(`
        <div id="syncModal" class="hidden">
            <span id="syncLed"></span>
            <span id="syncStatusText"></span>
            <button id="btnCheckSync"></button>
            <div id="syncDiffContainer" class="hidden"></div>
            <div id="localDiffList"></div>
            <div id="cloudDiffList"></div>
            <div id="pendingChangesContainer" class="hidden"><div id="pendingChangesList"></div></div>
            <button id="btnExecuteSync" disabled></button>
            <button id="btnCloseSyncModal"></button>
            <button id="btnCancelSync"></button>
        </div>
    `);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    return dom;
}

test('getSyncDiff skips tables whose cloud data is unavailable', async () => {
    const app = {
        syncService: {
            cloud: {
                pull: async table => {
                    if (table === 'items') throw new Error('offline');
                    return [{ id: 'cloud-entry', updated_at: '2026-01-01T00:00:00Z' }];
                }
            },
            _getLocalData: table => table === 'items'
                ? [{ id: 'local-item', updated_at: '2026-01-01T00:00:00Z' }]
                : [],
            _isRecordDifferent: () => false
        },
        db: { getAll: async () => [] }
    };
    const manager = new SyncManager(app);
    manager.tables = ['items', 'entries'];

    const result = await manager.getSyncDiff();

    assert.deepEqual(result.unavailableTables, ['items']);
    assert.deepEqual(result.local, []);
    assert.deepEqual(result.cloud, [
        { table: 'entries', key: 'cloud-entry', label: 'cloud-entry', type: 'new' }
    ]);
});

test('queue modal renders pending entries and dispatches execution by mode', async () => {
    const dom = installSyncModalDom();
    let processQueueCalls = 0;
    let syncCalls = 0;
    const app = {
        syncService: {
            getQueueStatus: () => ({
                total: 1,
                pending: 1,
                failed: 0,
                items: [{ id: 'queue-1', table: 'items', operation: 'upsert', status: 'pending', timestamp: 0, retryCount: 0, data: { id: 'item-1' } }]
            })
        },
        syncManager: {
            processQueue: async () => {
                processQueueCalls++;
                return { status: 'error', message: 'queue failed' };
            },
            sync: async () => {
                syncCalls++;
                return { status: 'ok' };
            },
            hasPendingChanges: () => false,
            getPendingDetails: () => ({})
        },
        hmiNotif: { showToast: () => {} }
    };
    const controller = Object.create(UIController.prototype);
    controller.app = app;
    controller._updateSyncQueueBadge = () => {};

    controller._handleQueueClick();

    const executeBtn = document.getElementById('btnExecuteSync');
    assert.equal(document.getElementById('pendingChangesContainer').classList.contains('hidden'), false);
    assert.match(document.getElementById('pendingChangesList').textContent, /items \(1\)/);
    assert.equal(executeBtn.dataset.mode, 'queue');
    assert.equal(executeBtn.disabled, false);

    executeBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(processQueueCalls, 1);
    assert.equal(syncCalls, 0);
    assert.equal(executeBtn.disabled, false);
    assert.match(document.getElementById('syncStatusText').textContent, /Hiba/);

    dom.window.close();
});

test('sync execution stays disabled when any cloud table is unavailable', async () => {
    const dom = installSyncModalDom();
    const controller = Object.create(UIController.prototype);
    controller.app = {
        syncManager: {
            getSyncDiff: async () => ({
                local: [{ table: 'entries', key: 'entry-1', label: 'Entry', type: 'new' }],
                cloud: [],
                unavailableTables: ['items']
            }),
            hasPendingChanges: () => false,
            getPendingDetails: () => ({})
        }
    };

    controller.openSyncModal();
    document.getElementById('btnCheckSync').click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(document.getElementById('btnExecuteSync').disabled, true);
    assert.match(document.getElementById('syncStatusText').textContent, /Hiba/);
    assert.match(document.getElementById('cloudDiffList').textContent, /items/);

    dom.window.close();
});
