import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { IDBKeyRange } from 'fake-indexeddb';

import {
    validateWorkRecord,
    validateWorkDuration,
    isValidCalendarDate,
    MAX_WORK_DURATION,
    VALID_WORK_STATUSES
} from '../js/utils/work-validation.js';
import { WorkLogManager } from '../js/work-log.js';
import { BackupManager } from '../js/backup-manager.js';
import { DataExportController } from '../js/data-export-controller.js';
import { Database } from '../js/oop-core.js';
import { App } from '../js/app.js';

test('P2-1: Centralized validator accepts valid Work Log records and enforces boundary contracts', () => {
    // 1. Valid record with minimal required fields
    const validMinimal = {
        name: 'Festés előkészítés',
        date: '2026-11-15',
        duration: 3
    };
    const resMin = validateWorkRecord(validMinimal);
    assert.equal(resMin.valid, true);
    assert.equal(resMin.sanitizedRecord.name, 'Festés előkészítés');
    assert.equal(resMin.sanitizedRecord.duration, 3);
    assert.equal(resMin.sanitizedRecord.status, 'folyamatban'); // default status
    assert.equal(resMin.sanitizedRecord.description, '');
    assert.equal(resMin.sanitizedRecord.location, '');

    // 2. Valid record with all fields
    const validFull = {
        id: 'work-12345',
        name: ' Tetőszerkezet javítása  ',
        date: '2026-06-30',
        duration: 14,
        status: 'elvégzett',
        description: '  Gerendák cseréje és lécezés ',
        location: ' Budapest, II. kerület ',
        created_at: '2026-06-01T08:00:00Z',
        updated_at: '2026-06-02T10:30:00Z'
    };
    const resFull = validateWorkRecord(validFull);
    assert.equal(resFull.valid, true);
    assert.equal(resFull.sanitizedRecord.name, 'Tetőszerkezet javítása');
    assert.equal(resFull.sanitizedRecord.description, 'Gerendák cseréje és lécezés');
    assert.equal(resFull.sanitizedRecord.location, 'Budapest, II. kerület');
    assert.equal(resFull.sanitizedRecord.status, 'elvégzett');

    // 3. Complete-record mode checks
    assert.equal(validateWorkRecord(validFull, { requireComplete: true }).valid, true);
    // Missing ID in complete-record mode
    assert.equal(validateWorkRecord({ name: 'Work', date: '2026-11-15', duration: 1, status: 'folyamatban' }, { requireComplete: true }).valid, false);
    // Missing date in complete-record mode
    assert.equal(validateWorkRecord({ id: 'w1', name: 'Work', duration: 1, status: 'folyamatban' }, { requireComplete: true }).valid, false);
    // Null date in complete-record mode
    assert.equal(validateWorkRecord({ id: 'w1', name: 'Work', date: null, duration: 1, status: 'folyamatban' }, { requireComplete: true }).valid, false);
    // Missing duration in complete-record mode
    assert.equal(validateWorkRecord({ id: 'w1', name: 'Work', date: '2026-11-15', status: 'folyamatban' }, { requireComplete: true }).valid, false);
    // Null duration in complete-record mode
    assert.equal(validateWorkRecord({ id: 'w1', name: 'Work', date: '2026-11-15', duration: null, status: 'folyamatban' }, { requireComplete: true }).valid, false);

    // 4. Name validation
    assert.equal(validateWorkRecord({ date: '2026-11-15', duration: 1 }).valid, false);
    assert.equal(validateWorkRecord({ name: '   ', date: '2026-11-15', duration: 1 }).valid, false);
    assert.equal(validateWorkRecord({ name: 123, date: '2026-11-15', duration: 1 }).valid, false);

    // 5. Date validation
    assert.equal(validateWorkRecord({ name: 'Próba', date: 'invalid', duration: 1 }).valid, false);
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-02-29', duration: 1 }).valid, false); // non-leap year
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-13-01', duration: 1 }).valid, false); // invalid month
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-04-31', duration: 1 }).valid, false); // 30-day month
    assert.equal(isValidCalendarDate('2024-02-29'), true); // leap year
    assert.equal(isValidCalendarDate('2026-11-09'), true);

    // 6. Status validation
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-11-15', duration: 1, status: 'unknown' }).valid, false);
    for (const st of VALID_WORK_STATUSES) {
        assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-11-15', duration: 1, status: st }).valid, true);
    }

    // 7. Prototype pollution protection
    const pollutedObj = JSON.parse('{"name":"Próba","date":"2026-11-15","duration":1,"__proto__":{"admin":true}}');
    assert.equal(validateWorkRecord(pollutedObj).valid, false);
});

