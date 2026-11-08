import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Database } from '../js/oop-core.js';
import { WorkLogManager } from '../js/work-log.js';
import { DataExportController } from '../js/data-export-controller.js';
import { App } from '../js/app.js';
import { appService } from '../src/services/appService.js';
import WorkEditorModal from '../src/components/WorkEditorModal.jsx';

function createMockDb(initialWorks = []) {
    const store = new Map();
    initialWorks.forEach(w => store.set(String(w.id), { ...w }));
    return {
        store,
        // Match real Database production API: getAll, save, delete, runTransaction (no get())
        getAll: async (table) => {
            if (table === 'works') return Array.from(store.values()).map(v => ({ ...v }));
            return [];
        },
        save: async (table, record) => {
            if (table === 'works') {
                store.set(String(record.id), { ...record });
                return record.id;
            }
            return null;
        },
        delete: async (table, id) => {
            if (table === 'works') {
                store.delete(String(id));
            }
        },
        runTransaction: async (storeNames, mode, txFn) => {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            if (typeof txFn !== 'function') {
                return Promise.reject(new Error('[DB] runTransaction requires a txFn callback function.'));
            }
            const stores = {};
            // Track pending operations for atomic commit/rollback
            const stagedPuts = [];
            const stagedDeletes = [];

            for (const name of names) {
                if (name === 'works') {
                    stores[name] = {
                        get: (key, cb) => {
                            const val = store.get(String(key));
                            const cloned = val ? { ...val } : null;
                            if (typeof cb === 'function') {
                                cb(cloned);
                                return undefined;
                            }
                            // Return an IDBRequest-like object matching real IDBObjectStore.get()
                            const req = {
                                result: cloned,
                                onsuccess: null,
                                onerror: null
                            };
                            queueMicrotask(() => {
                                if (req.onsuccess) req.onsuccess({ target: req });
                            });
                            return req;
                        },
                        put: (data) => {
                            stagedPuts.push({ storeName: name, key: String(data.id), data: { ...data } });
                        },
                        delete: (key) => {
                            stagedDeletes.push({ storeName: name, key: String(key) });
                        }
                    };
                }
            }

            let aborted = false;
            const fakeTx = {
                abort: () => {
                    aborted = true;
                }
            };

            try {
                txFn(fakeTx, stores);
                if (aborted) {
                    throw new Error('Transaction aborted');
                }
                // Commit staged changes
                for (const p of stagedPuts) {
                    if (p.storeName === 'works') store.set(p.key, p.data);
                }
                for (const d of stagedDeletes) {
                    if (d.storeName === 'works') store.delete(d.key);
                }
            } catch (err) {
                return Promise.reject(err);
            }
            return Promise.resolve();
        }
    };
}

