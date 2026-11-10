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

    // 3. Name validation
    assert.equal(validateWorkRecord({ date: '2026-11-15', duration: 1 }).valid, false);
    assert.equal(validateWorkRecord({ name: '   ', date: '2026-11-15', duration: 1 }).valid, false);
    assert.equal(validateWorkRecord({ name: 123, date: '2026-11-15', duration: 1 }).valid, false);

    // 4. Date validation
    assert.equal(validateWorkRecord({ name: 'Próba', date: 'invalid', duration: 1 }).valid, false);
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-02-29', duration: 1 }).valid, false); // non-leap year
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-13-01', duration: 1 }).valid, false); // invalid month
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-04-31', duration: 1 }).valid, false); // 30-day month
    assert.equal(isValidCalendarDate('2024-02-29'), true); // leap year
    assert.equal(isValidCalendarDate('2026-11-09'), true);

    // 5. Status validation
    assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-11-15', duration: 1, status: 'unknown' }).valid, false);
    for (const st of VALID_WORK_STATUSES) {
        assert.equal(validateWorkRecord({ name: 'Próba', date: '2026-11-15', duration: 1, status: st }).valid, true);
    }

    // 6. Prototype pollution protection
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

    const updated = await manager.save({
        id: 'work-abc-123',
        name: 'Módosított név',
        date: '2026-10-02',
        duration: 5,
        status: 'elvégzett'
    });

    assert.equal(updated.name, 'Módosított név');
    assert.equal(updated.duration, 5);
    assert.equal(updated.status, 'elvégzett');
    assert.equal(updated.created_at, '2026-10-01T09:00:00Z', 'Original created_at must be strictly preserved');
    assert.equal(putRecord.custom_field, 'preserved-meta', 'Original metadata must be preserved');
    assert.ok(putRecord.updated_at !== '2026-10-01T09:00:00Z', 'updated_at should be refreshed');
});

test('P2-6: WorkLogManager.load sorts newest first with deterministic tie-breaking for equal and missing timestamps', async () => {
    const worksData = [
        { id: 'work-1', name: 'Task 1', date: '2026-10-01', duration: 1, created_at: '2026-10-01T10:00:00Z' },
        { id: 'work-2', name: 'Task 2', date: '2026-11-01', duration: 2, created_at: '2026-11-01T10:00:00Z' },
        { id: 'work-3', name: 'Task 3', date: '2026-11-05', duration: 3, created_at: '2026-11-05T12:00:00Z' },
        // Equal created_at timestamps: tie-break by date descending
        { id: 'work-4', name: 'Task 4', date: '2026-10-15', duration: 1, created_at: '2026-10-20T10:00:00Z' },
        { id: 'work-5', name: 'Task 5', date: '2026-10-18', duration: 1, created_at: '2026-10-20T10:00:00Z' },
        // Missing created_at timestamps: tie-break by date descending, then id
        { id: 'work-legacy-b', name: 'Legacy B', date: '2026-09-01', duration: 1 },
        { id: 'work-legacy-a', name: 'Legacy A', date: '2026-09-10', duration: 1 }
    ];

    const mockDb = {
        getAll: async () => [...worksData]
    };

    const manager = new WorkLogManager(mockDb, null);
    const loaded = await manager.load();

    // 1. Newest created_at should be first
    assert.equal(loaded[0].id, 'work-3', 'Work 3 (Nov 5) should be first');
    assert.equal(loaded[1].id, 'work-2', 'Work 2 (Nov 1) should be second');

    // 2. Equal created_at (Task 4 and Task 5 both created 2026-10-20): Task 5 has date 2026-10-18 > 2026-10-15
    const idxWork5 = loaded.findIndex(w => w.id === 'work-5');
    const idxWork4 = loaded.findIndex(w => w.id === 'work-4');
    assert.ok(idxWork5 < idxWork4, 'Work 5 should precede Work 4 due to later work date');

    // 3. Missing created_at records appear at the end, ordered stably by id
    const legacyAIdx = loaded.findIndex(w => w.id === 'work-legacy-a');
    const legacyBIdx = loaded.findIndex(w => w.id === 'work-legacy-b');
    assert.ok(legacyAIdx < legacyBIdx, 'Legacy A should precede Legacy B by stable ID');
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

        // Case 1: Backup contains an invalid work record (negative duration)
        const invalidBackup = {
            timestamp: '2026-11-09T10:00:00Z',
            items: [{ id: 'new-item' }],
            works: [
                { id: 'w1', name: 'Valid Work', date: '2026-11-10', duration: 2, status: 'folyamatban' },
                { id: 'w2', name: 'Corrupt Work', date: '2026-11-10', duration: -1, status: 'folyamatban' }
            ]
        };

        app.storage.get = () => invalidBackup;

        let toastError = '';
        app.hmiNotif.showToast = (msg, type) => {
            if (type === 'error' || msg.includes('❌')) toastError = msg;
        };

        await backupManager.restoreFromBackup();

        // Crucial requirement: No object stores should have been cleared!
        assert.equal(clearedStores.length, 0, 'No stores should be cleared when validation fails');
        assert.ok(toastError.includes('Érvénytelen munka bejegyzés a backupban'), 'Error toast should explain failure');

        // Case 2: Backup contains valid work records
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

        // Complete the mock transaction synchronously
        const origTx = mockRawDb.transaction;
        mockRawDb.transaction = (storeNames, mode) => {
            const tx = origTx(storeNames, mode);
            setTimeout(() => {
                if (tx.oncomplete) tx.oncomplete();
            }, 0);
            return tx;
        };

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
