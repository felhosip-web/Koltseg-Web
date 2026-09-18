import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { SyncManager } from '../js/sync-manager.js';

let syncDiffViewPromise;

async function setupDom(markup = '') {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${markup}</body></html>`, {
        url: 'http://localhost/'
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.KeyboardEvent = dom.window.KeyboardEvent;
    syncDiffViewPromise ||= import('../js/sync-diff-view.js');
    return { dom, syncDiffView: await syncDiffViewPromise };
}

test('sync diff modal provides dialog keyboard behavior and restores focus', async () => {
    const { dom, syncDiffView } = await setupDom('<button id="trigger">Ellenőrzés</button>');
    const trigger = document.getElementById('trigger');
    trigger.focus();

    syncDiffView.showSyncDiffModal({});

    const dialog = document.querySelector('[role="dialog"]');
    const closeButton = document.getElementById('closeSyncDiffBtn');
    const cancelButton = document.getElementById('cancelSyncBtn');
    const executeButton = document.getElementById('executeSyncBtn');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-labelledby'), 'syncDiffTitle');
    assert.equal(closeButton.getAttribute('aria-label'), 'Bezárás');
    assert.equal(document.activeElement, closeButton);

    closeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    assert.equal(document.activeElement, executeButton);
    executeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(document.activeElement, closeButton);

    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(document.activeElement, closeButton);

    cancelButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.getElementById('syncDiffOverlay'), null);
    assert.equal(document.activeElement, trigger);
    dom.window.close();
});

test('sync diff modal renders record fields as text and displays pending deletions', async () => {
    const { dom, syncDiffView } = await setupDom();
    const payload = '<img src=x onerror=alert(1)>';
    syncDiffView.showSyncDiffModal({
        items: {
            diffs: [{
                type: 'deleted',
                local: null,
                cloud: {
                    id: `id-${payload}`,
                    name: payload,
                    title: payload,
                    [payload]: payload
                }
            }]
        }
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(document.querySelector('#syncDiffOverlay img'), null);
    assert.match(document.getElementById('cloudDiffContent').textContent, new RegExp(payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(document.getElementById('localDiffContent').textContent, /Törlésre vár/);
    assert.equal(document.querySelector('#cloudDiffContent [title]').title, `id-${payload}`);
    document.getElementById('closeSyncDiffBtn').click();
    dom.window.close();
});

test('runAndShowSyncDiff reports and rethrows retrieval failures', async () => {
    const { dom, syncDiffView } = await setupDom();
    const expected = new Error('cloud unavailable');
    const toasts = [];
    const app = {
        syncManager: { getDiffData: async () => { throw expected; } },
        hmiNotif: { showToast: (...args) => toasts.push(args) }
    };

    await assert.rejects(syncDiffView.runAndShowSyncDiff(app), expected);
    assert.equal(toasts.at(-1)[1], 'error');
    dom.window.close();
});

test('getDiffData classifies cloud records with local tombstones as deleted', async () => {
    const app = {
        db: {
            getAll: async table => table === 'deleted_records'
                ? [{ table_name: 'items', record_id: 'record-1' }]
                : []
        },
        syncService: {
            cloud: { select: async table => table === 'items' ? [{ id: 'record-1', name: 'Deleted item' }] : [] },
            _getLocalData: () => []
        }
    };
    const manager = new SyncManager(app);
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: true }
    });

    const result = await manager.getDiffData('pull');

    assert.equal(result.items.diffs[0].type, 'deleted');
    assert.equal(result.items.diffs.some(diff => diff.type === 'cloud_only'), false);
});

test('patch_ui applies once, adds the import, and rejects an absent handler', () => {
    const source = fs.readFileSync(new URL('../patch_ui.cjs', import.meta.url), 'utf8');
    const executionStart = source.indexOf('\nif (content.includes(replaceBlock))');
    assert.notEqual(executionStart, -1);

    const declarations = {};
    vm.runInNewContext(
        `${source.slice(0, executionStart)}\nglobalThis.blocks = { searchBlock, replaceBlock };`,
        {
            globalThis: declarations,
            require: () => ({ readFileSync: () => '' })
        }
    );

    const runPatch = input => {
        let output;
        let exitCode;
        const context = {
            require: () => ({
                readFileSync: () => input,
                writeFileSync: (_path, content) => { output = content; }
            }),
            process: {
                exit: code => {
                    exitCode = code;
                    throw new Error(`EXIT:${code}`);
                }
            }
        };

        try {
            vm.runInNewContext(source, context);
        } catch (error) {
            if (error.message !== `EXIT:${exitCode}`) throw error;
        }
        return { output, exitCode };
    };

    const importAnchor = "import { DataMaintenanceController } from './data-maintenance-controller.js';";
    const firstRun = runPatch(`${importAnchor}\n${declarations.blocks.searchBlock}`);
    assert.match(firstRun.output, /import \{ runAndShowSyncDiff \} from '\.\/sync-diff-view\.js';/);
    assert.ok(firstRun.output.includes(declarations.blocks.replaceBlock));

    const secondRun = runPatch(firstRun.output);
    assert.equal(secondRun.exitCode, 0);
    assert.equal(secondRun.output, undefined);

    assert.throws(
        () => runPatch(importAnchor),
        /Az elvárt szinkron-ellenőrző eseménykezelő nem található/
    );
});
