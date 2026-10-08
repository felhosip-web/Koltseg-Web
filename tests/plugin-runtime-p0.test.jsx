import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';

test('PLG0 — Storage Isolation: Plugin A can CRUD its own data; Plugin A cannot read/write/delete Plugin B data', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.Dexie = Dexie;

    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const storageA = storageService.createPluginStorage('plugin-a');
    const storageB = storageService.createPluginStorage('plugin-b');

    const notesA = storageA.collection('notes');
    const notesB = storageB.collection('notes');

    // 1. Plugin A sets record in 'notes' collection with key 'note-1'
    await notesA.set('note-1', { title: 'Plugin A Note', content: 'Secret A' });

    // 2. Plugin B sets record in same collection name 'notes' with key 'note-1'
    await notesB.set('note-1', { title: 'Plugin B Note', content: 'Secret B' });

    // 3. Verify Plugin A sees only its own value
    const valA = await notesA.get('note-1');
    assert.equal(valA.title, 'Plugin A Note');
    assert.equal(valA.content, 'Secret A');

    // 4. Verify Plugin B sees only its own value
    const valB = await notesB.get('note-1');
    assert.equal(valB.title, 'Plugin B Note');
    assert.equal(valB.content, 'Secret B');

    // 5. Verify list isolation
    const listA = await notesA.list();
    const listB = await notesB.list();

    assert.equal(listA.length, 1);
    assert.equal(listA[0].data.content, 'Secret A');

    assert.equal(listB.length, 1);
    assert.equal(listB[0].data.content, 'Secret B');

    // 6. Plugin A deletes its note-1; Plugin B note-1 must remain intact
    await notesA.delete('note-1');

    assert.equal(await notesA.get('note-1'), null);
    assert.equal((await notesB.get('note-1')).content, 'Secret B');

    dom.window.close();
});

test('PLG0 — Bound Identity Security: Plugin ID cannot be overridden by plugin-provided input', async () => {
    const storageService = new PluginStorageService(null, null);
    const storageA = storageService.createPluginStorage('plugin-a');

    // pluginId property is a read-only getter
    assert.equal(storageA.pluginId, 'plugin-a');

    assert.throws(() => {
        // Attempting to overwrite bound pluginId
        storageA.pluginId = 'malicious-plugin-b';
    }, TypeError);

    assert.equal(storageA.pluginId, 'plugin-a');
});

test('PLG0 — Security Boundary: Scoped storage and plugin context do NOT expose raw DB, Supabase, or App handles', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, null);

    let capturedContext = null;

    runtime.registerPlugin({
        id: 'secure-plugin-1',
        name: 'Secure Test Plugin',
        version: '1.0.0',
        apiVersion: 1,
        permissions: ['storage:private', 'ui:toast']
    }, (ctx) => {
        capturedContext = ctx;
    });

    assert.ok(capturedContext);

    // Verify context does NOT contain sensitive handles
    assert.equal(capturedContext.app, undefined);
    assert.equal(capturedContext.db, undefined);
    assert.equal(capturedContext.syncService, undefined);
    assert.equal(capturedContext.supabase, undefined);
    assert.equal(capturedContext.localStorage, undefined);
    assert.equal(capturedContext.indexedDB, undefined);

    // Verify scoped storage does NOT expose raw DB or syncService handles
    assert.equal(capturedContext.storage.db, undefined);
    assert.equal(capturedContext.storage.syncService, undefined);
    assert.equal(capturedContext.storage.app, undefined);
});

