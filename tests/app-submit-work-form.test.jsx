import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database } from '../js/oop-core.js';
import { WorkLogManager } from '../js/work-log.js';

test('App.prototype.submitWorkForm — invokes REAL production method and saves work data via workLogManager', async () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
            <form id="workEditorForm">
                <input id="workIdInput" value="" />
                <input id="workNameInput" value="Iroda Festés" />
                <textarea id="workDescriptionInput">Teljes felújítás</textarea>
                <input id="workLocationInput" value="Budapest" />
                <input id="workDateInput" value="2026-10-05" />
                <input id="workDurationInput" value="4" />
                <select id="workStatusInput"><option value="folyamatban" selected>folyamatban</option></select>
            </form>
        </body>
        </html>
    `, { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }] = await Promise.all([
        import('../js/app.js')
    ]);

    const db = new Database();
    db._enableMockDb();

    const mockSyncService = { push: async () => {} };
    const workLogManager = new WorkLogManager(db, mockSyncService);

    let saveCalledWith = null;
    const originalSave = workLogManager.save.bind(workLogManager);
    workLogManager.save = async (data) => {
        saveCalledWith = data;
        return await originalSave(data);
    };

    let updateReactStoreCalled = false;
    let closeWorkModalCalled = false;
    let toastMessage = null;

    const app = Object.create(App.prototype);
    Object.assign(app, {
        workLogManager,
        updateReactStore: () => { updateReactStoreCalled = true; },
        closeWorkModal: () => { closeWorkModalCalled = true; },
        hmiNotif: { showToast: (msg) => { toastMessage = msg; } }
    });

    const event = new dom.window.Event('submit', { cancelable: true });
    await app.submitWorkForm(event);

    assert.ok(saveCalledWith, 'workLogManager.save should have been called');
    assert.equal(saveCalledWith.name, 'Iroda Festés');
    assert.equal(saveCalledWith.description, 'Teljes felújítás');
    assert.equal(saveCalledWith.location, 'Budapest');
    assert.equal(saveCalledWith.date, '2026-10-05');
    assert.equal(saveCalledWith.duration, 4);
    assert.equal(saveCalledWith.status, 'folyamatban');

    assert.equal(updateReactStoreCalled, true, 'updateReactStore should be called after save');
    assert.equal(closeWorkModalCalled, true, 'closeWorkModal should be called after save');
    assert.ok(toastMessage && toastMessage.includes('sikeresen mentve'), 'Success toast should be shown');

    assert.equal(workLogManager.works.length, 1);
    assert.equal(workLogManager.works[0].name, 'Iroda Festés');

    dom.window.close();
});