test('P1-1: Work Log Export operations target workLogManager and preserve financial ledger', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    const mockWorks = [
        { id: 'w1', name: 'Munka 1', description: 'Leírás 1', location: 'Budapest', date: '2026-11-01', duration: 2, status: 'folyamatban' },
        { id: 'w2', name: 'Munka 2', description: 'Leírás 2', location: 'Debrecen', date: '2026-11-02', duration: 1, status: 'elvégzett' }
    ];

    const db = createMockDb(mockWorks);
    const workLogManager = new WorkLogManager(db, null);
    await workLogManager.load();

    const incomingManager = {
        incomings: [{ id: 'inc1', sender: 'Cég A', amount: 50000, date: '2026-11-01' }],
        senders: [{ id: 's1', name: 'Cég A' }],
        add: async () => { throw new Error('incomingManager.add should NEVER be called by Work Log operations!'); },
        update: async () => { throw new Error('incomingManager.update should NEVER be called by Work Log operations!'); }
    };

    let writtenExcelFile = null;
    let writtenPdfDoc = null;

    globalThis.XLSX = {
        utils: {
            book_new: () => ({ Sheets: {}, SheetNames: [] }),
            aoa_to_sheet: (data) => ({ data }),
            book_append_sheet: (wb, sheet, name) => { wb.Sheets[name] = sheet; wb.SheetNames.push(name); }
        },
        writeFile: (wb, filename) => {
            writtenExcelFile = { wb, filename };
        }
    };

    globalThis.jspdf = {
        jsPDF: class MockJsPDF {
            constructor() {
                this.texts = [];
            }
            addFont() {}
            setFont() {}
            setFontSize() {}
            text(str, x, y) { this.texts.push({ str, x, y }); }
            autoTable(opts) { this.tableOpts = opts; }
            save(filename) { writtenPdfDoc = { filename, tableOpts: this.tableOpts, texts: this.texts }; }
        }
    };
    dom.window.jspdf = globalThis.jspdf;

    const mockApp = {
        workLogManager,
        incomingManager,
        setSystemStatus: () => {},
        updateReactStore: () => {},
        hmiNotif: {
            showInfo: async () => {},
            showToast: () => {}
        }
    };

    const exportController = new DataExportController(mockApp);

    // 1. Test Excel export
    await exportController.exportWorkExcel();
    assert.ok(writtenExcelFile, 'Excel file should have been generated');
    assert.ok(writtenExcelFile.filename.startsWith('Munka_Nyilvantartas_'));
    const excelRows = writtenExcelFile.wb.Sheets['Munka Nyilvántartás'].data;
    assert.equal(excelRows.length, 3); // 1 header + 2 works
    assert.equal(excelRows[0][1], 'Munka Neve');
    assert.equal(excelRows[1][1], 'Munka 1');
    assert.equal(excelRows[2][1], 'Munka 2');

    // 2. Test PDF export
    await exportController.exportWorkPdf();
    assert.ok(writtenPdfDoc, 'PDF document should have been generated');
    assert.ok(writtenPdfDoc.filename.startsWith('Munka_Nyilvantartas_'));
    assert.equal(writtenPdfDoc.tableOpts.body.length, 2);
    assert.equal(writtenPdfDoc.tableOpts.body[0][1], 'Munka 1');

    // 3. Test JSON export produces valid works structure
    let createdBlob = null;
    globalThis.Blob = class MockBlob {
        constructor(parts, opts) {
            this.content = parts[0];
            this.opts = opts;
            createdBlob = this;
        }
    };
    globalThis.URL = {
        createObjectURL: () => 'blob:mock-url',
        revokeObjectURL: () => {}
    };

    await exportController.exportWorkJson();
    assert.ok(createdBlob, 'Blob should be created for JSON export');
    const parsedExport = JSON.parse(createdBlob.content);
    assert.ok(Array.isArray(parsedExport.works));
    assert.equal(parsedExport.works.length, 2);
    assert.equal(parsedExport.works[0].name, 'Munka 1');

    dom.window.close();
});