test('PLG0 — Local Persistence & Reload: Scoped plugin records survive reload', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    const db = new Database();
    db._enableMockDb();

    // 1. First session
    const storageService1 = new PluginStorageService(db, null);
    await storageService1.load();

    const storageA1 = storageService1.createPluginStorage('plugin-fuel');
    const logs1 = storageA1.collection('logs');

    await logs1.set('log-101', { odo: 120000, liters: 45, totalCost: 28000 });

    // 2. Second session (simulating app reload)
    const storageService2 = new PluginStorageService(db, null);
    await storageService2.load();

    const storageA2 = storageService2.createPluginStorage('plugin-fuel');
    const logs2 = storageA2.collection('logs');

    const reloadedLog = await logs2.get('log-101');
    assert.ok(reloadedLog);
    assert.equal(reloadedLog.odo, 120000);
    assert.equal(reloadedLog.totalCost, 28000);

    dom.window.close();
});

test('PLG0 — Multiple Collections & Full CRUD: get, set, update, delete, list, clear, count, has', async () => {
    const storageService = new PluginStorageService(null, null);
    const storage = storageService.createPluginStorage('plugin-multi');

    const notes = storage.collection('notes');
    const settings = storage.collection('settings');

    // Set
    await notes.set('n1', { title: 'First Note' });
    await notes.set('n2', { title: 'Second Note' });
    await settings.set('theme', { mode: 'dark' });

    // Has & Count
    assert.equal(await notes.has('n1'), true);
    assert.equal(await notes.has('n99'), false);
    assert.equal(await notes.count(), 2);
    assert.equal(await settings.count(), 1);

    // Update
    await notes.set('n1', { title: 'Updated First Note' });
    assert.equal((await notes.get('n1')).title, 'Updated First Note');

    // List
    const noteList = await notes.list();
    assert.equal(noteList.length, 2);

    // Delete single
    await notes.delete('n2');
    assert.equal(await notes.count(), 1);

    // Clear collection
    await notes.clear();
    assert.equal(await notes.count(), 0);

    // Settings collection remains unaffected
    assert.equal(await settings.has('theme'), true);
    assert.equal((await settings.get('theme')).mode, 'dark');
});

test('PLG0 — Sync Integration: Plugin records enqueued in SyncService with correct P2 invariants', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    const db = new Database();
    db._enableMockDb();

    const configManager = { useSupabase: true, supabaseConfig: { url: 'https://mock.co', key: 'k' } };
    const syncService = new SyncService(configManager, { getPendingCount: () => 0 });

    const storageService = new PluginStorageService(db, syncService);
    await storageService.load();

    const storage = storageService.createPluginStorage('plugin-sync-test');
    const items = storage.collection('items');

    // Set enqueues update in plugin_records table
    await items.set('item-1', { name: 'Synced Plugin Item', qty: 5 });

    const queueStatus = syncService.getQueueStatus();
    assert.equal(queueStatus.total, 1);
    assert.equal(queueStatus.items[0].table, 'plugin_records');
    assert.equal(queueStatus.items[0].data.plugin_id, 'plugin-sync-test');
    assert.equal(queueStatus.items[0].data.collection, 'items');
    assert.equal(queueStatus.items[0].data.record_key, 'item-1');

    dom.window.close();
});

test('PLG0 — Plugin Runtime Manifest & Permissions Enforcement', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, null);

    // Invalid manifest (missing permissions) throws
    assert.throws(() => {
        runtime.registerPlugin({ id: 'bad-1', name: 'Bad', version: '1.0.0', apiVersion: 1 });
    }, /permissions/);

    // Plugin without 'storage:private' permission gets null storage
    runtime.registerPlugin({
        id: 'no-storage-plugin',
        name: 'No Storage',
        version: '1.0.0',
        apiVersion: 1,
        permissions: ['ui:toast']
    }, (ctx) => {
        assert.equal(ctx.storage, null);
        assert.ok(ctx.ui.showToast);
    });

    // Plugin without 'ui:toast' permission calling showToast throws
    runtime.registerPlugin({
        id: 'no-ui-plugin',
        name: 'No UI',
        version: '1.0.0',
        apiVersion: 1,
        permissions: ['storage:private']
    }, (ctx) => {
        assert.throws(() => {
            ctx.ui.showToast('Test Toast');
        }, /lacks "ui:toast" permission/);
    });
});
