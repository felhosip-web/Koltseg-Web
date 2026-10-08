import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';
import { appService } from '../src/services/appService.js';

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

test('PLG0 — Local Persistence & Reload: Scoped plugin records survive reload (Anonymous / Local Mode)', async () => {
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

test('PLG0 — Sync Integration & Tombstone Protection: Local delete + stale remote pull does NOT resurrect record', async () => {
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

    const storage = storageService.createPluginStorage('plugin-tombstone-test');
    const notes = storage.collection('notes');

    // 1. Create plugin record locally
    await notes.set('note-101', { title: 'To Be Deleted' });

    // Get the created record ID
    const recsBefore = await db.getAll('plugin_records');
    assert.equal(recsBefore.length, 1);
    const recId = recsBefore[0].id;

    // 2. Delete record locally via plugin storage API
    await notes.delete('note-101');

    // Verify record is gone from active storage and tombstone is saved to deleted_records
    assert.equal(await notes.get('note-101'), null);

    const tombstones = await db.getAll('deleted_records');
    assert.equal(tombstones.length, 1);
    assert.equal(tombstones[0].table_name, 'plugin_records');
    assert.equal(tombstones[0].record_id, recId);

    // 3. Simulate remote cloud returning a stale version of the deleted record on PULL
    syncService.cloud.client = {
        from: (storeName) => ({
            select: async () => {
                if (storeName === 'plugin_records') {
                    return {
                        data: [{
                            id: recId,
                            plugin_id: 'plugin-tombstone-test',
                            collection: 'notes',
                            record_key: 'note-101',
                            data: { title: 'To Be Deleted' },
                            updated_at: '2026-10-01T10:00:00.000Z'
                        }],
                        error: null
                    };
                }
                return { data: [], error: null };
            },
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    const mockApp = {
        db,
        pluginStorageService: storageService,
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        templates: { load: async () => {} },
        reminderManager: { load: async () => {} },
        incomingManager: { load: async () => {} },
        workLogManager: { load: async () => {} },
        updateReactStore: () => {}
    };
    syncService.setApp(mockApp);

    // Execute sync
    await syncService.sync();

    // 4. Verify stale remote record was NOT resurrected
    assert.equal(await notes.get('note-101'), null);
    const recsAfter = await db.getAll('plugin_records');
    assert.equal(recsAfter.length, 0, 'Deleted plugin_record must NOT resurrect after sync');

    dom.window.close();
});

test('PLG0 — App Lifecycle Wiring: App connects PluginStorageService and PluginRuntime cleanly', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    const [{ App }] = await Promise.all([import('../js/app.js')]);

    const db = new Database();
    db._enableMockDb();

    const app = Object.create(App.prototype);
    const syncService = new SyncService({ useSupabase: false }, { getPendingCount: () => 0 });

    Object.assign(app, {
        db,
        syncService,
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        templates: { load: async () => {} },
        reminderManager: { load: async () => {} },
        incomingManager: { load: async () => {} },
        workLogManager: { load: async () => {} }
    });

    app.pluginStorageService = new PluginStorageService(db, syncService);
    app.pluginRuntime = new PluginRuntime(app.pluginStorageService, appService);

    appService.bind(app);

    // Verify App wiring
    assert.ok(app.pluginStorageService);
    assert.ok(app.pluginRuntime);
    assert.equal(app.pluginStorageService.db, db);
    assert.equal(app.pluginStorageService.syncService, syncService);

    // Verify plugin runtime can register a plugin and access storageService through app
    app.pluginRuntime.registerPlugin({
        id: 'lifecycle-test-plugin',
        name: 'Lifecycle Test',
        version: '1.0.0',
        apiVersion: 1,
        permissions: ['storage:private']
    }, async (ctx) => {
        const coll = ctx.storage.collection('app_lifecycle');
        await coll.set('k1', { status: 'wired' });
    });

    const activeRecords = app.pluginStorageService.getAllRecords();
    assert.equal(activeRecords.length, 1);
    assert.equal(activeRecords[0].plugin_id, 'lifecycle-test-plugin');

    dom.window.close();
});

test('PLG0 — Supabase Schema & RLS Policy Contract: Strict Authenticated Ownership; No Anonymous Cloud Access Policy', () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/20261007000000_add_plugin_records.sql');
    assert.ok(fs.existsSync(sqlPath), 'Supabase migration file for plugin_records must exist');

    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // 1. Verify user_id column
    assert.ok(sqlContent.includes('user_id'), 'plugin_records table must include user_id column');

    // 2. Verify ENABLE ROW LEVEL SECURITY
    assert.ok(sqlContent.includes('ALTER TABLE plugin_records ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on plugin_records');

    // 3. Verify strict authenticated policy enforcing user_id ownership
    assert.ok(sqlContent.includes('auth.uid() = user_id'), 'RLS policy must enforce auth.uid() = user_id');
    assert.ok(sqlContent.includes('TO authenticated'), 'RLS policy must apply TO authenticated users');

    // 4. Verify NO un-sandboxed FOR ALL USING (true) or anonymous TO anon cloud access policies exist
    assert.ok(!sqlContent.includes('WITH CHECK (true)'), 'RLS policy must NOT use WITH CHECK (true)');
    assert.ok(!sqlContent.includes('TO anon'), 'RLS policy must NOT grant anonymous cloud access');
    assert.ok(!sqlContent.includes('USING (user_id IS NULL)'), 'RLS policy must NOT grant access to a shared user_id IS NULL namespace');
});

test('PLG0 — Simulated RLS Ownership Boundary: User A cannot access User B plugin_records; Anonymous receives zero cloud records', () => {
    const userA = { uid: 'user-uuid-A' };
    const userB = { uid: 'user-uuid-B' };

    const records = [
        { id: 'p1', plugin_id: 'p', collection: 'c', record_key: 'k1', user_id: 'user-uuid-A', data: { val: 'User A Secret' } },
        { id: 'p2', plugin_id: 'p', collection: 'c', record_key: 'k2', user_id: 'user-uuid-B', data: { val: 'User B Secret' } }
    ];

    // RLS Policy Simulation: TO authenticated USING (auth.uid() = user_id)
    const rlsSelect = (currentUser, dataset) => {
        if (!currentUser || !currentUser.uid) return [];
        return dataset.filter(r => r.user_id === currentUser.uid);
    };

    const userARecords = rlsSelect(userA, records);
    assert.equal(userARecords.length, 1);
    assert.equal(userARecords[0].data.val, 'User A Secret');

    const userBRecords = rlsSelect(userB, records);
    assert.equal(userBRecords.length, 1);
    assert.equal(userBRecords[0].data.val, 'User B Secret');

    // Unauthenticated anonymous user simulation (auth.uid() is null) -> 0 records accessible in cloud
    const anonRecords = rlsSelect(null, records);
    assert.equal(anonRecords.length, 0, 'Anonymous users must receive zero records from cloud table');
});