test('P2-2: Duration validation strictly rejects non-numeric, empty, zero, negative, fractional, and excessive values', () => {
    // Empty & null & missing
    assert.equal(validateWorkDuration(undefined).valid, false);
    assert.equal(validateWorkDuration(null).valid, false);
    assert.equal(validateWorkDuration('').valid, false);
    assert.equal(validateWorkDuration('   ').valid, false);

    // Zero & negative
    assert.equal(validateWorkDuration(0).valid, false);
    assert.equal(validateWorkDuration(-1).valid, false);
    assert.equal(validateWorkDuration(-100).valid, false);

    // Fractional
    assert.equal(validateWorkDuration(1.5).valid, false);
    assert.equal(validateWorkDuration(0.1).valid, false);
    assert.equal(validateWorkDuration(2.99).valid, false);

    // Non-numeric & Special numbers
    assert.equal(validateWorkDuration(NaN).valid, false);
    assert.equal(validateWorkDuration(Infinity).valid, false);
    assert.equal(validateWorkDuration(-Infinity).valid, false);
    assert.equal(validateWorkDuration('három').valid, false);
    assert.equal(validateWorkDuration({}).valid, false);
    assert.equal(validateWorkDuration([]).valid, false);

    // Boundary: 1 to MAX_WORK_DURATION
    assert.equal(validateWorkDuration(1).valid, true);
    assert.equal(validateWorkDuration(MAX_WORK_DURATION).valid, true);
    assert.equal(validateWorkDuration(MAX_WORK_DURATION + 1).valid, false);
    assert.equal(validateWorkDuration(100000).valid, false);

    // allowNumericString option
    assert.equal(validateWorkDuration('5', { allowNumericString: true }).valid, true);
    assert.equal(validateWorkDuration('5', { allowNumericString: true }).value, 5);
    assert.equal(validateWorkDuration('0', { allowNumericString: true }).valid, false);
    assert.equal(validateWorkDuration('-2', { allowNumericString: true }).valid, false);
    assert.equal(validateWorkDuration('1.5', { allowNumericString: true }).valid, false);
    assert.equal(validateWorkDuration('abc', { allowNumericString: true }).valid, false);
});

