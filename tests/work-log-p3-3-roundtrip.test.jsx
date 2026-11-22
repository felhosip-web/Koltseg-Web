import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DataExportController } from '../js/data-export-controller.js';
import { WorkLogManager } from '../js/work-log.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/'
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

function createWorkDb(initialWorks = []) {
    const records = new Map(initialWorks.map(work => [String(work.id), { ...work }]));
    return {
        records,
        getAll: async table => table === 'works'
            ? Array.from(records.values()).map(work => ({ ...work }))
            : [],
        save: async (table, record) => {
            if (table === 'works') records.set(String(record.id), { ...record });
            return record.id;
        },
        runTransaction: async (_tables, _mode, callback) => {
            const store = {
                get: (id, onResult) => onResult(records.get(String(id)) || null),
                put: record => records.set(String(record.id), { ...record }),
                delete: id => records.delete(String(id))
            };
            callback({ abort() {} }, { works: store });
        }
    };
}

function createApp(workLogManager) {
    return {
        workLogManager,
        setSystemStatus: () => {},
        updateReactStore: () => {},
        hmiNotif: {
            showInfo: async () => {},
            showToast: () => {}
        }
    };
}

function createWork(id, description, location) {
    return {
        id,
        name: `Munka ${id}`,
        description,
        location,
        date: '2026-11-01',
        duration: 1,
        status: 'folyamatban'
    };
}

