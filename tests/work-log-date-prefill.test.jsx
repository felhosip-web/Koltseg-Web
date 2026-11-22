import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const runDatePrefillScenario = (timeZone, instant, expectedDate) => {
    const script = `
        import assert from 'node:assert/strict';
        import { JSDOM } from 'jsdom';
        import { pathToFileURL } from 'node:url';
        import { resolve } from 'node:path';

        const dom = new JSDOM(\`<!DOCTYPE html><html><body>
            <div id="workEditorModal" class="hidden">
                <h3 id="workEditorTitle"></h3>
                <form id="workForm">
                    <input id="workIdInput" type="hidden" />
                    <input id="workNameInput" />
                    <textarea id="workDescriptionInput"></textarea>
                    <input id="workLocationInput" />
                    <input id="workDateInput" type="date" />
                    <input id="workDurationInput" type="number" />
                    <select id="workStatusInput">
                        <option value="folyamatban">Folyamatban</option>
                        <option value="elvégzett">Elvégzett</option>
                    </select>
                    <button id="btnDeleteWork" class="hidden"></button>
                </form>
            </div>
        </body></html>\`);

        globalThis.window = dom.window;
        globalThis.document = dom.window.document;
        window.__DISABLE_AUTO_INIT__ = true;

        const appUrl = pathToFileURL(resolve(process.cwd(), 'js/app.js')).href;
        const workLogUrl = pathToFileURL(resolve(process.cwd(), 'js/work-log.js')).href;
        const [{ App }, { WorkLogManager }] = await Promise.all([
            import(appUrl),
            import(workLogUrl)
        ]);
        const NativeDate = globalThis.Date;
        const fixedInstant = NativeDate.parse(${JSON.stringify(instant)});
        globalThis.Date = class FixedDate extends NativeDate {
            constructor(...args) {
                super(...(args.length ? args : [fixedInstant]));
            }

            static now() {
                return fixedInstant;
            }
        };

        const rows = new Map();
        const db = {
            getAll: async () => [...rows.values()],
            save: async (_table, record) => rows.set(record.id, { ...record }),
            runTransaction: async (_tables, _mode, callback) => {
                const store = {
                    get: (id, onSuccess) => onSuccess(rows.get(id)),
                    put: (record) => rows.set(record.id, { ...record })
                };
                callback({ error: null }, { works: store });
            }
        };
        const workLogManager = new WorkLogManager(db, null);
        const app = Object.assign(Object.create(App.prototype), {
            workLogManager,
            updateReactStore: () => {},
            closeWorkModal: () => {},
            hmiNotif: { showToast: () => {} }
        });

        try {
            app.openWorkModal();
            const dateInput = document.getElementById('workDateInput');
            assert.equal(dateInput.value, ${JSON.stringify(expectedDate)});
            document.getElementById('workNameInput').value = 'New work';
            document.getElementById('workDurationInput').value = '1';
            await app.submitWorkForm();
            assert.equal(workLogManager.works[0].date, ${JSON.stringify(expectedDate)});

            const existingRecord = {
                id: 'existing-work',
                name: 'Existing work',
                description: '',
                location: '',
                date: '2026-10-05',
                duration: 1,
                status: 'folyamatban'
            };
            rows.set(existingRecord.id, existingRecord);
            await workLogManager.load();
            app.openWorkModal(existingRecord.id);
            assert.equal(dateInput.value, existingRecord.date);

            document.getElementById('workNameInput').value = 'Edited work';
            await app.submitWorkForm();
            assert.equal(rows.get(existingRecord.id).date, existingRecord.date);
        } finally {
            globalThis.Date = NativeDate;
            dom.window.close();
        }
    `;

    execFileSync(process.execPath, [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        script
    ], {
        cwd: process.cwd(),
        env: { ...process.env, TZ: timeZone },
        stdio: 'pipe'
    });
};

test('new Work Log date prefill uses local date and preserves it when saved in UTC+14', () => {
    runDatePrefillScenario('Pacific/Kiritimati', '2026-11-22T10:30:00Z', '2026-11-23');
});

test('new Work Log date prefill uses local date and preserves it when saved in UTC-8', () => {
    runDatePrefillScenario('America/Los_Angeles', '2026-11-23T07:30:00Z', '2026-11-22');
});
