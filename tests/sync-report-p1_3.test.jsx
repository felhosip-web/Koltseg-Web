import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { SyncReport } from '../js/sync-report.js';
import { LogManager } from '../js/log-manager.js';
import { DataSyncController } from '../js/data-sync-controller.js';
import { UIModalController } from '../js/ui-modal-controller.js';

// Setup DOM environment
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="hmiToastContainer"></div></body></html>`, {
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
    const logger = new LogManager();
    const hmiNotif = new UIModalController();

    const app = {
        db,
        logger,
        hmiNotif,
        config: {
            useSupabase: true,
            supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
        },
        items: { items: initialData.items || [] },
        months: { months: initialData.months || [] },
        entries: { entries: initialData.entries || [] },
        templates: { templates: initialData.templates || [] },
        reminderManager: { reminders: initialData.reminders || [] },
        incomingManager: { incomings: initialData.incomings || [], senders: initialData.senders || [] },
        workLogManager: { works: initialData.works || [] },
        refreshAllTabs: () => {},
        renderer: { updateFooterStatus: () => {} }
    };

    return app;
}

test('SyncReport — Successful sync produces success status, updated checkpoint and concise Event Log summary', async () => {
    localStorage.clear();
    const oldCheckpoint = new Date('2026-09-24T10:00:00.000Z');
    localStorage.setItem('hmi_lastSyncTime', oldCheckpoint.toISOString());

    const rawResults = {
        status: 'success',
        startTime: '2026-09-24T10:42:13.000Z',
        endTime: '2026-09-24T10:42:16.200Z',
        duration: '3.2s',
        tables: {
            items: { pulled: 124, merged: 125, pushed: 3 },
            months: { pulled: 12, merged: 12, pushed: 0 },
            entries: { pulled: 86, merged: 87, pushed: 2 },
            works: { pulled: 31, merged: 31, pushed: 0 }
        },
        queueProcessed: 4,
        errors: []
    };

    const mockSyncService = {
        lastSyncTime: new Date('2026-09-24T10:42:16.200Z'),
        lastSyncConflicts: [],
        getQueueStatus: () => ({ processed: 4, success: 4, failed: 0, pending: 0 })
    };

    const report = SyncReport.fromResults(rawResults, mockSyncService);

    assert.equal(report.status, 'success');
    assert.equal(report.checkpointStatus, 'updated');
    assert.equal(report.errors.length, 0);
    assert.equal(report.duration, '3.2 s');

    const logSummary = report.toEventLogSummary();
    assert.ok(logSummary.includes('SYNC'));
    assert.ok(logSummary.includes('Szinkronizáció sikeres'));
    assert.ok(logSummary.includes('3.2 s'));
    assert.ok(logSummary.includes('Queue: 4 feldolgozva'));

    const modalData = report.toModalData();
    assert.equal(modalData.status, 'success');
    assert.equal(modalData.statusBadgeText, '✓ Sikeres');
    assert.equal(modalData.checkpointStatus, 'updated');
});

test('SyncReport — Partial sync produces partial status, unchanged checkpoint and records failed tables', async () => {
    localStorage.clear();
    const preservedCheckpoint = new Date('2026-09-24T10:31:02.000Z');

    const rawResults = {
        status: 'success',
        startTime: '2026-09-24T10:45:00.000Z',
        endTime: '2026-09-24T10:45:04.100Z',
        duration: '4.1s',
        tables: {
            items: { pulled: 10, merged: 10, pushed: 0 },
            entries: { pulled: 0, error: 'Pull failed for entries' }
        },
        queueProcessed: 3,
        errors: [
            { table: 'entries', operation: 'pull', error: 'Pull failed for entries' }
        ]
    };

    const mockSyncService = {
        lastSyncTime: preservedCheckpoint,
        lastSyncConflicts: [],
        getQueueStatus: () => ({ processed: 3, success: 3, failed: 1, pending: 0 })
    };

    const report = SyncReport.fromResults(rawResults, mockSyncService);

    assert.equal(report.status, 'partial');
    assert.equal(report.checkpointStatus, 'unchanged');
    assert.ok(report.failedTables.includes('entries'));
    assert.equal(report.errors.length, 1);

    const logSummary = report.toEventLogSummary();
    assert.ok(logSummary.includes('SYNC'));
    assert.ok(logSummary.includes('Részleges szinkronizáció'));
    assert.ok(logSummary.includes('Pull hiba: entries'));
    assert.ok(logSummary.includes('Checkpoint: nem frissült'));

    const modalData = report.toModalData();
    assert.equal(modalData.status, 'partial');
    assert.equal(modalData.statusBadgeText, '⚠ RÉSZLEGES SZINKRONIZÁCIÓ');
    assert.equal(modalData.checkpointStatus, 'unchanged');
});

test('SyncReport — Critical sync failure captures exception, unchanged checkpoint and creates error report', async () => {
    const preservedCheckpoint = new Date('2026-09-24T09:00:00.000Z');
    const mockSyncService = {
        lastSyncTime: preservedCheckpoint
    };

    const err = new Error('Supabase network connection completely dropped');
    const startTime = '2026-09-24T11:00:00.000Z';

    const report = SyncReport.fromCriticalError(err, startTime, mockSyncService);

    assert.equal(report.status, 'critical');
    assert.equal(report.checkpointStatus, 'unchanged');
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].error, 'Supabase network connection completely dropped');

    const logSummary = report.toEventLogSummary();
    assert.ok(logSummary.includes('SYNC'));
    assert.ok(logSummary.includes('Szinkronizáció megszakadt'));
    assert.ok(logSummary.includes('Hiba: Supabase network connection completely dropped'));
    assert.ok(logSummary.includes('Checkpoint: nem frissült'));

    const modalData = report.toModalData();
    assert.equal(modalData.status, 'critical');
    assert.equal(modalData.statusBadgeText, '✕ SZINKRONIZÁCIÓ MEGSZAKADT');
    assert.equal(modalData.checkpointStatus, 'unchanged');
});

test('Integration — Background sync generates SyncReport and logs summary without popup modals', async () => {
    localStorage.clear();
    const db = new Database();
    db._enableMockDb();

    const app = createMockApp(db);
    const syncService = new SyncService(app.config, { getPendingCount: () => 0 });
    syncService.setApp(app);

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    let modalPoppedUp = false;
    app.hmiNotif.showSyncReportModal = () => {
        modalPoppedUp = true;
    };

    // Background sync call
    const result = await syncService.sync();

    // Verify report created & stored
    assert.ok(syncService.getLastReport() instanceof SyncReport);
    assert.equal(syncService.getLastReport().status, 'success');
    assert.equal(modalPoppedUp, false, 'Background sync must NOT open popup modal');

    // Verify Event Log entry written
    const logs = app.logger.getLogs();
    assert.ok(logs.some(l => l.category === 'sync' && l.message.includes('Szinkronizáció sikeres')));
});

test('Integration — DataSyncController.forceSync triggers Sync Result modal and reports diagnostics', async () => {
    localStorage.clear();
    const db = new Database();
    db._enableMockDb();

    const app = createMockApp(db);
    const syncService = new SyncService(app.config, { getPendingCount: () => 0 });
    syncService.setApp(app);
    app.syncService = syncService;

    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => ({ data: [], error: null }),
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    let shownModalReport = null;
    app.hmiNotif.showSyncReportModal = (report) => {
        shownModalReport = report;
    };

    const controller = new DataSyncController(app);
    await controller.forceSync();

    assert.ok(shownModalReport !== null, 'forceSync must show Sync Result modal');
    assert.equal(shownModalReport.status, 'success');
    assert.equal(shownModalReport.checkpointStatus, 'updated');
});