test('P1-1: Work Log JSON Import validates malformed JSON, invalid schema, and invalid records safely', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    const initialWorks = [
        { id: 'w1', name: 'Munka Eredeti', description: 'Desc', location: 'Pest', date: '2026-11-01', duration: 1, status: 'folyamatban' }
    ];
    const db = createMockDb(initialWorks);
    const workLogManager = new WorkLogManager(db, null);
    await workLogManager.load();

    const incomingManager = {
        incomings: [{ id: 'inc1', sender: 'Cég A', amount: 50000, date: '2026-11-01' }],
        senders: [{ id: 's1', name: 'Cég A' }],
        add: async () => { throw new Error('incomingManager.add should NEVER be called by Work Log import!'); },
        update: async () => { throw new Error('incomingManager.update should NEVER be called by Work Log import!'); }
    };

    let reportedInfo = null;
    const mockApp = {
        workLogManager,
        incomingManager,
        updateReactStore: () => {},
        hmiNotif: {
            showInfo: async (title, msg) => { reportedInfo = { title, msg }; },
            showToast: () => {}
        }
    };

    const exportController = new DataExportController(mockApp);

    let fileInputOnChange = null;
    const origCreateElement = dom.window.document.createElement.bind(dom.window.document);
    dom.window.document.createElement = (tag) => {
        const el = origCreateElement(tag);
        if (tag === 'input') {
            Object.defineProperty(el, 'click', {
                value: () => {
                    fileInputOnChange = el.onchange;
                }
            });
        }
        return el;
    };

    globalThis.FileReader = class MockFileReader {
        readAsText(file) {
            setTimeout(() => {
                this.onload({ target: { result: file.text } });
            }, 0);
        }
    };

    // Scenario A: Malformed JSON syntax (causes JSON.parse() to throw)
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({ target: { files: [{ text: '{ invalid json syntax :' }] } });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, '❌ Hiba');
    assert.equal(reportedInfo?.msg, 'Hibás JSON fájl formátum!');
    assert.equal(workLogManager.works.length, 1, 'Existing works must remain untouched on malformed JSON');
    assert.equal(incomingManager.incomings.length, 1, 'Incoming ledger must remain untouched');

    // Scenario B: Valid JSON with missing 'works' field
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({ target: { files: [{ text: JSON.stringify({ items: [] }) }] } });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, 'Érvénytelen fájl');
    assert.equal(workLogManager.works.length, 1);
    assert.equal(incomingManager.incomings.length, 1);

    // Scenario C: Valid JSON with empty works array
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({ target: { files: [{ text: JSON.stringify({ works: [] }) }] } });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, 'Üres adatállomány');
    assert.equal(workLogManager.works.length, 1);
    assert.equal(incomingManager.incomings.length, 1);

    // Scenario D: Strict calendar date validation (rejecting impossible dates like 2026-02-31, 2023-02-29)
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { name: 'Feb 31 Task', date: '2026-02-31', duration: 1 },
                        { name: 'Apr 31 Task', date: '2026-04-31', duration: 1 },
                        { name: 'Non Leap Feb 29', date: '2023-02-29', duration: 1 },
                        { name: 'Malformed Date', date: 'invalid-date', duration: 1 }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, 'Érvénytelen adatok');
    assert.equal(workLogManager.works.length, 1);

    // Scenario E: Duration validation (rejecting NaN, Infinity, -Infinity, non-integers, 0, and negative numbers)
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { name: 'Zero Dur', date: '2026-11-01', duration: 0 },
                        { name: 'Negative Dur', date: '2026-11-01', duration: -2 },
                        { name: 'Non Integer Dur', date: '2026-11-01', duration: 1.5 },
                        { name: 'NaN Dur', date: '2026-11-01', duration: 'not-a-number' }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, 'Érvénytelen adatok');
    assert.equal(workLogManager.works.length, 1);

    // Scenario E2: created_at timestamp validation (rejecting numbers, objects, and malformed date strings without converting to current timestamp)
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { name: 'Number CreatedAt', date: '2026-11-01', duration: 1, created_at: 123456789 },
                        { name: 'Object CreatedAt', date: '2026-11-01', duration: 1, created_at: { date: '2026-01-01' } },
                        { name: 'Malformed Date CreatedAt', date: '2026-11-01', duration: 1, created_at: 'not-a-real-date' }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, 'Érvénytelen adatok', 'Malformed created_at timestamps must be rejected');
    assert.equal(workLogManager.works.length, 1);

    // Scenario F: Prototype pollution protection and legacy metadata preservation
    reportedInfo = null;
    globalThis.confirm = () => true;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        {
                            id: 'w-proto',
                            name: 'Proto Test Task',
                            date: '2026-11-02',
                            duration: 2,
                            _old_autoincrement_id: 1234,
                            customTag: 'audit-legacy-tag',
                            __proto__: { polluted: true },
                            constructor: { prototype: { admin: true } }
                        }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, 2);
    const importedProtoWork = workLogManager.works.find(w => w.name === 'Proto Test Task');
    assert.ok(importedProtoWork);
    assert.equal(importedProtoWork.duration, 2);
    assert.equal(importedProtoWork._old_autoincrement_id, 1234);
    assert.equal(importedProtoWork.customTag, 'audit-legacy-tag');
    assert.equal(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted');
    assert.equal(Object.prototype.admin, undefined, 'Object.prototype must not be polluted');

    // Scenario G: Cancellation leaves database untouched
    globalThis.confirm = () => false;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { name: 'Cancelled Task', date: '2026-11-03', duration: 1 }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(workLogManager.works.length, 2, 'Cancelled import must not modify database');

    // Scenario H: Partial failure reporting when some records fail save
    globalThis.confirm = () => true;
    let shouldFailSpecificId = 'fail-rec-2';
    const origMgrSave = workLogManager.save.bind(workLogManager);
    workLogManager.save = async (item) => {
        if (item.id === shouldFailSpecificId) {
            throw new Error('Disk quota exceeded for fail-rec-2');
        }
        return origMgrSave(item);
    };

    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { id: 'succ-rec-1', name: 'Sikeres Tétel 1', date: '2026-11-04', duration: 1 },
                        { id: 'fail-rec-2', name: 'Sikertelen Tétel 2', date: '2026-11-04', duration: 2 },
                        { id: 'succ-rec-3', name: 'Sikeres Tétel 3', date: '2026-11-04', duration: 3 }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 35));

    assert.equal(reportedInfo?.title, 'Részleges importálás');
    assert.ok(reportedInfo?.msg.includes('2 sikeres, 1 sikertelen'));
    assert.ok(reportedInfo?.msg.includes('Sikertelen Tétel 2'));
    assert.ok(reportedInfo?.msg.includes('Disk quota exceeded'));

    // Retry scenario: retrying with the fixed failure should be idempotent and succeed without duplicates
    workLogManager.save = origMgrSave;
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { id: 'fail-rec-2', name: 'Sikertelen Tétel 2 Javítva', date: '2026-11-04', duration: 2 }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    const retriedWork = workLogManager.works.find(w => w.id === 'fail-rec-2');
    assert.ok(retriedWork);
    assert.equal(retriedWork.name, 'Sikertelen Tétel 2 Javítva');

    // Scenario I: Idempotency of ID-less records & distinction between same-name different-date records
    const initialCountBeforeIdless = workLogManager.works.length;
    const idlessJsonPayload = JSON.stringify({
        works: [
            { name: 'Kerítés festés', date: '2026-11-05', duration: 4, description: 'Első réteg' },
            { name: 'Kerítés festés', date: '2026-11-06', duration: 4, description: 'Második réteg' }
        ]
    });

    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{ text: idlessJsonPayload }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, initialCountBeforeIdless + 2, 'Two distinct dates must create two distinct records');

    // Find the two newly imported tasks
    const firstLayer = workLogManager.works.find(w => w.name === 'Kerítés festés' && w.date === '2026-11-05');
    const secondLayer = workLogManager.works.find(w => w.name === 'Kerítés festés' && w.date === '2026-11-06');
    assert.ok(firstLayer && secondLayer);
    assert.notEqual(firstLayer.id, secondLayer.id, 'Distinct dates must receive distinct deterministic IDs');

    // Re-import the exact same ID-less payload: MUST BE IDEMPOTENT (no new duplicates added)
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{ text: idlessJsonPayload }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, initialCountBeforeIdless + 2, 'Re-importing identical ID-less payload must be idempotent');

    // Scenario J: Two identical records occurring twice in the same import file must both be preserved
    const initialCountBeforeDuplicates = workLogManager.works.length;
    const identicalTasksJsonPayload = JSON.stringify({
        works: [
            { name: 'Kiszállási alapdíj', date: '2026-11-07', duration: 1, description: 'Fix tétel' },
            { name: 'Kiszállási alapdíj', date: '2026-11-07', duration: 1, description: 'Fix tétel' }
        ]
    });

    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{ text: identicalTasksJsonPayload }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(
        workLogManager.works.length,
        initialCountBeforeDuplicates + 2,
        'Two identical records in the same import file must both be preserved with distinct occurrence keys'
    );

    const calloutItems = workLogManager.works.filter(w => w.name === 'Kiszállási alapdíj' && w.date === '2026-11-07');
    assert.equal(calloutItems.length, 2);
    assert.notEqual(calloutItems[0].id, calloutItems[1].id, 'Identical records within same file must receive distinct occurrence IDs');

    // Re-importing identical duplicate file must still remain idempotent
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{ text: identicalTasksJsonPayload }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, initialCountBeforeDuplicates + 2, 'Repeated import of identical duplicates must remain idempotent');

    // Scenario K: Records with identical core fields but different status OR different metadata must receive distinct SHA-256 IDs
    const initialCountBeforeStatusMeta = workLogManager.works.length;
    const diffStatusAndMetaJsonPayload = JSON.stringify({
        works: [
            { name: 'Karbantartás', date: '2026-11-09', duration: 3, status: 'folyamatban', clientTier: 'standard' },
            { name: 'Karbantartás', date: '2026-11-09', duration: 3, status: 'elvégzett', clientTier: 'standard' },
            { name: 'Karbantartás', date: '2026-11-09', duration: 3, status: 'folyamatban', clientTier: 'premium' }
        ]
    });

    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{ text: diffStatusAndMetaJsonPayload }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(
        workLogManager.works.length,
        initialCountBeforeStatusMeta + 3,
        'Three records differing only by status or extra metadata must all receive distinct SHA-256 IDs'
    );

    const maintenanceItems = workLogManager.works.filter(w => w.name === 'Karbantartás' && w.date === '2026-11-09');
    assert.equal(maintenanceItems.length, 3);
    const maintenanceIds = new Set(maintenanceItems.map(m => m.id));
    assert.equal(maintenanceIds.size, 3, 'All 3 records must have unique IDs generated by SHA-256');

    // Re-import must remain idempotent
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{ text: diffStatusAndMetaJsonPayload }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, initialCountBeforeStatusMeta + 3, 'Re-importing status/metadata variants must be idempotent');

    // Critical assertion: verify incomingManager financial ledger was never touched
    assert.equal(incomingManager.incomings.length, 1);
    assert.equal(incomingManager.incomings[0].id, 'inc1');

    dom.window.close();
});

