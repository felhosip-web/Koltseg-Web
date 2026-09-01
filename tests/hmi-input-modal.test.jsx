import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { InputModalController } from '../js/input-modal-controller.js';
import HmiInputModal from '../src/components/HmiInputModal.jsx';

function installDom() {
    const dom = new JSDOM('<div id="costAppHmiInputRoot"></div>', {
        url: 'http://localhost/'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLElement.prototype.attachEvent = () => {};
    dom.window.HTMLElement.prototype.detachEvent = () => {};

    return dom;
}

test('input modal controller reports validation failures and completed saves', async () => {
    const calls = [];
    const app = {
        items: {
            items: [{ id: 1, name: 'Existing' }],
            add: async (name, color) => calls.push(['add', name, color]),
            update: async (id, changes) => calls.push(['update', id, changes]),
            load: async () => calls.push(['items.load'])
        },
        months: {
            months: ['2026-08'],
            add: async (month) => calls.push(['month.add', month]),
            load: async () => calls.push(['months.load'])
        },
        hmiNotif: {
            showToast: () => {},
            showConfirm: async () => {}
        },
        renderer: {
            renderTable: () => calls.push(['render'])
        },
        refreshAllTabs: () => calls.push(['refresh'])
    };
    const controller = new InputModalController(app);

    assert.equal(await controller.performSave('item', '   ', '#dbeafe'), false);
    assert.equal(await controller.performSave('item', 'existing', '#dbeafe'), false);
    assert.equal(await controller.performSave('month', '2026-08', '#dbeafe'), false);
    assert.deepEqual(calls, []);

    assert.equal(await controller.performSave('item', '  New item  ', '#d1fae5'), true);
    assert.deepEqual(calls, [
        ['add', 'New item', '#d1fae5'],
        ['items.load'],
        ['render'],
        ['refresh']
    ]);

    calls.length = 0;
    assert.equal(await controller.performRename(1, 'Existing'), true);
    assert.deepEqual(calls, []);

    assert.equal(await controller.performRename(1, '  Renamed  '), true);
    assert.deepEqual(calls, [
        ['update', 1, { name: 'Renamed' }],
        ['items.load'],
        ['render']
    ]);
});

test('React HMI modal uses the local month and closes only after a successful save', async (t) => {
    const dom = installDom();
    const RealDate = globalThis.Date;
    t.after(() => {
        globalThis.Date = RealDate;
        dom.window.close();
    });
    globalThis.Date = class extends RealDate {
        getFullYear() {
            return 2025;
        }

        getMonth() {
            return 11;
        }

        toISOString() {
            return '2026-01-01T00:00:00.000Z';
        }
    };

    let saveResult = false;
    window.app = {
        uiController: {
            inputModal: {
                performSave: async () => saveResult
            }
        }
    };

    const root = createRoot(document.getElementById('costAppHmiInputRoot'));
    await act(async () => {
        root.render(<HmiInputModal />);
    });

    await act(async () => {
        document.dispatchEvent(new CustomEvent('hmi-input-open', {
            detail: { type: 'month' }
        }));
    });

    assert.equal(document.querySelector('input[type="month"]').value, '2025-12');

    const saveButton = [...document.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Mentés');
    await act(async () => {
        saveButton.click();
    });
    assert.ok(document.querySelector('input[type="month"]'));

    saveResult = true;
    await act(async () => {
        saveButton.click();
    });
    assert.equal(document.querySelector('input[type="month"]'), null);

    await act(async () => {
        root.unmount();
    });
});
