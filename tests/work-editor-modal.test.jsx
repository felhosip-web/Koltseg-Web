import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

test('a React-owned work form saves exactly once per submit', async () => {
    const dom = new JSDOM('<div id="workAppEditorRoot"></div>', {
        url: 'http://localhost/'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const [React, { createRoot }, { WorkLogRenderer }, { default: WorkEditorModal }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../js/work-log.js'),
        import('../src/components/WorkEditorModal.jsx')
    ]);

    const root = createRoot(document.getElementById('workAppEditorRoot'));
    const { act } = React;
    await act(async () => {
        root.render(React.createElement(WorkEditorModal));
    });

    let saveCalls = 0;
    const manager = {
        save: async () => {
            saveCalls += 1;
        }
    };
    const app = {
        hmiNotif: {
            showToast: () => {}
        }
    };
    app.workLogRenderer = new WorkLogRenderer(app, manager);
    window.app = app;

    document.getElementById('workNameInput').value = 'Test work';
    document.getElementById('workDateInput').value = '2026-08-31';

    await act(async () => {
        document.getElementById('workForm').dispatchEvent(new Event('submit', {
            bubbles: true,
            cancelable: true
        }));
    });

    assert.equal(saveCalls, 1);

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});