test('P1-2: appService.submitWorkForm returns the exact Promise returned by bound appInstance', async () => {
    let capturedEvent = null;
    const expectedPromise = Promise.resolve('submission_ok');

    const fakeApp = {
        submitWorkForm(event) {
            capturedEvent = event;
            return expectedPromise;
        }
    };

    appService.bind(fakeApp);
    const mockEvt = { preventDefault() {} };
    const returnedPromise = appService.submitWorkForm(mockEvt);

    assert.equal(returnedPromise, expectedPromise, 'appService.submitWorkForm must return exact Promise from appInstance');
    assert.equal(capturedEvent, mockEvt);

    appService.unbind();
    assert.equal(appService.submitWorkForm(mockEvt), undefined, 'When unbound, returns undefined gracefully');
});

test('P1-2: WorkEditorModal component submits through form and enforces isSubmitting button state with controllable Promise', async () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
            <body>
                <div id="workAppEditorRoot"></div>
            </body>
        </html>
    `, { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    let resolveSave = null;
    let rejectSave = null;
    let saveCount = 0;

    const fakeApp = {
        _isSubmittingWork: false,
        submitWorkForm: async (event) => {
            if (event?.preventDefault) event.preventDefault();
            if (fakeApp._isSubmittingWork) return;
            fakeApp._isSubmittingWork = true;
            saveCount++;

            try {
                return await new Promise((resolve, reject) => {
                    resolveSave = () => {
                        resolve({ id: 'saved-id' });
                    };
                    rejectSave = (err) => {
                        reject(err);
                    };
                });
            } catch (err) {
                // Mimics App.prototype.submitWorkForm catching error and showing toast
                console.error('[App] Hiba a munka mentése során:', err);
            } finally {
                fakeApp._isSubmittingWork = false;
            }
        }
    };

    appService.bind(fakeApp);

    const root = createRoot(document.getElementById('workAppEditorRoot'));
    const { act } = React;
    await act(async () => {
        root.render(React.createElement(WorkEditorModal));
    });

    const form = document.getElementById('workForm');
    const submitBtn = document.getElementById('btnSaveWorkModal');

    assert.equal(submitBtn.disabled, false);
    assert.ok(submitBtn.textContent.includes('Mentés'));

    // Step 1: Trigger first form submit event on #workForm
    act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // While Promise is pending, verify Save button is disabled, loading indicator is visible, and shows in-flight label
    assert.equal(submitBtn.disabled, true, 'Save button must be disabled while in-flight');
    assert.ok(submitBtn.textContent.includes('Mentés folyamatban...'), 'Button must show in-flight text');
    const loadingSpinner = submitBtn.querySelector('.fa-spinner.fa-spin');
    assert.ok(loadingSpinner, 'Loading spinner icon must be visible while save is in-flight');
    assert.equal(saveCount, 1);

    // Step 2: Trigger second form submit event while first is still pending
    act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Verify second submit was blocked and did not initiate another save
    assert.equal(saveCount, 1, 'Second submit while pending must be blocked');
    assert.equal(submitBtn.disabled, true);

    // Step 3: Resolve the pending save Promise
    await act(async () => {
        resolveSave();
    });

    // Verify Save button is restored to enabled and displays normal label
    assert.equal(submitBtn.disabled, false, 'Save button must be re-enabled after completion');
    assert.ok(submitBtn.textContent.includes('Mentés'));
    assert.ok(!submitBtn.textContent.includes('Mentés folyamatban...'));
    assert.equal(saveCount, 1, 'Exactly one save was performed');

    // Step 4: Test rejection recovery via #workForm submission
    act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(submitBtn.disabled, true);
    assert.equal(saveCount, 2);

    // Reject the save Promise
    await act(async () => {
        rejectSave(new Error('Network error on save'));
    });

    // Verify button state is restored after rejection
    assert.equal(submitBtn.disabled, false, 'Save button must be re-enabled after rejection');
    assert.ok(submitBtn.textContent.includes('Mentés'));

    // Step 5: Verify subsequent form submission succeeds after previous rejection
    act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(saveCount, 3);
    assert.equal(submitBtn.disabled, true);

    await act(async () => {
        resolveSave();
    });
    assert.equal(submitBtn.disabled, false);

    await act(async () => {
        root.unmount();
    });
    appService.unbind();
    dom.window.close();
});

test('P1-2: App.prototype.submitWorkForm real production method prevents duplicate submissions and manages lock', async () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
            <body>
                <div id="workAppEditorRoot"></div>
            </body>
        </html>
    `, { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const db = createMockDb();
    const workLogManager = new WorkLogManager(db, null);

    let saveCount = 0;
    let saveDelayMs = 40;
    let shouldSaveThrow = false;
    const origSave = workLogManager.save.bind(workLogManager);
    workLogManager.save = async (data) => {
        saveCount++;
        if (saveDelayMs > 0) {
            await new Promise(r => setTimeout(r, saveDelayMs));
        }
        if (shouldSaveThrow) {
            throw new Error('Simulated DB failure on save');
        }
        return origSave(data);
    };

    // Instantiate real production App method using Object.create(App.prototype)
    // without triggering background timers or full service initialization
    const app = Object.create(App.prototype);
    Object.assign(app, {
        workLogManager,
        _isSubmittingWork: false,
        hmiNotif: { showToast: () => {} },
        updateReactStore: () => {},
        closeWorkModal: () => {}
    });

    // Bind real app to appService
    appService.bind(app);

    const root = createRoot(document.getElementById('workAppEditorRoot'));
    const { act } = React;
    await act(async () => {
        root.render(React.createElement(WorkEditorModal));
    });

    const submitBtn = document.getElementById('btnSaveWorkModal');
    assert.equal(submitBtn.disabled, false);

    // Populate inputs rendered by WorkEditorModal
    document.getElementById('workNameInput').value = 'Iroda Festés';
    document.getElementById('workDateInput').value = '2026-11-05';
    document.getElementById('workDurationInput').value = '3';

    // Scenario 1: Two rapid concurrent calls to REAL production App.prototype.submitWorkForm
    const p1 = app.submitWorkForm();
    assert.equal(app._isSubmittingWork, true, 'Lock must be active while submission Promise is pending');

    const p2 = app.submitWorkForm(); // Second submission while first is still pending
    await Promise.all([p1, p2]);

    assert.equal(saveCount, 1, 'REAL App.prototype.submitWorkForm must execute save exactly once');
    assert.equal(workLogManager.works.length, 1, 'Exactly one record created in DB');
    assert.equal(app._isSubmittingWork, false, 'Lock must be released after completion');

    // Scenario 2: Subsequent valid submission succeeds after completion
    document.getElementById('workIdInput').value = '';
    document.getElementById('workNameInput').value = 'Második Munka';
    document.getElementById('workDateInput').value = '2026-11-05';
    await app.submitWorkForm();
    assert.equal(saveCount, 2);
    assert.equal(workLogManager.works.length, 2);

    // Scenario 3: Real appService.submitWorkForm propagates the Promise and WorkEditorModal manages isSubmitting
    document.getElementById('workIdInput').value = '';
    document.getElementById('workNameInput').value = 'Harmadik Munka React';
    document.getElementById('workDateInput').value = '2026-11-06';

    const form = document.getElementById('workForm');
    await act(async () => {
        const subP1 = appService.submitWorkForm(new Event('submit', { cancelable: true }));
        const subP2 = appService.submitWorkForm(new Event('submit', { cancelable: true }));
        await Promise.all([subP1, subP2]);
    });

    assert.equal(saveCount, 3, 'Concurrent UI submits must only save once');
    assert.equal(workLogManager.works.length, 3);
    assert.equal(app._isSubmittingWork, false);
    assert.equal(submitBtn.disabled, false, 'Save button must be re-enabled after save finishes');

    // Scenario 4: Failed save Promise releases lock and restores button state
    shouldSaveThrow = true;
    document.getElementById('workIdInput').value = '';
    document.getElementById('workNameInput').value = 'Hibás Munka';
    document.getElementById('workDateInput').value = '2026-11-07';

    await act(async () => {
        const pFail = appService.submitWorkForm(new Event('submit', { cancelable: true }));
        await pFail.catch(() => {});
    });

    assert.equal(app._isSubmittingWork, false, 'Lock must be released even when save Promise rejects');
    assert.equal(submitBtn.disabled, false, 'Save button must be re-enabled even on failure');

    // Scenario 5: Subsequent submission succeeds after previous failure
    shouldSaveThrow = false;
    document.getElementById('workIdInput').value = '';
    document.getElementById('workNameInput').value = 'Sikeres Munka Hiba Után';
    document.getElementById('workDateInput').value = '2026-11-08';
    await app.submitWorkForm();
    assert.equal(saveCount, 5);
    assert.equal(workLogManager.works.length, 4);

    await act(async () => {
        root.unmount();
    });
    appService.unbind();
    dom.window.close();
});

