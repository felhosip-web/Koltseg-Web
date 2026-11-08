import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
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
        getAll: async (table) => {
            if (table === 'works') return Array.from(store.values());
            return [];
        },
        get: async (table, id) => {
            if (table === 'works') return store.get(String(id)) || null;
            return null;
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

    // Scenario D: Valid JSON where records fail validation (e.g. missing name or date)
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { name: '', date: '2026-11-01' }, // empty name
                        { name: 'Nincs Dátum' }, // missing date
                        null,
                        'invalid string'
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 15));
    assert.equal(reportedInfo?.title, 'Érvénytelen adatok');
    assert.equal(workLogManager.works.length, 1);
    assert.equal(incomingManager.incomings.length, 1);

    // Scenario E: Valid JSON with valid work records imports successfully into workLogManager
    reportedInfo = null;
    globalThis.confirm = () => true;
    exportController.importWorkJson();
    fileInputOnChange({
        target: {
            files: [{
                text: JSON.stringify({
                    works: [
                        { id: 'w2', name: 'Új Munka 2', description: 'Desc 2', location: 'Debrecen', date: '2026-11-02', duration: 3, status: 'elvégzett' }
                    ]
                })
            }]
        }
    });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, 2);
    assert.ok(workLogManager.works.some(w => w.name === 'Új Munka 2'));
    assert.equal(incomingManager.incomings.length, 1, 'Incoming ledger must NEVER be modified by Work Log import');

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

    // While Promise is pending, verify Save button is disabled and shows in-flight label
    assert.equal(submitBtn.disabled, true, 'Save button must be disabled while in-flight');
    assert.ok(submitBtn.textContent.includes('Mentés folyamatban...'), 'Button must show in-flight text');
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
});