test('Work Log JSON export/import and XLSX export preserve text content and existing trimming', async () => {
    const legacyWork = {
        id: 'legacy',
        name: 'Munka legacy',
        date: '2026-11-01',
        duration: 1,
        status: 'elvégzett'
    };
    const sourceWorks = [
        createWork('lf', 'Első sor\nMásodik sor', 'Szeged'),
        createWork('crlf', 'Első sor\r\nMásodik sor', 'Pécs'),
        createWork('multiline-location', 'Egysoros leírás', 'Budapest\r\nDebrecen'),
        createWork('comma', 'Első, második, harmadik', 'Budapest, Magyarország'),
        createWork('quotes', 'A "pontos" idézet', '"Központ"'),
        createWork('combined', 'Árvíztűrő, "tükörfúrógép"\nKövetkező sor', 'Budapest,\n"Belváros"'),
        createWork('accented', 'Árvíztűrő tükörfúrógép; ő, ű, á, é, í, ó, ö, ü', 'Győr'),
        createWork('empty', '', ''),
        createWork('whitespace', ' \t \n ', ' \r\n\t '),
        legacyWork
    ];
    const sourceManager = new WorkLogManager(createWorkDb(sourceWorks), null);
    await sourceManager.load();
    const controller = new DataExportController(createApp(sourceManager));

    const originalCreateElement = document.createElement.bind(document);
    const previousBlob = globalThis.Blob;
    const previousURL = globalThis.URL;
    const previousXLSX = globalThis.XLSX;
    const previousFileReader = globalThis.FileReader;
    const previousConfirm = globalThis.confirm;

    let exportBlob;
    let inputOnChange;
    let fileReadPromise;
    let excelFile;
    const excelSheets = [];

    try {
        globalThis.Blob = class {
            constructor(parts, options) {
                this.parts = parts;
                this.options = options;
                exportBlob = this;
            }
        };
        globalThis.URL = {
            createObjectURL: () => 'blob:work-log-test',
            revokeObjectURL: () => {}
        };
        globalThis.XLSX = {
            utils: {
                book_new: () => ({ Sheets: {}, SheetNames: [] }),
                aoa_to_sheet: data => ({ data }),
                book_append_sheet: (workbook, sheet, name) => {
                    workbook.Sheets[name] = sheet;
                    workbook.SheetNames.push(name);
                    excelSheets.push(sheet);
                }
            },
            writeFile: (workbook, filename) => {
                excelFile = { workbook, filename };
            }
        };
        globalThis.FileReader = class {
            readAsText(file) {
                fileReadPromise = new Promise((resolve, reject) => {
                    setTimeout(async () => {
                        try {
                            await this.onload({ target: { result: file.text } });
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    }, 0);
                });
            }
        };
        globalThis.confirm = () => true;
        document.createElement = tag => {
            const element = originalCreateElement(tag);
            if (tag === 'a') {
                Object.defineProperty(element, 'click', { value: () => {} });
            } else if (tag === 'input') {
                Object.defineProperty(element, 'click', {
                    value: () => { inputOnChange = element.onchange; }
                });
            }
            return element;
        };

        await controller.exportWorkExcel();
        assert.ok(excelFile, 'XLSX export should produce a workbook');
        assert.equal(excelSheets.length, 1);
        const worksheetRows = excelFile.workbook.Sheets['Munka Nyilvántartás'].data;
        const sourceByName = new Map(sourceWorks.map(work => [work.name, work]));
        for (const row of worksheetRows.slice(1)) {
            const source = sourceByName.get(row[1]);
            assert.equal(row[2], source.description || '');
            assert.equal(row[3], source.location || '');
        }

        await controller.exportWorkJson();
        assert.ok(exportBlob, 'JSON export should produce a blob');
        const exportedJson = exportBlob.parts[0];
        const exportedData = JSON.parse(exportedJson);
        const exportedById = new Map(exportedData.works.map(work => [work.id, work]));
        assert.equal(exportedById.get('lf').description, 'Első sor\nMásodik sor');
        assert.equal(exportedById.get('crlf').description, 'Első sor\r\nMásodik sor');
        assert.equal(exportedById.get('multiline-location').location, 'Budapest\r\nDebrecen');
        assert.equal(exportedById.get('comma').description, 'Első, második, harmadik');
        assert.equal(exportedById.get('quotes').description, 'A "pontos" idézet');
        assert.equal(exportedById.get('combined').description, 'Árvíztűrő, "tükörfúrógép"\nKövetkező sor');
        assert.equal(exportedById.get('accented').description, 'Árvíztűrő tükörfúrógép; ő, ű, á, é, í, ó, ö, ü');
        assert.equal(Object.hasOwn(exportedById.get('legacy'), 'description'), false);
        assert.equal(Object.hasOwn(exportedById.get('legacy'), 'location'), false);

        const importedManager = new WorkLogManager(createWorkDb(), null);
        const importController = new DataExportController(createApp(importedManager));
        importController.importWorkJson();
        assert.equal(typeof inputOnChange, 'function');
        inputOnChange({ target: { files: [{ text: exportedJson }] } });
        await fileReadPromise;

        const importedById = new Map(importedManager.works.map(work => [work.id, work]));
        for (const id of ['lf', 'crlf', 'multiline-location', 'comma', 'quotes', 'combined', 'accented', 'empty']) {
            const expected = sourceByName.get(`Munka ${id}`);
            assert.equal(importedById.get(id).description, expected.description);
            assert.equal(importedById.get(id).location, expected.location);
        }
        assert.equal(importedById.get('whitespace').description, '');
        assert.equal(importedById.get('whitespace').location, '');
        assert.equal(importedById.get('legacy').description, '');
        assert.equal(importedById.get('legacy').location, '');
    } finally {
        document.createElement = originalCreateElement;
        globalThis.Blob = previousBlob;
        globalThis.URL = previousURL;
        globalThis.XLSX = previousXLSX;
        globalThis.FileReader = previousFileReader;
        globalThis.confirm = previousConfirm;
    }
});

test('Work Log PDF export keeps its existing description newline formatting', async () => {
    let pdfOptions;
    const workLogManager = {
        works: [
            createWork('lf', 'Első sor\nMásodik sor', 'Budapest\nDebrecen'),
            createWork('crlf', 'Első sor\r\nMásodik sor', 'Pécs')
        ]
    };
    const previousJspdf = globalThis.jspdf;
    globalThis.jspdf = {
        jsPDF: class {
            addFont() {}
            setFont() {}
            setFontSize() {}
            text() {}
            autoTable(options) { pdfOptions = options; }
            save() {}
        }
    };

    try {
        await new DataExportController(createApp(workLogManager)).exportWorkPdf();
        assert.equal(pdfOptions.body[0][2], 'Első sor Második sor');
        assert.equal(pdfOptions.body[0][3], 'Budapest\nDebrecen');
        assert.equal(pdfOptions.body[1][2], 'Első sor\r Második sor');
    } finally {
        globalThis.jspdf = previousJspdf;
    }
});
