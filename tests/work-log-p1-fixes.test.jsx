import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkLogManager } from '../js/work-log.js';
import { DataExportController } from '../js/data-export-controller.js';
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

test('P1-1: Work Log Export/Import operations target workLogManager and preserve financial ledger', async () => {
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

    let reportedInfo = null;
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
            showInfo: async (title, msg) => { reportedInfo = { title, msg }; },
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

    // 4. Test JSON import with malformed data is rejected safely
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

    // Test importing invalid file missing 'works'
    reportedInfo = null;
    exportController.importWorkJson();
    fileInputOnChange({ target: { files: [{ text: JSON.stringify({ wrongKey: [] }) }] } });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(reportedInfo?.title, 'Érvénytelen fájl');

    // Test importing valid work entries into workLogManager
    const importData = {
        works: [
            { id: 'w3', name: 'Új Munka 3', description: 'Leírás 3', location: 'Szeged', date: '2026-11-03', duration: 4, status: 'folyamatban' }
        ]
    };

    globalThis.confirm = () => true;
    exportController.importWorkJson();
    fileInputOnChange({ target: { files: [{ text: JSON.stringify(importData) }] } });
    await new Promise(r => setTimeout(r, 20));

    assert.equal(reportedInfo?.title, 'Sikeres importálás');
    assert.equal(workLogManager.works.length, 3);
    assert.ok(workLogManager.works.some(w => w.name === 'Új Munka 3'));

    // Critical assertion: verify incomingManager financial ledger was never touched
    assert.equal(incomingManager.incomings.length, 1);
    assert.equal(incomingManager.incomings[0].id, 'inc1');

    dom.window.close();
});

test('P1-2: In-flight submission guards prevent duplicate work records on concurrent submits', async () => {
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
    const origSave = workLogManager.save.bind(workLogManager);
    workLogManager.save = async (data) => {
        saveCount++;
        // Artificial async delay to test concurrency
        await new Promise(r => setTimeout(r, 40));
        return origSave(data);
    };

    // Concrete lightweight App-like harness testing submitWorkForm locking logic
    const appHarness = {
        workLogManager,
        _isSubmittingWork: false,
        updateReactStore: () => {},
        closeWorkModal: () => {},
        hmiNotif: { showToast: () => {} },
        async submitWorkForm(event) {
            if (event?.preventDefault) event.preventDefault();
            if (this._isSubmittingWork) {
                return;
            }
            this._isSubmittingWork = true;

            try {
                const idInput = document.getElementById('workIdInput');
                const nameInput = document.getElementById('workNameInput');
                const descInput = document.getElementById('workDescriptionInput');
                const locInput = document.getElementById('workLocationInput');
                const dateInput = document.getElementById('workDateInput');
                const durInput = document.getElementById('workDurationInput');
                const statusInput = document.getElementById('workStatusInput');

                if (!nameInput || !dateInput) return;
                const nameValue = (nameInput.value || '').trim();
                if (!nameValue) return;

                const workData = {
                    name: nameValue,
                    description: (descInput ? descInput.value : '').trim(),
                    location: (locInput ? locInput.value : '').trim(),
                    date: dateInput.value,
                    duration: Number(durInput ? durInput.value : 1) || 1,
                    status: statusInput ? statusInput.value : 'folyamatban'
                };

                if (idInput && idInput.value) {
                    workData.id = idInput.value;
                }

                await this.workLogManager.save(workData);
                this.updateReactStore();
                this.closeWorkModal();
            } finally {
                this._isSubmittingWork = false;
            }
        }
    };

    appService.bind(appHarness);

    const root = createRoot(document.getElementById('workAppEditorRoot'));
    const { act } = React;
    await act(async () => {
        root.render(React.createElement(WorkEditorModal));
    });

    // Populate inputs rendered by WorkEditorModal
    document.getElementById('workNameInput').value = 'Iroda Festés';
    document.getElementById('workDateInput').value = '2026-11-05';
    document.getElementById('workDurationInput').value = '3';

    const submitBtn = document.getElementById('btnSaveWorkModal');
    assert.equal(submitBtn.disabled, false);

    // 1. Trigger two rapid submissions concurrently on App
    const p1 = appHarness.submitWorkForm();
    const p2 = appHarness.submitWorkForm();
    await Promise.all([p1, p2]);

    assert.equal(saveCount, 1, 'workLogManager.save should only be called once during concurrent submits');
    assert.equal(workLogManager.works.length, 1, 'Exactly one record should be saved in DB');
    assert.equal(appHarness._isSubmittingWork, false, 'In-flight guard should be reset in finally');

    // 2. Test that a subsequent submission succeeds after completion
    document.getElementById('workNameInput').value = 'Második Munka';
    await appHarness.submitWorkForm();
    assert.equal(saveCount, 2);
    assert.equal(workLogManager.works.length, 2);

    // 3. Test React WorkEditorModal form submit concurrency guard
    let modalSubmitsHandled = 0;
    appHarness.submitWorkForm = async () => {
        modalSubmitsHandled++;
        await new Promise(r => setTimeout(r, 40));
    };

    const form = document.getElementById('workForm');
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(modalSubmitsHandled, 1, 'WorkEditorModal isSubmittingRef should block second concurrent submit');

    // 4. Test that a failed save releases the submission lock
    appHarness._isSubmittingWork = false;
    workLogManager.save = async () => {
        await new Promise(r => setTimeout(r, 10));
        throw new Error('Disk failure');
    };

    try {
        await appHarness.submitWorkForm();
    } catch (e) {
        // Expected failure
    }
    assert.equal(appHarness._isSubmittingWork, false, 'Lock must be released even after save throws');

    await act(async () => {
        root.unmount();
    });
    appService.unbind();
    dom.window.close();
});

test('P1-3: WorkLogManager.save preserves exact created_at timestamp and metadata on edit', async () => {
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

    // Small delay to ensure any new timestamp would differ
    await new Promise(r => setTimeout(r, 15));

    // 2. Edit the record without passing created_at (simulating UI submit)
    const updatedRecord = await workLogManager.save({
        id: createdRecord.id,
        name: 'Módosított Munka',
        date: '2026-11-02',
        duration: 3,
        status: 'elvégzett'
    });

    assert.equal(updatedRecord.id, createdRecord.id);
    assert.equal(updatedRecord.name, 'Módosított Munka');
    assert.equal(updatedRecord.created_at, initialCreatedAt, 'Original created_at must be preserved on edit');
    assert.equal(updatedRecord.customMetadata, 'audit-tag-42', 'Unrelated metadata must be preserved on edit');
    assert.ok(new Date(updatedRecord.updated_at).getTime() >= new Date(initialCreatedAt).getTime());

    // 3. Verify IndexedDB persisted state
    const persisted = await db.get('works', createdRecord.id);
    assert.equal(persisted.created_at, initialCreatedAt);
    assert.equal(persisted.customMetadata, 'audit-tag-42');

    // 4. Test legacy record without created_at remains editable without crashing
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
    assert.ok(editedLegacy.updated_at);
});