test('P2-3: App.prototype.submitWorkForm rejects invalid duration without silent fallback to 1', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <div id="workEditorModal">
            <input type="hidden" id="workIdInput" value="" />
            <input type="text" id="workNameInput" value="Új Projekt" />
            <textarea id="workDescriptionInput"></textarea>
            <input type="text" id="workLocationInput" value="Budapest" />
            <input type="date" id="workDateInput" value="2026-11-15" />
            <input type="number" id="workDurationInput" value="0" />
            <select id="workStatusInput"><option value="folyamatban" selected>Folyamatban</option></select>
            <button id="btnDeleteWork" class="hidden"></button>
        </div>
        <div id="workAppEditorRoot"></div>
    </body></html>`);

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    try {
        let toastMessage = '';
        let saveCalled = false;
        let savedData = null;

        const app = Object.create(App.prototype);
        Object.assign(app, {
            hmiNotif: {
                showToast: (msg) => { toastMessage = msg; }
            },
            workLogManager: {
                save: async (data) => {
                    saveCalled = true;
                    savedData = data;
                },
                works: []
            },
            updateReactStore: () => {},
            closeWorkModal: () => {}
        });

        const durInput = document.getElementById('workDurationInput');

        // Test 1: duration = 0
        durInput.value = '0';
        await app.submitWorkForm();
        assert.equal(saveCalled, false, 'Should not save with duration 0');
        assert.ok(toastMessage.includes('legalább 1 napnak'), 'Toast should report duration error');

        // Test 2: duration = -5
        toastMessage = '';
        durInput.value = '-5';
        await app.submitWorkForm();
        assert.equal(saveCalled, false, 'Should not save with negative duration');
        assert.ok(toastMessage.includes('legalább 1 napnak'), 'Toast should report duration error');

        // Test 3: duration = 2.5 (fractional)
        toastMessage = '';
        durInput.value = '2.5';
        await app.submitWorkForm();
        assert.equal(saveCalled, false, 'Should not save with fractional duration');
        assert.ok(toastMessage.includes('egész számnak'), 'Toast should report integer duration error');

        // Test 4: duration = empty string
        toastMessage = '';
        durInput.value = '';
        await app.submitWorkForm();
        assert.equal(saveCalled, false, 'Should not save with empty duration');
        assert.ok(toastMessage.includes('számnak kell lennie'), 'Toast should report missing/non-numeric duration');

        // Test 5: duration exceeds MAX_WORK_DURATION
        toastMessage = '';
        durInput.value = '5000';
        await app.submitWorkForm();
        assert.equal(saveCalled, false, 'Should not save with duration > MAX_WORK_DURATION');
        assert.ok(toastMessage.includes('nem haladhatja meg'), 'Toast should report duration ceiling');

        // Test 6: valid duration = 4
        durInput.value = '4';
        await app.submitWorkForm();
        assert.equal(saveCalled, true, 'Should save with valid duration');
        assert.equal(savedData.duration, 4);

    } finally {
        delete globalThis.window;
        delete globalThis.document;
    }
});

test('P2-4: WorkLogManager.save rejects invalid duration, invalid date, and invalid status via production API', async () => {
    const mockDb = {
        save: async () => {},
        getAll: async () => [],
        runTransaction: async () => {}
    };
    const manager = new WorkLogManager(mockDb, null);

    // Invalid duration: 0
    await assert.rejects(
        async () => {
            await manager.save({ name: 'Teszt', date: '2026-11-15', duration: 0 });
        },
        /legalább 1 napnak kell lennie/
    );

    // Invalid duration: negative
    await assert.rejects(
        async () => {
            await manager.save({ name: 'Teszt', date: '2026-11-15', duration: -2 });
        },
        /legalább 1 napnak kell lennie/
    );

    // Invalid duration: fractional
    await assert.rejects(
        async () => {
            await manager.save({ name: 'Teszt', date: '2026-11-15', duration: 1.2 });
        },
        /egész számnak kell lennie/
    );

    // Invalid date
    await assert.rejects(
        async () => {
            await manager.save({ name: 'Teszt', date: '2026-02-30', duration: 2 });
        },
        /Érvénytelen dátum formátum/
    );

    // Invalid status
    await assert.rejects(
        async () => {
            await manager.save({ name: 'Teszt', date: '2026-11-15', duration: 2, status: 'invalid-status' });
        },
        /Érvénytelen státusz/
    );
});

test('P2-5: WorkLogManager.save allows valid editing of existing records while preserving metadata', async () => {
    const existingWork = {
        id: 'work-abc-123',
        name: 'Eredeti név',
        description: 'Régi leírás',
        location: 'Budapest',
        date: '2026-10-01',
        duration: 2,
        status: 'folyamatban',
        created_at: '2026-10-01T09:00:00Z',
        updated_at: '2026-10-01T09:00:00Z',
        custom_field: 'preserved-meta'
    };

    let putRecord = null;
    const mockDb = {
        getAll: async () => [existingWork],
        runTransaction: async (stores, mode, fn) => {
            const mockStores = {
                works: {
                    get: (id, cb) => {
                        cb(existingWork);
                    },
                    put: (rec) => {
                        putRecord = rec;
                    }
                }
            };
            await fn({}, mockStores);
        }
    };

    const manager = new WorkLogManager(mockDb, null);

    // Partial update: only name and duration changed; omitted status, description, location preserved
    const updated = await manager.save({
        id: 'work-abc-123',
        name: 'Módosított név',
        duration: 5
    });

    assert.equal(updated.name, 'Módosított név');
    assert.equal(updated.duration, 5);
    assert.equal(putRecord.description, 'Régi leírás', 'Omitted description preserved');
    assert.equal(putRecord.location, 'Budapest', 'Omitted location preserved');
    assert.equal(putRecord.date, '2026-10-01', 'Omitted date preserved');
    assert.equal(putRecord.status, 'folyamatban', 'Omitted status preserved');
    assert.equal(updated.created_at, '2026-10-01T09:00:00Z', 'Original created_at must be strictly preserved');
    assert.equal(putRecord.custom_field, 'preserved-meta', 'Original metadata must be preserved');
    assert.ok(putRecord.updated_at !== '2026-10-01T09:00:00Z', 'updated_at should be refreshed');

    // Partial update: explicit null date or null duration rejected on update
    await assert.rejects(
        () => manager.save({ id: 'work-abc-123', name: 'Név', date: null }),
        /Érvénytelen dátum formátum/
    );
    await assert.rejects(
        () => manager.save({ id: 'work-abc-123', name: 'Név', duration: null }),
        /Az időtartamnak számnak kell lennie/
    );
});

test('P2-6: WorkLogManager.load sorts newest first by instant across timezone offsets with date and ID tie-breaks', async () => {
    // 1. Differing timezone offsets:
    // Work A: 12:00:00 UTC (timestamp: 12:00 UTC)
    // Work B: 13:30:00+02:00 (timestamp: 11:30 UTC) -> Work A is newer than Work B even though '13' > '12' in string!
    const worksData = [
        { id: 'work-b', name: 'Task B', date: '2026-11-01', duration: 1, created_at: '2026-11-01T13:30:00+02:00' }, // 11:30Z
        { id: 'work-a', name: 'Task A', date: '2026-11-01', duration: 1, created_at: '2026-11-01T12:00:00Z' },      // 12:00Z
        // Equal instants: tie-break by date descending
        { id: 'work-tie-earlier-date', name: 'Tie Earlier', date: '2026-10-10', duration: 1, created_at: '2026-10-20T10:00:00Z' },
        { id: 'work-tie-later-date', name: 'Tie Later', date: '2026-10-25', duration: 1, created_at: '2026-10-20T10:00:00Z' },
        // Deliberate counter-fixture where date order and ID order imply DIFFERENT results:
        // Record X: date: '2026-09-20', id: 'zzz-id'
        // Record Y: date: '2026-09-10', id: 'aaa-id'
        // Date descending puts X first, whereas ID ascending would put Y first. Date order MUST take precedence!
        { id: 'zzz-id', name: 'X', date: '2026-09-20', duration: 1 },
        { id: 'aaa-id', name: 'Y', date: '2026-09-10', duration: 1 },
        // Equal date without timestamps: ID ascending tie-breaks
        { id: 'id-2', name: 'Equal Date 2', date: '2026-08-01', duration: 1 },
        { id: 'id-1', name: 'Equal Date 1', date: '2026-08-01', duration: 1 }
    ];

    const mockDb = {
        getAll: async () => [...worksData]
    };

    const manager = new WorkLogManager(mockDb, null);
    const loaded = await manager.load();

    // 1. Work A (12:00Z) should precede Work B (11:30Z) because it happened at a newer instant
    const idxA = loaded.findIndex(w => w.id === 'work-a');
    const idxB = loaded.findIndex(w => w.id === 'work-b');
    assert.ok(idxA < idxB, 'Work A (12:00 UTC) must precede Work B (11:30 UTC)');

    // 2. Equal timestamps: later date precedes earlier date
    const idxTieLater = loaded.findIndex(w => w.id === 'work-tie-later-date');
    const idxTieEarlier = loaded.findIndex(w => w.id === 'work-tie-earlier-date');
    assert.ok(idxTieLater < idxTieEarlier, 'Tie Later (2026-10-25) must precede Tie Earlier (2026-10-10)');

    // 3. Counter-fixture: date order precedes ID order
    const idxX = loaded.findIndex(w => w.id === 'zzz-id');
    const idxY = loaded.findIndex(w => w.id === 'aaa-id');
    assert.ok(idxX < idxY, 'Record X (date 2026-09-20) must precede Record Y (date 2026-09-10) despite id zzz > aaa');

    // 4. Equal date without timestamps: ID ascending tie-break
    const idxId1 = loaded.findIndex(w => w.id === 'id-1');
    const idxId2 = loaded.findIndex(w => w.id === 'id-2');
    assert.ok(idxId1 < idxId2, 'id-1 must precede id-2 when date and timestamps are identical');
});

test('P2-7: BackupManager.restoreFromBackup restores valid works and rejects invalid works BEFORE clearing database', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    dom.window.indexedDB = globalThis.indexedDB;
    dom.window.IDBKeyRange = IDBKeyRange;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    try {
        let clearedStores = [];
        let putRecords = {};

        const mockRawDb = {
            transaction: (storeNames, mode) => {
                return {
                    objectStore: (storeName) => ({
                        clear: () => { clearedStores.push(storeName); },
                        put: (rec) => {
                            if (!putRecords[storeName]) putRecords[storeName] = [];
                            putRecords[storeName].push(rec);
                        }
                    }),
                    oncomplete: null,
                    onerror: null
                };
            }
        };

        const app = {
            db: { db: mockRawDb },
            storage: {
                get: (key) => {}
            },
            hmiNotif: {
                showConfirm: async () => true,
                showToast: () => {}
            },
            items: { load: async () => {} },
            months: { load: async () => {} },
            entries: { load: async () => {} },
            workLogManager: { load: async () => {} }
        };

        const backupManager = new BackupManager(app);

        // Subcase A: Backup contains a work record with duration: -1
        let invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            items: [{ id: 'new-item' }],
            works: [
                { id: 'w1', name: 'Valid Work', date: '2026-11-10', duration: 2, status: 'folyamatban' },
                { id: 'w2', name: 'Corrupt Work', date: '2026-11-10', duration: -1, status: 'folyamatban' }
            ]
        };
        app.storage.get = () => invalidBackup;
        let toastError = '';
        app.hmiNotif.showToast = (msg, type) => { if (type === 'error' || msg.includes('❌')) toastError = msg; };
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when negative duration');
        assert.ok(toastError.includes('Érvénytelen munka bejegyzés a backupban'), 'Error toast should explain failure');

        // Subcase B: Backup contains work record with date: null
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: [{ id: 'w1', name: 'Work', date: null, duration: 2, status: 'folyamatban' }]
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when date is null');
        assert.ok(toastError.includes('dátuma kötelező') || toastError.includes('Érvénytelen munka bejegyzés'));

        // Subcase C: Backup contains work record with missing date
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: [{ id: 'w1', name: 'Work', duration: 2, status: 'folyamatban' }]
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when date is missing');
        assert.ok(toastError.includes('dátuma kötelező') || toastError.includes('Érvénytelen munka bejegyzés'));

        // Subcase D: Backup contains work record with duration: null
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: [{ id: 'w1', name: 'Work', date: '2026-11-10', duration: null, status: 'folyamatban' }]
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when duration is null');
        assert.ok(toastError.includes('időtartam kötelező') || toastError.includes('Érvénytelen munka bejegyzés'));

        // Subcase E: Backup contains work record with missing duration
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: [{ id: 'w1', name: 'Work', date: '2026-11-10', status: 'folyamatban' }]
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when duration is missing');
        assert.ok(toastError.includes('időtartam kötelező') || toastError.includes('Érvénytelen munka bejegyzés'));

        // Subcase F: Backup contains work record with missing ID
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: [{ name: 'Work without ID', date: '2026-11-10', duration: 2, status: 'folyamatban' }]
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when ID is missing');
        assert.ok(toastError.includes('azonosító') || toastError.includes('Érvénytelen munka bejegyzés'));

        // Subcase G: Backup contains duplicate work IDs
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: [
                { id: 'dup-id', name: 'Work 1', date: '2026-11-10', duration: 2, status: 'folyamatban' },
                { id: 'dup-id', name: 'Work 2', date: '2026-11-11', duration: 3, status: 'elvégzett' }
            ]
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when duplicate ID exists');
        assert.ok(toastError.includes('Duplikált munka azonosító'));

        // Subcase H: Explicit works: null must be rejected
        toastError = '';
        invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            works: null
        };
        app.storage.get = () => invalidBackup;
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when works is null');
        assert.ok(toastError.includes('null nem megengedett'));

        // Subcase I: Legacy backup omitting works entirely: preserves existing works without clearing works store
        clearedStores = [];
        const legacyBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            items: [{ id: 'legacy-item' }]
        };
        app.storage.get = () => legacyBackup;
        const origTx = mockRawDb.transaction;
        mockRawDb.transaction = (storeNames, mode) => {
            const tx = origTx(storeNames, mode);
            setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
        };
        await backupManager.restoreFromBackup();
        assert.equal(clearedStores.includes('works'), false, 'Legacy backup omitting works must NOT clear works store');

        // Case 2: Backup contains valid complete work records
        clearedStores = [];
        putRecords = {};
        const validBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            items: [{ id: 'new-item' }],
            works: [
                { id: 'w1', name: 'Valid Work 1', date: '2026-11-10', duration: 2, status: 'folyamatban' },
                { id: 'w2', name: 'Valid Work 2', date: '2026-11-11', duration: 5, status: 'elvégzett' }
            ]
        };

        app.storage.get = () => validBackup;

        await backupManager.restoreFromBackup();
        assert.ok(clearedStores.includes('works'), 'Works store should be cleared on valid restore');
        assert.equal(putRecords['works'].length, 2, '2 work records should be put');
        assert.equal(putRecords['works'][0].id, 'w1');
        assert.equal(putRecords['works'][1].id, 'w2');

    } finally {
        delete globalThis.window;
        delete globalThis.document;
    }
});

test('P2-8: DataExportController._performImport strictly validates complete work records and rejects invalid ones before opening IDB transaction', async () => {
    let transactionOpened = false;
    let clearedStores = [];

    const mockRawDb = {
        transaction: (storeNames, mode) => {
            transactionOpened = true;
            return {
                objectStore: (storeName) => ({
                    clear: () => { clearedStores.push(storeName); },
                    put: () => {}
                }),
                oncomplete: null,
                onerror: null
            };
        }
    };

    const mockApp = {
        db: { db: mockRawDb },
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        workLogManager: { load: async () => {} },
        hmiNotif: { showToast: () => {} }
    };

    const controller = new DataExportController(mockApp);

    // 1. Corrupt data with missing date
    transactionOpened = false;
    await assert.rejects(
        () => controller._performImport({
            works: [{ id: 'w-corrupt', name: 'Task', duration: 2, status: 'folyamatban' }]
        }),
        /A munka dátuma kötelező/
    );
    assert.equal(transactionOpened, false, 'IDB transaction must NOT be opened when date is missing');

    // 2. Corrupt data with date: null
    transactionOpened = false;
    await assert.rejects(
        () => controller._performImport({
            works: [{ id: 'w-corrupt', name: 'Task', date: null, duration: 2, status: 'folyamatban' }]
        }),
        /A munka dátuma kötelező/
    );
    assert.equal(transactionOpened, false, 'IDB transaction must NOT be opened when date is null');

    // 3. Corrupt data with duration: null
    transactionOpened = false;
    await assert.rejects(
        () => controller._performImport({
            works: [{ id: 'w-corrupt', name: 'Task', date: '2026-11-10', duration: null, status: 'folyamatban' }]
        }),
        /Az időtartam kötelező/
    );
    assert.equal(transactionOpened, false, 'IDB transaction must NOT be opened when duration is null');

    // 4. Corrupt data with duration: -3
    transactionOpened = false;
    await assert.rejects(
        () => controller._performImport({
            works: [{ id: 'w-corrupt', name: 'Task', date: '2026-11-10', duration: -3, status: 'folyamatban' }]
        }),
        /legalább 1 napnak kell lennie/
    );
    assert.equal(transactionOpened, false, 'IDB transaction must NOT be opened when duration is negative');

    // 5. Corrupt data with works: null
    transactionOpened = false;
    await assert.rejects(
        () => controller._performImport({ works: null }),
        /null nem megengedett/
    );
    assert.equal(transactionOpened, false, 'IDB transaction must NOT be opened when works is null');

    // 6. Corrupt data with duplicate IDs
    transactionOpened = false;
    await assert.rejects(
        () => controller._performImport({
            works: [
                { id: 'dup-1', name: 'Work 1', date: '2026-11-10', duration: 1, status: 'folyamatban' },
                { id: 'dup-1', name: 'Work 2', date: '2026-11-11', duration: 2, status: 'folyamatban' }
            ]
        }),
        /Duplikált munka azonosító/
    );
    assert.equal(transactionOpened, false, 'IDB transaction must NOT be opened when duplicate ID exists');

    // 7. Valid data restores and opens transaction
    transactionOpened = false;
    mockRawDb.transaction = (storeNames, mode) => {
        transactionOpened = true;
        const tx = {
            objectStore: (storeName) => ({
                clear: () => { clearedStores.push(storeName); },
                put: () => {}
            }),
            oncomplete: null,
            onerror: null
        };
        setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
        return tx;
    };

    await controller._performImport({
        works: [{ id: 'w-valid', name: 'Valid Work', date: '2026-11-10', duration: 3, status: 'folyamatban' }]
    });
    assert.equal(transactionOpened, true, 'IDB transaction must be opened for valid import');
    assert.ok(clearedStores.includes('works'));
});

test('P2-9: Real IndexedDB restore test using fake-indexeddb validates complete work records and preserves DB on failure', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    dom.window.indexedDB = globalThis.indexedDB;
    dom.window.IDBKeyRange = IDBKeyRange;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    try {
        const dbName = `test_db_restore_${Date.now()}`;
        const db = new Database(dbName);
        await db.connect();

        // Populate initial database with an existing work item
        const initialWork = {
            id: 'initial-work-1',
            name: 'Original Initial Work',
            date: '2026-11-01',
            duration: 5,
            status: 'folyamatban'
        };
        await db.save('works', initialWork);

        const loadedBefore = await db.getAll('works');
        assert.equal(loadedBefore.length, 1);
        assert.equal(loadedBefore[0].name, 'Original Initial Work');

        const mockApp = {
            db: db,
            storage: { get: () => {} },
            hmiNotif: {
                showConfirm: async () => true,
                showToast: () => {}
            },
            items: { load: async () => {} },
            months: { load: async () => {} },
            entries: { load: async () => {} },
            workLogManager: { load: async () => {} }
        };

        const backupManager = new BackupManager(mockApp);

        // Attempt restore with invalid backup (missing duration)
        let toastError = '';
        mockApp.hmiNotif.showToast = (msg) => { toastError = msg; };
        mockApp.storage.get = () => ({
            timestamp: new Date().toISOString(),
            works: [
                { id: 'w-invalid', name: 'Incomplete Work', date: '2026-11-10', status: 'folyamatban' } // missing duration
            ]
        });

        await backupManager.restoreFromBackup();
        assert.ok(toastError.includes('Az időtartam kötelező') || toastError.includes('Érvénytelen munka bejegyzés'));

        // Verify that genuine IndexedDB contents were completely preserved
        const loadedAfterFailed = await db.getAll('works');
        assert.equal(loadedAfterFailed.length, 1, 'Initial work must be preserved in real IndexedDB');
        assert.equal(loadedAfterFailed[0].name, 'Original Initial Work');

        // Now attempt restore with valid backup
        mockApp.storage.get = () => ({
            timestamp: new Date().toISOString(),
            works: [
                { id: 'w-restored-1', name: 'Restored Work 1', date: '2026-11-10', duration: 2, status: 'elvégzett' }
            ]
        });

        await backupManager.restoreFromBackup();

        // Verify that genuine IndexedDB now contains the restored work
        const loadedAfterSuccess = await db.getAll('works');
        assert.equal(loadedAfterSuccess.length, 1);
        assert.equal(loadedAfterSuccess[0].id, 'w-restored-1');
        assert.equal(loadedAfterSuccess[0].name, 'Restored Work 1');

        await db.close?.();
    } finally {
        delete globalThis.window;
        delete globalThis.document;
    }
});