test('P1-3: WorkLogManager.save strictly preserves original persisted created_at timestamp and metadata', async () => {
    const db = createMockDb();
    const workLogManager = new WorkLogManager(db, null);

    // 1. Create a new work record
    const createdRecord = await workLogManager.save({
        name: 'Kezdeti Munka',
        date: '2026-11-01',
        duration: 2,
        status: 'folyamatban',
        customMetadata: 'audit-tag-42'
    });

    assert.ok(createdRecord.id, 'Record should receive a UUID');
    assert.ok(createdRecord.created_at, 'Record should receive created_at');
    const initialCreatedAt = createdRecord.created_at;

    await new Promise(r => setTimeout(r, 15));

    // 2. Edit the record without passing created_at (UI submit)
    const updatedRecord1 = await workLogManager.save({
        id: createdRecord.id,
        name: 'Módosított Munka 1',
        date: '2026-11-02',
        duration: 3,
        status: 'elvégzett'
    });

    assert.equal(updatedRecord1.id, createdRecord.id);
    assert.equal(updatedRecord1.created_at, initialCreatedAt, 'Original created_at must be preserved when omitted');
    assert.equal(updatedRecord1.customMetadata, 'audit-tag-42', 'Existing metadata preserved');

    // 3. Edit the record while attempting to pass a different created_at: original must take precedence!
    const updatedRecord2 = await workLogManager.save({
        id: createdRecord.id,
        name: 'Módosított Munka 2',
        created_at: '2020-01-01T00:00:00.000Z' // Attempt to overwrite
    });

    assert.equal(updatedRecord2.created_at, initialCreatedAt, 'Persisted original created_at must take precedence over replacement');

    // 4. Test legacy record without created_at does NOT receive an invented historical timestamp
    const legacyRecord = {
        id: 'legacy-work-100',
        name: 'Legacy Munka',
        date: '2026-10-01',
        duration: 1,
        status: 'elvégzett'
        // no created_at
    };
    await db.save('works', legacyRecord);
    await workLogManager.load();

    const editedLegacy = await workLogManager.save({
        id: 'legacy-work-100',
        name: 'Legacy Munka Frissítve'
    });
    assert.equal(editedLegacy.name, 'Legacy Munka Frissítve');
    assert.equal(editedLegacy.created_at, undefined, 'Legacy record without created_at must not have a fake date fabricated');
    assert.ok(editedLegacy.updated_at);

    // 5. Database compatibility: verify save retrieves persisted record via getAll('works') even if in-memory cache is stale or empty
    workLogManager.works = []; // Deliberately clear in-memory cache to simulate stale state
    const editedFromDb = await workLogManager.save({
        id: createdRecord.id,
        name: 'Módosított Közvetlen DB Olvasással'
    });
    assert.equal(editedFromDb.name, 'Módosított Közvetlen DB Olvasással');
    assert.equal(editedFromDb.created_at, initialCreatedAt, 'Must preserve original created_at from database adapter despite empty cache');
    assert.equal(editedFromDb.customMetadata, 'audit-tag-42');

    // 6. Atomic Transaction Update & Rollback Verification:
    // Verify that atomic transaction executes via runTransaction and commits
    const atomicRecord = await workLogManager.save({
        name: 'Atomic Test Work',
        date: '2026-11-08',
        duration: 2,
        status: 'folyamatban'
    });
    const atomicCreatedAt = atomicRecord.created_at;

    // Simulate updating via atomic transaction
    const updatedAtomic = await workLogManager.save({
        id: atomicRecord.id,
        name: 'Atomic Test Work Updated',
        duration: 3
    });
    assert.equal(updatedAtomic.created_at, atomicCreatedAt);
    assert.equal(updatedAtomic.duration, 3);

    // Verify transaction failure / rollback leaves original persisted record untouched
    const origRunTx = db.runTransaction.bind(db);
    db.runTransaction = async (storeNames, mode, txFn) => {
        return Promise.reject(new Error('Simulated atomic transaction commit failure'));
    };

    await assert.rejects(
        () => workLogManager.save({
            id: atomicRecord.id,
            name: 'This update must fail and rollback'
        }),
        /Simulated atomic transaction commit failure/
    );

    // Restore runTransaction and verify that original record remains completely unchanged
    db.runTransaction = origRunTx;
    await workLogManager.load();
    const untouched = workLogManager.works.find(w => w.id === atomicRecord.id);
    assert.equal(untouched.name, 'Atomic Test Work Updated');
    assert.equal(untouched.duration, 3);
    assert.equal(untouched.created_at, atomicCreatedAt);
});

