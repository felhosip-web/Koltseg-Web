import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

function setInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        globalThis.window.HTMLInputElement.prototype,
        'value'
    ).set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

test('IncomingTab reactively consumes Zustand incomings state and calls window.app.incomingRenderer actions', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const [React, { createRoot }, { useAppStore }, { default: IncomingTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/incoming/IncomingTab.jsx')
    ]);

    const { act } = React;

    // Reset Zustand store state
    act(() => {
        useAppStore.setState({ incomings: [] });
    });

    // Mock window.app with incomingRenderer and incomingManager
    let addNewEntryCalls = 0;
    let deleteColCalls = [];
    let deleteRowCalls = [];
    let cellClickCalls = [];

    window.app = {
        incomingManager: {
            getSenders: () => ['Partner A']
        },
        incomingRenderer: {
            addNewEntry: () => { addNewEntryCalls++; },
            deleteColumn: (date) => { deleteColCalls.push(date); },
            deleteRow: (sender) => { deleteRowCalls.push(sender); },
            _handleCellClick: (fakeEl) => { cellClickCalls.push(fakeEl); }
        }
    };

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(IncomingTab));
    });

    // 1. Initially empty incomings table placeholder
    assert.ok(container.textContent.includes('Még nincs rögzített bejövő utalás'));

    // 2. Updating Zustand store incomings directly causes re-render WITHOUT app-data-updated event
    await act(async () => {
        useAppStore.setState({
            incomings: [
                { id: 'inc-1', sender: 'Partner A', date: '2026-08-15', amount: 50000, isStorno: false }
            ]
        });
    });

    assert.ok(container.textContent.includes('Partner A'));
    assert.ok(container.textContent.includes((50000).toLocaleString('hu-HU')));

    // 3. User action triggers window.app.incomingRenderer
    const btnAdd = container.querySelector('#btnAddIncoming');
    assert.ok(btnAdd, 'Add incoming button should exist');

    await act(async () => {
        btnAdd.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    assert.equal(addNewEntryCalls, 1, 'btnAddIncoming click should call window.app.incomingRenderer.addNewEntry()');

    // Test cell click
    const cell = container.querySelector('.incoming-cell');
    assert.ok(cell, 'Incoming cell should exist');

    await act(async () => {
        cell.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    assert.equal(cellClickCalls.length, 1);
    assert.equal(cellClickCalls[0].dataset.sender, 'Partner A');
    assert.equal(cellClickCalls[0].dataset.date, '2026-08-15');

    // Test delete col button
    const deleteColBtn = container.querySelector('.incoming-delete-col');
    assert.ok(deleteColBtn, 'Delete col button should exist');
    await act(async () => {
        deleteColBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(deleteColCalls, ['2026-08-15']);

    // Test delete row button
    const deleteRowBtn = container.querySelector('.incoming-delete-row');
    assert.ok(deleteRowBtn, 'Delete row button should exist');
    await act(async () => {
        deleteRowBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(deleteRowCalls, ['Partner A']);

    await act(async () => root.unmount());
    dom.window.close();
});

test('RemindersTab reactively consumes Zustand reminders state and calls window.app.remindersApp actions', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const [React, { createRoot }, { useAppStore }, { default: RemindersTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/reminders/RemindersTab.jsx')
    ]);

    const { act } = React;

    // Reset Zustand store state
    act(() => {
        useAppStore.setState({ reminders: [] });
    });

    // Mock window.app with remindersApp
    let newReminderCalls = [];
    let updateReminderCalls = [];
    let deleteReminderCalls = [];
    let completeReminderCalls = [];

    window.app = {
        remindersApp: {
            _handleNewReminder: async (data) => { newReminderCalls.push(data); },
            _updateReminder: async (data) => { updateReminderCalls.push(data); },
            _handleDeleteReminder: async (id) => { deleteReminderCalls.push(id); },
            _handleCompleteReminder: async (id) => { completeReminderCalls.push(id); }
        }
    };

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(RemindersTab));
    });

    // 1. Initial state rendered from Zustand store (empty)
    assert.equal(container.querySelectorAll('tbody tr').length, 0);

    // 2. Updating Zustand store reminders directly causes re-render WITHOUT app-data-updated event
    await act(async () => {
        useAppStore.setState({
            reminders: [
                {
                    id: 'rem-101',
                    title: 'Insurance Payment',
                    amount: 25000,
                    currency: 'HUF',
                    due_date: '2026-10-01',
                    frequency: 'yearly',
                    completed: false
                }
            ]
        });
    });

    assert.equal(container.querySelectorAll('tbody tr').length, 1);
    assert.ok(container.textContent.includes('Insurance Payment'));
    assert.ok(container.textContent.includes((25000).toLocaleString('hu-HU')));

    // 3. User action for complete click calls window.app.remindersApp._handleCompleteReminder
    const btnComplete = container.querySelector('.btn-complete-reminder');
    assert.ok(btnComplete, 'Complete reminder button should exist');

    await act(async () => {
        btnComplete.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    assert.deepEqual(completeReminderCalls, ['rem-101']);

    // 4. User action for delete click calls window.app.remindersApp._handleDeleteReminder
    const btnDelete = container.querySelector('.btn-delete-reminder');
    assert.ok(btnDelete, 'Delete reminder button should exist');

    await act(async () => {
        btnDelete.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    assert.deepEqual(deleteReminderCalls, ['rem-101']);

    // 5. User action for form submit calls window.app.remindersApp._handleNewReminder
    const form = container.querySelector('#reactReminderForm');
    assert.ok(form, 'Reminder form should exist');

    // Fill input values using React value setter helper
    const inputs = form.querySelectorAll('input');
    await act(async () => {
        setInputValue(inputs[0], 'Electricity Bill');
        setInputValue(inputs[1], '15000');
        setInputValue(inputs[2], '2026-09-15');
    });

    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(newReminderCalls.length, 1);
    assert.equal(newReminderCalls[0].title, 'Electricity Bill');
    assert.equal(newReminderCalls[0].amount, 15000);
    assert.equal(newReminderCalls[0].due_date, '2026-09-15');

    await act(async () => root.unmount());
    dom.window.close();
});
