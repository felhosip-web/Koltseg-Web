import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { appService } from '../src/services/appService.js';
import { db } from '../js/db.js';

function setupEnvironment() {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="root"></div><div id="costAppView" class="hidden"></div><div id="workAppView" class="hidden"></div><div id="appLandingScreenRoot"><div></div></div></body></html>',
        { url: 'http://localhost/' }
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
    globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    globalThis.Node = dom.window.Node;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.window.Dexie = Dexie;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ current_weather: { temperature: 20, weathercode: 0 } })
    });

    if (db && db.timeEntries) {
        db.timeEntries.where = () => ({
            equals: () => ({
                toArray: async () => []
            }),
            between: () => ({
                toArray: async () => []
            })
        });
        db.timeEntries.get = async () => null;
    }

    delete globalThis.window.app;
    return dom;
}

afterEach(() => {
    appService.unbind();
    if (globalThis.window) {
        delete globalThis.window.app;
    }
});

test('8. TimeTrackerTab executes time tracker actions through bound appService without window.app', async () => {
    const dom = setupEnvironment();
    delete globalThis.window.app;

    const [React, { createRoot }, { useAppStore }, { default: TimeTrackerTab }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/time-tracker/TimeTrackerTab.jsx')
    ]);

    const { act } = React;

    let startCalls = [];
    let pauseCalls = 0;
    let resumeCalls = 0;
    let stopCalls = 0;
    let projectModalCalls = 0;
    let entryModalCalls = [];
    let deleteEntryCalls = [];
    let deleteProjectCalls = [];
    let toastCalls = [];

    const fakeApp = {
        hmiNotif: {
            showToast: (msg, type) => toastCalls.push({ msg, type })
        },
        timeTracker: {
            startTimer: (projId, task) => startCalls.push({ projId, task }),
            pauseTimer: () => { pauseCalls++; },
            resumeTimer: () => { resumeCalls++; },
            stopTimer: () => { stopCalls++; },
            showProjectModal: () => { projectModalCalls++; },
            showEntryModal: (entry) => entryModalCalls.push(entry),
            deleteEntry: (id) => deleteEntryCalls.push(id),
            deleteProject: (id) => deleteProjectCalls.push(id)
        }
    };

    appService.bind(fakeApp);

    const fakeDayjs = () => ({
        format: () => '2026-09-27',
        startOf: () => ({ format: () => '2026-09-01' }),
        endOf: () => ({ format: () => '2026-09-30' })
    });

    act(() => {
        useAppStore.setState({
            isLoaded: true,
            dayjs: fakeDayjs,
            timeTracker: {
                projects: [{ id: 'p1', name: 'Web Dev', hourlyRate: 5000 }],
                activeTimer: { projectId: 'p1', task: 'Coding', startISO: new Date().toISOString(), elapsedPausedMs: 0, isPaused: false }
            }
        });
    });

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(TimeTrackerTab));
    });

    assert.ok(container.textContent.includes('Időmérő'));
    assert.ok(container.textContent.includes('Aktív időmérő'));

    // 1. Test pauseTimer
    const btnPause = container.querySelector('#btnPauseTimer');
    assert.ok(btnPause);
    await act(async () => {
        btnPause.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(pauseCalls, 1);

    // 2. Test resumeTimer (switch activeTimer to paused state)
    await act(async () => {
        useAppStore.setState({
            timeTracker: {
                projects: [{ id: 'p1', name: 'Web Dev', hourlyRate: 5000 }],
                activeTimer: { projectId: 'p1', task: 'Coding', startISO: new Date().toISOString(), elapsedPausedMs: 1000, isPaused: true }
            }
        });
    });
    const btnResume = container.querySelector('#btnResumeTimer');
    assert.ok(btnResume);
    await act(async () => {
        btnResume.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(resumeCalls, 1);

    // 3. Test stopTimer
    const btnStop = container.querySelector('#btnStopTimer');
    assert.ok(btnStop);
    await act(async () => {
        btnStop.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(stopCalls, 1);

    // 4. Test validation toasts for start (missing project, then missing task)
    const btnStart = container.querySelector('#btnStartTimer');
    assert.ok(btnStart);
    await act(async () => {
        btnStart.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.ok(toastCalls.some(t => t.msg.includes('projektet')));

    const selectProject = container.querySelector('#timerProjectSelect');
    const taskInput = container.querySelector('#timerTaskInput');
    assert.ok(selectProject && taskInput);

    const selectSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
    const inputSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;

    await act(async () => {
        selectSetter.call(selectProject, 'p1');
        selectProject.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
        btnStart.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.ok(toastCalls.some(t => t.msg.includes('mit csinálsz')));

    // 5. Test startTimeTracker action
    await act(async () => {
        inputSetter.call(taskInput, 'Refactoring');
        taskInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
        btnStart.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(startCalls, [{ projId: 'p1', task: 'Refactoring' }]);

    // 6. Test showTimeTrackerEntryModal (manual entry add)
    const btnManualAdd = container.querySelector('#btnManualAdd');
    assert.ok(btnManualAdd);
    await act(async () => {
        btnManualAdd.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(entryModalCalls.length, 1);
    assert.equal(entryModalCalls[0], null); // null means new entry

    // 7. Test projects dropdown toggle, showTimeTrackerProjectModal and deleteTimeTrackerProject
    const toggleProjectsBtn = container.querySelector('#toggleProjectsBtn');
    assert.ok(toggleProjectsBtn);
    await act(async () => {
        toggleProjectsBtn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });

    const btnNewProject = container.querySelector('#btnNewProject');
    assert.ok(btnNewProject);
    await act(async () => {
        btnNewProject.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.equal(projectModalCalls, 1);

    const btnDeleteProject = container.querySelector('.btn-delete-project');
    assert.ok(btnDeleteProject);
    await act(async () => {
        btnDeleteProject.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(deleteProjectCalls, ['p1']);

    // Confirm window.app is completely undefined
    assert.equal(globalThis.window.app, undefined);

    await act(async () => {
        useAppStore.setState({ timeTracker: { projects: [], activeTimer: null } });
        root.unmount();
    });
    dom.window.close();
});