test('P1-3: Native IndexedDB IDBRequest path and atomic transaction rollback in WorkLogManager.save', async () => {
    // Setup real IndexedDB environment using fake-indexeddb
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    dom.window.indexedDB = globalThis.indexedDB;
    dom.window.IDBKeyRange = globalThis.IDBKeyRange;
    globalThis.window = dom.window;

    const realDb = new Database();
    await realDb.connect();
    assert.equal(realDb.isMock, undefined, 'Real IndexedDB instance must connect, not fallback to mock');

    const workLogManager = new WorkLogManager(realDb, null);
    await workLogManager.load();

    // 1. Insert new entry via real Database.save
    const created = await workLogManager.save({
        name: 'Native IDB Task',
        date: '2026-11-08',
        duration: 2,
        status: 'folyamatban'
    });
    assert.ok(created.id);
    assert.ok(created.created_at);
    const initialCreatedAt = created.created_at;

    // 2. Update entry exercising native IDBRequest get & put path inside runTransaction
    const updated = await workLogManager.save({
        id: created.id,
        name: 'Native IDB Task Updated',
        duration: 4
    });
    assert.equal(updated.name, 'Native IDB Task Updated');
    assert.equal(updated.duration, 4);
    assert.equal(updated.created_at, initialCreatedAt, 'Must preserve original created_at via native IDBRequest flow');

    // 3. Verify that reading from database directly confirms persisted update
    const reloadedRecords = await realDb.getAll('works');
    const persisted = reloadedRecords.find(w => w.id === created.id);
    assert.ok(persisted);
    assert.equal(persisted.name, 'Native IDB Task Updated');
    assert.equal(persisted.duration, 4);
    assert.equal(persisted.created_at, initialCreatedAt);

    // 4. Verify genuine IDBRequest read error triggers IDBRequest.onerror, aborts transaction, and rejects save()
    let idbOnErrorExecuted = false;
    const nativeDb = realDb.db;
    const origTransaction = nativeDb.transaction.bind(nativeDb);
    nativeDb.transaction = function (storeNames, mode) {
        const tx = origTransaction(storeNames, mode);
        const origObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = function (name) {
            const store = origObjectStore(name);
            if (name === 'works') {
                store.get = function (_key) {
                    const errReq = {
                        result: undefined,
                        error: new DOMException('Simulated IDB hardware read failure', 'DataError'),
                        readyState: 'done',
                        onsuccess: null,
                        onerror: null
                    };
                    queueMicrotask(() => {
                        idbOnErrorExecuted = true;
                        if (typeof errReq.onerror === 'function') {
                            errReq.onerror({ target: errReq });
                        }
                    });
                    return errReq;
                };
            }
            return store;
        };
        return tx;
    };

    // Attempting to edit 'created.id' must abort and reject because of IDBRequest read error
    await assert.rejects(
        () => workLogManager.save({
            id: created.id,
            name: 'Corrupted Read Name Change Attempt'
        }),
        /Transaction aborted|Simulated IDB hardware read failure/
    );

    assert.equal(idbOnErrorExecuted, true, 'IDBRequest.onerror handler must be executed');

    // Restore original native transaction method
    nativeDb.transaction = origTransaction;

    // Verify persisted record in IndexedDB was completely untouched by the aborted transaction
    await workLogManager.load();
    const unchangedAfterReadFailure = workLogManager.works.find(w => w.id === created.id);
    assert.equal(unchangedAfterReadFailure.name, 'Native IDB Task Updated');
    assert.equal(unchangedAfterReadFailure.duration, 4);
    assert.equal(unchangedAfterReadFailure.created_at, initialCreatedAt);

    // 5. Verify transaction failure/rollback leaves persisted record unchanged
    const origRunTx = realDb.runTransaction.bind(realDb);
    realDb.runTransaction = async (storeNames, mode, txFn) => {
        throw new Error('Simulated IDB transaction crash');
    };

    await assert.rejects(
        () => workLogManager.save({
            id: created.id,
            name: 'Crashed Update Attempt'
        }),
        /Simulated IDB transaction crash/
    );

    realDb.runTransaction = origRunTx;
    await workLogManager.load();
    const unchangedAfterCrash = workLogManager.works.find(w => w.id === created.id);
    assert.equal(unchangedAfterCrash.name, 'Native IDB Task Updated');
    assert.equal(unchangedAfterCrash.duration, 4);

    dom.window.close();
});
