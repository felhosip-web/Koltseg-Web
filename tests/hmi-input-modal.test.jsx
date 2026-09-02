import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { InputModalController } from '../js/input-modal-controller.js';

test('performSave reports validation failures and successful persistence', async () => {
    const calls = [];
    const app = {
        items: {
            items: [{ name: 'Existing' }],
            add: async (name, color) => calls.push(['add', name, color]),
            load: async () => calls.push(['load-items'])
        },
        months: {
            months: ['2026-08'],
            add: async month => calls.push(['add-month', month]),
            load: async () => calls.push(['load-months'])
        },
        hmiNotif: {
            showToast: () => {},
            showConfirm: async () => {}
        },
        renderer: {
            renderTable: () => calls.push(['render'])
        },
        refreshAllTabs: async () => calls.push(['refresh'])
    };
    const controller = new InputModalController(app);

    assert.equal(await controller.performSave('item', '   ', '#dbeafe'), false);
    assert.equal(await controller.performSave('item', 'existing', '#dbeafe'), false);
    assert.equal(await controller.performSave('month', 'invalid', '#dbeafe'), false);
    assert.equal(await controller.performSave('month', '2026-08', '#dbeafe'), false);
    assert.equal(await controller.performSave('item', '  New category  ', '#d1fae5'), true);
    assert.deepEqual(calls, [
        ['add', 'New category', '#d1fae5'],
        ['load-items'],
        ['render'],
        ['refresh']
    ]);
});

test('React HMI modal keeps failed creates open and supports rename', async () => {
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

    const [React, { createRoot }, { default: HmiInputModal }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/components/HmiInputModal.jsx')
    ]);
    const { act } = React;
    const root = createRoot(document.getElementById('costAppHmiInputRoot'));
    await act(async () => root.render(React.createElement(HmiInputModal)));

    const inputModal = {
        performSave: async () => false,
        performRename: async (...args) => renameCalls.push(args)
    };
    const renameCalls = [];
    window.app = { uiController: { inputModal } };

    await act(async () => {
        document.dispatchEvent(new CustomEvent('hmi-input-open', { detail: { type: 'item' } }));
    });
    await act(async () => document.querySelectorAll('button')[6].click());
    assert.ok(document.querySelector('.modal'), 'failed validation should leave the modal open');

    inputModal.performSave = async () => true;
    await act(async () => document.querySelectorAll('button')[6].click());
    assert.equal(document.querySelector('.modal'), null);

    const OriginalDate = globalThis.Date;
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    globalThis.Date = class extends OriginalDate {
        constructor(...args) {
            super(...(args.length ? args : ['2026-09-01T00:30:00Z']));
        }
    };
    await act(async () => {
        document.dispatchEvent(new CustomEvent('hmi-input-open', { detail: { type: 'month' } }));
    });
    assert.equal(document.querySelector('input').value, '2026-08');
    globalThis.Date = OriginalDate;
    process.env.TZ = originalTimezone;
    await act(async () => document.querySelectorAll('button')[0].click());

    await act(async () => {
        document.dispatchEvent(new CustomEvent('hmi-input-open', {
            detail: { type: 'rename', itemId: 'item-1', currentName: 'Food' }
        }));
    });
    assert.equal(document.querySelector('h3').textContent, 'Kategória átnevezése');
    assert.equal(document.querySelector('input').value, 'Food');
    await act(async () => document.querySelectorAll('button')[1].click());
    assert.deepEqual(renameCalls, [['item-1', 'Food', 'Food']]);
    assert.equal(document.querySelector('.modal'), null);

    await act(async () => root.unmount());
    dom.window.close();
});
