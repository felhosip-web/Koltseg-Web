import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DataExportController } from '../js/data-export-controller.js';
import { Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { WorkLogManager } from '../js/work-log.js';

const withDom = async (run) => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost/'
    });
    const previousGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        confirm: globalThis.confirm,
        FileReader: globalThis.FileReader
    };

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    try {
        await run(dom);
    } finally {
        dom.window.close();
        for (const [key, value] of Object.entries(previousGlobals)) {
            if (value === undefined) {
                delete globalThis[key];
            } else {
                globalThis[key] = value;
            }
        }
    }
};

test('sync validates each Work Log record and continues valid records when others are invalid', async () => {
    await withDom(async () => {
        const db = new Database();
        db._enableMockDb();
        await db.save('works', {
            id: 'keep-existing',
            name: 'Existing local work',
            date: '2026-11-20',
            duration: 2,
            status: 'folyamatban'
        });

        const syncService = new SyncService({ useSupabase: false }, { getPendingCount: () => 0 });
        syncService.setApp({ db });

        const invalidWorks = [
            { id: 'bad-date', name: 'Bad date', date: 'not-a-date', duration: 1, status: 'folyamatban' },
            { id: 'bad-duration', name: 'Bad duration', date: '2026-11-20', duration: -1, status: 'folyamatban' },
            { id: 'bad-status', name: 'Bad status', date: '2026-11-20', duration: 1, status: 'unknown' },
            { id: 'bad-description', name: 'Bad description', date: '2026-11-20', duration: 1, status: 'folyamatban', description: { text: 'not text' } },
            { id: 'bad-location', name: 'Bad location', date: '2026-11-20', duration: 1, status: 'folyamatban', location: 42 },
            { id: 'keep-existing', name: 'Invalid replacement', date: '2026-11-20', duration: -1, status: 'folyamatban' }
        ];
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (...args) => warnings.push(args);

        try {
            await syncService._saveMergedToLocal({
                works: [
                    ...invalidWorks,
                    { id: 'legacy-work', name: 'Legacy work', date: '2026-11-19' },
                    { id: 'valid-work', name: 'Valid work', date: '2026-11-20', duration: 3, status: 'elvégzett' }
                ],
                items: [{ id: 'valid-item', name: 'Unrelated valid item' }]
            });
        } finally {
            console.warn = originalWarn;
        }

        const savedWorks = await db.getAll('works');
        const savedById = new Map(savedWorks.map(work => [work.id, work]));
        assert.deepEqual(
            [...savedById.keys()].sort(),
            ['keep-existing', 'legacy-work', 'valid-work'].sort()
        );
        assert.equal(savedById.get('keep-existing').name, 'Existing local work');
        assert.equal(savedById.get('legacy-work').date, '2026-11-19');
        assert.equal('duration' in savedById.get('legacy-work'), false);
        assert.equal('status' in savedById.get('legacy-work'), false);
        assert.equal('description' in savedById.get('legacy-work'), false);
        assert.equal('location' in savedById.get('legacy-work'), false);
        assert.equal(savedById.get('valid-work').status, 'elvégzett');
        assert.equal((await db.getAll('items'))[0].name, 'Unrelated valid item');
        assert.equal(warnings.filter(([message]) => String(message).includes('Helyi mentési hiba a(z) works táblánál')).length, invalidWorks.length);
    });
});

test('Work Log JSON import defaults only missing status and rejects explicit malformed statuses per record', async () => {
    await withDom(async () => {
        const db = new Database();
        db._enableMockDb();
        const workLogManager = new WorkLogManager(db, null);
        const messages = [];
        const controller = new DataExportController({
            workLogManager,
            updateReactStore: () => {},
            hmiNotif: {
                showInfo: async (title, message) => messages.push({ title, message })
            }
        });

        let fileInput = null;
        const createElement = document.createElement.bind(document);
        document.createElement = (tagName, ...args) => {
            const element = createElement(tagName, ...args);
            if (tagName === 'input') {
                element.click = () => { fileInput = element; };
            }
            return element;
        };

        const readers = [];
        globalThis.FileReader = class MockFileReader {
            readAsText(file) {
                this.pending = this.onload({ target: { result: file.text } });
                readers.push(this);
            }
        };
        globalThis.confirm = () => true;

        const works = [
            { name: 'Missing status', date: '2026-11-20', duration: 1 },
            { name: 'In progress', date: '2026-11-20', duration: 1, status: 'folyamatban' },
            { name: 'Completed', date: '2026-11-20', duration: 1, status: 'elvégzett' },
            { name: 'Failed', date: '2026-11-20', duration: 1, status: 'meghiúsult' },
            { name: 'Null status', date: '2026-11-20', duration: 1, status: null },
            { name: 'Numeric status', date: '2026-11-20', duration: 1, status: 2 },
            { name: 'Object status', date: '2026-11-20', duration: 1, status: { value: 'folyamatban' } },
            { name: 'Boolean status', date: '2026-11-20', duration: 1, status: false },
            { name: 'Unknown status', date: '2026-11-20', duration: 1, status: 'blocked' }
        ];

        controller.importWorkJson();
        assert.ok(fileInput);
        fileInput.onchange({ target: { files: [{ text: JSON.stringify({ works }) }] } });
        await readers[0].pending;

        const savedWorks = workLogManager.works;
        assert.equal(savedWorks.length, 4);
        assert.deepEqual(
            savedWorks.map(work => work.status).sort(),
            ['elvégzett', 'folyamatban', 'folyamatban', 'meghiúsult'].sort()
        );
        assert.equal(savedWorks.find(work => work.name === 'Missing status').status, 'folyamatban');
        assert.equal(messages.at(-1).title, 'Részleges importálás');
        assert.match(messages.at(-1).message, /4 sikeres, 5 sikertelen/);
        assert.match(messages.at(-1).message, /Null status/);
        assert.match(messages.at(-1).message, /Unknown status/);
    });
});
