import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

function getFilesRecursively(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                getFilesRecursively(filePath, fileList);
            }
        } else {
            if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

test('P5-A — Static Architecture Check: Zero obsolete Vanilla renderers in production js/ and src/', () => {
    const prodFiles = [
        ...getFilesRecursively('js'),
        ...getFilesRecursively('src')
    ];

    const forbiddenPatterns = [
        { pattern: /\bWorkLogRenderer\b/, name: 'WorkLogRenderer' },
        { pattern: /\bRemindersRenderer\b/, name: 'RemindersRenderer' },
        { pattern: /\bRemindersApp\b/, name: 'RemindersApp' },
        { pattern: /\bremindersApp\b/, name: 'remindersApp' },
        { pattern: /\bchartsRenderer\b/, name: 'chartsRenderer' },
        { pattern: /\bapp\.renderer\b/, name: 'app.renderer' },
        { pattern: /\bincomingRenderer\b/, name: 'incomingRenderer' }
    ];

    const violations = [];

    for (const file of prodFiles) {
        const content = fs.readFileSync(file, 'utf8');
        for (const { pattern, name } of forbiddenPatterns) {
            if (pattern.test(content)) {
                violations.push(`${file} contains forbidden pattern: ${name}`);
            }
        }
    }

    assert.deepEqual(violations, [], `Found forbidden obsolete renderers in production files:\n${violations.join('\n')}`);
});

test('P5-B — Static Architecture Check: Zero window.app and obsolete UI orchestration terms', () => {
    const prodFiles = [
        ...getFilesRecursively('js'),
        ...getFilesRecursively('src')
    ];

    const forbiddenPatterns = [
        { pattern: /\bwindow\.app\b/, name: 'window.app' },
        { pattern: /\bglobalThis\.app\b/, name: 'globalThis.app' },
        { pattern: /app-data-updated/, name: 'app-data-updated' },
        { pattern: /js\/store\.js/, name: 'js/store.js' },
        { pattern: /\buiController\b/, name: 'uiController' },
        { pattern: /\brefreshAllTabs\b/, name: 'refreshAllTabs' },
        { pattern: /\btabStateMachine\b/, name: 'tabStateMachine' },
        { pattern: /\bVirtualTableRenderer\b/, name: 'VirtualTableRenderer' }
    ];

    const violations = [];

    for (const file of prodFiles) {
        const content = fs.readFileSync(file, 'utf8');
        for (const { pattern, name } of forbiddenPatterns) {
            if (pattern.test(content)) {
                violations.push(`${file} contains forbidden pattern: ${name}`);
            }
        }
    }

    assert.deepEqual(violations, [], `Found forbidden global state or obsolete orchestration terms in production files:\n${violations.join('\n')}`);
});

test('P5-C — System status updates reactively via Zustand store and CostAppFooter renders status correctly', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const [React, { createRoot }, { useAppStore }, { default: CostAppFooter }, { appService }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/CostAppFooter.jsx'),
        import('../src/services/appService.js')
    ]);

    const { act } = React;

    const container = document.getElementById('root');
    const root = createRoot(container);

    await act(async () => {
        root.render(React.createElement(CostAppFooter));
    });

    assert.ok(container.textContent.includes('Rendszer Online'));

    // Test appService.updateFooterStatus updates Zustand and React Footer
    await act(async () => {
        appService.updateFooterStatus('Szinkronizálva: 12:00', false);
    });

    assert.ok(container.textContent.includes('Szinkronizálva: 12:00'));
    assert.equal(useAppStore.getState().systemStatusText, 'Szinkronizálva: 12:00');
    assert.equal(useAppStore.getState().isSystemStatusError, false);

    // Test error status updates LED color
    await act(async () => {
        appService.updateFooterStatus('Szinkronizációs hiba!', true);
    });

    assert.ok(container.textContent.includes('Szinkronizációs hiba!'));
    assert.equal(useAppStore.getState().isSystemStatusError, true);
    assert.ok(container.querySelector('#saveLed').classList.contains('bg-red-500'));

    await act(async () => root.unmount());
    dom.window.close();
});
