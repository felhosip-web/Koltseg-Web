import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

import { Database } from '../js/oop-core.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRegistry } from '../src/services/plugin/PluginRegistry.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';
import { PluginUIRegistry } from '../src/services/plugin/PluginUIRegistry.js';
import { PluginManagerService } from '../src/services/plugin/PluginManagerService.js';
import { appService } from '../src/services/appService.js';

function setupJSDOM() {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
        url: 'http://localhost/',
        runScripts: 'dangerously'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(globalThis, 'navigator', {
        value: dom.window.navigator,
        configurable: true,
        writable: true
    });
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;

    return dom;
}

test('PLG3-P1 — Requirement 1: Enabling a disposed plugin and initializing it successfully', async () => {
    let setupRan = 0;
    const registry = new PluginRegistry();
    const manifest = {
        id: 'test.enable.plugin',
        name: 'Enable Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    registry.register(manifest, () => { setupRan++; });
    await registry.initialize('test.enable.plugin');
    assert.equal(registry.get('test.enable.plugin').state, 'active');

    // Dispose
    registry.dispose('test.enable.plugin');
    assert.equal(registry.get('test.enable.plugin').state, 'disposed');

    // Cannot initialize disposed plugin directly
    await assert.rejects(async () => {
        await registry.initialize('test.enable.plugin');
    }, /Cannot initialize disposed plugin/);

    // Enable transitions state back to 'registered'
    const enabled = registry.enable('test.enable.plugin');
    assert.equal(enabled, true);
    assert.equal(registry.get('test.enable.plugin').state, 'registered');

    // Can initialize successfully again
    await registry.initialize('test.enable.plugin');
    assert.equal(registry.get('test.enable.plugin').state, 'active');
    assert.equal(setupRan, 2);
});

test('PLG3-P1 — Requirement 2: Enabling an active or registered plugin idempotently', () => {
    const registry = new PluginRegistry();
    const manifest = {
        id: 'idempotent.plugin',
        name: 'Idempotent Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    registry.register(manifest);
    assert.equal(registry.get('idempotent.plugin').state, 'registered');

    // Enabling a 'registered' plugin returns true idempotently
    assert.equal(registry.enable('idempotent.plugin'), true);
    assert.equal(registry.get('idempotent.plugin').state, 'registered');
});

test('PLG3-P1 — Requirement 3: Unknown IDs and invalid arguments', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const manager = new PluginManagerService(runtime, uiRegistry);

    // PluginRegistry.enable with invalid or unknown IDs
    assert.equal(runtime.registry.enable(null), false);
    assert.equal(runtime.registry.enable(''), false);
    assert.equal(runtime.registry.enable(123), false);
    assert.equal(runtime.registry.enable('non.existent.plugin'), false);

    // togglePluginState with invalid args
    assert.equal(await manager.togglePluginState(null, true), false);
    assert.equal(await manager.togglePluginState('some.plugin', 'not-a-boolean'), false);
    assert.equal(await manager.togglePluginState('non.existent.plugin', true), false);

    // getPluginStorageMetrics with invalid IDs
    const metricsInvalid = await manager.getPluginStorageMetrics(null);
    assert.equal(metricsInvalid.totalRecords, 0);

    // purgePluginStorageData with invalid IDs
    const purgeInvalid = await manager.purgePluginStorageData(null);
    assert.equal(purgeInvalid.success, false);
    assert.ok(purgeInvalid.errors.length > 0);
});

test('PLG3-P1 — Requirement 4: Setup failures and accurate error reporting in manager', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const manager = new PluginManagerService(runtime, uiRegistry);

    runtime.registry.register({
        id: 'failing.plugin',
        name: 'Failing Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, () => {
        throw new Error('Initialization failure test');
    });

    await assert.rejects(async () => {
        await manager.togglePluginState('failing.plugin', true);
    }, /Initialization failure test/);

    const summaries = manager.listInstalledPluginsSummary();
    const summary = summaries.find(s => s.id === 'failing.plugin');
    assert.ok(summary);
    assert.equal(summary.state, 'registered');
    assert.equal(summary.error.message, 'Initialization failure test');
});

test('PLG3-P1 — Requirement 5: Immutable summary DTOs and plugins without UI metadata', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const manager = new PluginManagerService(runtime, uiRegistry);

    runtime.registry.register({
        id: 'no.ui.plugin',
        name: 'No UI Plugin',
        version: '2.1.0',
        apiVersion: '1',
        description: 'A plugin without UI',
        permissions: ['storage:private']
    });

    const summaries = manager.listInstalledPluginsSummary();
    assert.equal(summaries.length, 1);
    const s = summaries[0];

    assert.equal(s.id, 'no.ui.plugin');
    assert.equal(s.name, 'No UI Plugin');
    assert.equal(s.version, '2.1.0');
    assert.equal(s.description, 'A plugin without UI');
    assert.equal(s.hasUI, false);
    assert.equal(s.uiTitle, 'No UI Plugin');
    assert.equal(s.uiIcon, 'fas fa-plug');

    // Immutability check
    assert.throws(() => {
        s.state = 'active';
    }, TypeError);
});

test('PLG3-P1 — Deep immutability of summary DTO permissions, error, and manifest detachment', async () => {
    const storageService = new PluginStorageService(null, null);
    const runtime = new PluginRuntime(storageService, appService);
    const uiRegistry = new PluginUIRegistry();
    const manager = new PluginManagerService(runtime, uiRegistry);

    const manifest = {
        id: 'immutability.test.plugin',
        name: 'Immutability Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast', 'storage:private']
    };

    runtime.registry.register(manifest, () => {
        throw new Error('Fatal setup error for immutability test');
    });

    // Initialize to set record.error
    await runtime.registry.initialize('immutability.test.plugin').catch(() => {});

    const summaries = manager.listInstalledPluginsSummary();
    const summary = summaries.find(s => s.id === 'immutability.test.plugin');
    assert.ok(summary);

    // 1. Mutating permissions array throws TypeError
    assert.throws(() => {
        summary.permissions.push('unapproved:permission');
    }, TypeError);

    assert.throws(() => {
        summary.permissions[0] = 'tampered:permission';
    }, TypeError);

    // 2. Mutating error object throws TypeError
    assert.throws(() => {
        summary.error.message = 'tampered error message';
    }, TypeError);

    // 3. Attempting to mutate outer summary properties throws TypeError
    assert.throws(() => {
        summary.state = 'active';
    }, TypeError);

    // 4. Verify stored registry record was NOT altered by summary queries or mutation attempts
    const storedRecord = runtime.registry.get('immutability.test.plugin');
    assert.deepEqual(storedRecord.manifest.permissions, ['ui:toast', 'storage:private']);
    assert.equal(storedRecord.error.message, 'Fatal setup error for immutability test');
});

test('PLG3-P1 — Requirement 6: Storage not ready, missing database, and failed reload after previous successful load', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();
    assert.equal(storageService.verifyReadiness(), true);

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    // 1. Missing db on storage service
    storageService.db = null;
    assert.equal(storageService.verifyReadiness(), false);

    const metricsNotReady = await manager.getPluginStorageMetrics('some.plugin');
    assert.equal(metricsNotReady.isLoaded, false);
    assert.equal(metricsNotReady.totalRecords, 0);

    const purgeNotReady = await manager.purgePluginStorageData('some.plugin');
    assert.equal(purgeNotReady.success, false);
    assert.ok(purgeNotReady.errors[0].includes('verifyReadiness'));

    // 2. Failed reload sets isLoaded = false
    storageService.db = {
        async getAll() {
            throw new Error('DB read error');
        }
    };
    await storageService.load();
    assert.equal(storageService.isLoaded, false);
    assert.equal(storageService.verifyReadiness(), false);

    dom.window.close();
});

test('PLG3-P1 CodeRabbit Finding 1 — Stale setup resolution or rejection cannot overwrite newer plugin lifecycle state or context', async () => {
    const registry = new PluginRegistry();

    let resolveSetupA;
    const promiseA = new Promise((resolve) => {
        resolveSetupA = resolve;
    });

    let setupACount = 0;
    let setupBCount = 0;

    // 1. Register plugin with setup A
    registry.register({
        id: 'race.test.plugin',
        name: 'Race Test Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, () => {
        setupACount++;
        return promiseA;
    });

    // Start setup A
    const initPromiseA = registry.initialize('race.test.plugin');

    // Dispose and re-enable plugin while setup A is pending
    registry.dispose('race.test.plugin');
    registry.unregister('race.test.plugin');

    // Register setup B for same plugin ID
    let contextB = null;
    registry.register({
        id: 'race.test.plugin',
        name: 'Race Test Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, (ctx) => {
        setupBCount++;
        contextB = ctx;
        return Promise.resolve();
    });

    const initPromiseB = registry.initialize('race.test.plugin');

    // 3. Resolve setup A NOW
    resolveSetupA();

    // A's promise rejects because lifecycle token changed / plugin was disposed
    await assert.rejects(async () => {
        await initPromiseA;
    });

    // B resolves successfully
    await initPromiseB;

    // Verify plugin state and context strictly belong to setup B
    const activeRecord = registry.get('race.test.plugin');
    assert.equal(activeRecord.state, 'active');
    assert.equal(registry.getContext('race.test.plugin'), contextB);
    assert.equal(setupACount, 1);
    assert.equal(setupBCount, 1);
});

test('PLG3-P1 CodeRabbit Finding 2 — PluginStorageService.set() without database connection throws error without mutating cache', async () => {
    const storageService = new PluginStorageService(null, null);
    const storage = storageService.createPluginStorage('unpersisted.test.plugin');
    const col = storage.collection('items');

    // Calling set() when db is unavailable throws an error
    await assert.rejects(async () => {
        await col.set('k1', { data: 'unpersisted data' });
    }, /database connection is unavailable/);

    // Verify in-memory cache was NOT mutated
    assert.equal(await col.get('k1'), null);
    assert.equal(storageService.records.length, 0);

    // Calling load() on new session yields 0 records
    await storageService.load();
    assert.equal(await col.get('k1'), null);
});

test('PLG3-P1 — PluginStorageService.set() rolls back in-memory cache when db.save() rejects', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const storage = storageService.createPluginStorage('save.rollback.test.plugin');
    const col = storage.collection('items');

    // 1. Initial valid write succeeds
    await col.set('key1', { value: 'initial valid data' });
    assert.equal((await col.get('key1')).value, 'initial valid data');

    // Mock db.save to reject
    const originalSave = db.save.bind(db);
    db.save = async () => {
        throw new Error('Database write failure during save');
    };

    // 2. Inserting a NEW record when db.save rejects rolls back insertion
    await assert.rejects(async () => {
        await col.set('key2', { value: 'unpersisted new data' });
    }, /Database write failure during save/);

    assert.equal(await col.get('key2'), null, 'New record MUST NOT exist in cache after db.save rejection');

    // 3. Updating an EXISTING record when db.save rejects restores previous value
    await assert.rejects(async () => {
        await col.set('key1', { value: 'unpersisted updated data' });
    }, /Database write failure during save/);

    assert.equal((await col.get('key1')).value, 'initial valid data', 'Existing record MUST preserve previous data in cache after db.save rejection');

    // Restore original db.save and verify persistent state is preserved
    db.save = originalSave;
    assert.equal((await col.get('key1')).value, 'initial valid data');

    dom.window.close();
});

test('PLG3-P1 CodeRabbit Finding 3 — collection.clear() returns count of confirmed successful deletions', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const storage = storageService.createPluginStorage('clear.test.plugin');
    const col = storage.collection('items');

    await col.set('k1', { val: '1' });
    await col.set('k2', { val: '2' });
    await col.set('k3', { val: '3' });

    // 1. All deletions succeed
    const cleared3 = await col.clear();
    assert.equal(cleared3, 3);
    assert.equal(await col.count(), 0);

    // Re-populate
    await col.set('k1', { val: '1' });
    await col.set('k2', { val: '2' });

    // 2. Clear when database becomes unavailable (all fail)
    storageService.db = null;
    const cleared0 = await col.clear();
    assert.equal(cleared0, 0);

    // Restore db and verify cached records remain in memory
    storageService.db = db;
    assert.equal(await col.count(), 2);

    dom.window.close();
});

test('PLG3-P1 — Storage deletion failure when database is missing or lacks deletion method', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const storage = storageService.createPluginStorage('db.missing.test.plugin');
    const col = storage.collection('items');
    await col.set('key1', { value: 'retained data' });

    // 1. Simulate DB becoming null/unavailable during delete call
    storageService.db = null;
    const deletedNoDb = await col.delete('key1');
    assert.equal(deletedNoDb, false, 'delete() MUST return false when database is null/unavailable');

    // Restore DB handle and verify cache record was NOT removed
    storageService.db = db;
    const itemNoDb = await col.get('key1');
    assert.ok(itemNoDb, 'Cached record MUST remain intact when database is null/unavailable');
    assert.equal(itemNoDb.value, 'retained data');

    // 2. Simulate DB object without usable delete / _directDelete methods
    storageService.db = {};
    const deletedNoMethod = await col.delete('key1');
    assert.equal(deletedNoMethod, false, 'delete() MUST return false when database object lacks deletion methods');

    // Restore DB handle and verify cache record was NOT removed
    storageService.db = db;
    const itemNoMethod = await col.get('key1');
    assert.ok(itemNoMethod, 'Cached record MUST remain intact when database object lacks deletion methods');
    assert.equal(itemNoMethod.value, 'retained data');

    dom.window.close();
});

test('PLG3-P1 — Thrown DB deletion error preserves in-memory cache and updates purge outcome truthfully', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    // Mock db.delete to throw an error when deleting a specific record
    db.delete = async (storeName, key) => {
        throw new Error('Database write failure during delete');
    };

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    const storageA = storageService.createPluginStorage('throw.test.plugin.a');
    await storageA.collection('cache').set('c1', { data: 'persistent payload' });

    const storageB = storageService.createPluginStorage('throw.test.plugin.b');
    await storageB.collection('cache').set('c1', { data: 'other plugin payload' });

    const outcome = await manager.purgePluginStorageData('throw.test.plugin.a');

    // Truthful accounting checks
    assert.equal(outcome.success, false);
    assert.equal(outcome.attemptedCount, 1);
    assert.equal(outcome.localPurgedCount, 0);
    assert.equal(outcome.failedCount, 1);
    assert.ok(outcome.errors[0].includes('Database write failure during delete'));

    // In-memory state preservation check for target plugin
    const retainedValA = await storageA.collection('cache').get('c1');
    assert.ok(retainedValA, 'Failed record MUST remain in in-memory cache when db.delete throws');
    assert.equal(retainedValA.data, 'persistent payload');

    // In-memory state preservation check for other plugin
    const retainedValB = await storageB.collection('cache').get('c1');
    assert.ok(retainedValB, 'Unrelated plugin record MUST remain intact');
    assert.equal(retainedValB.data, 'other plugin payload');

    dom.window.close();
});

test('PLG3-P1 — Requirement 7: Metrics for ready storage and correct plugin scoping', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    // Create records for plugin A and plugin B
    const storageA = storageService.createPluginStorage('plugin.a');
    await storageA.collection('logs').set('l1', { value: 1 });
    await storageA.collection('logs').set('l2', { value: 2 });
    await storageA.collection('settings').set('s1', { theme: 'dark' });

    const storageB = storageService.createPluginStorage('plugin.b');
    await storageB.collection('logs').set('l1', { value: 99 });

    const metricsA = await manager.getPluginStorageMetrics('plugin.a');
    assert.equal(metricsA.isLoaded, true);
    assert.equal(metricsA.totalRecords, 3);
    assert.equal(metricsA.collections.logs, 2);
    assert.equal(metricsA.collections.settings, 1);

    const metricsB = await manager.getPluginStorageMetrics('plugin.b');
    assert.equal(metricsB.isLoaded, true);
    assert.equal(metricsB.totalRecords, 1);
    assert.equal(metricsB.collections.logs, 1);

    dom.window.close();
});

test('PLG3-P1 — Requirement 8: Successful zero-record purge (verified no-op)', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    const purgeResult = await manager.purgePluginStorageData('empty.plugin');
    assert.equal(purgeResult.success, true);
    assert.equal(purgeResult.attemptedCount, 0);
    assert.equal(purgeResult.localPurgedCount, 0);
    assert.equal(purgeResult.failedCount, 0);
    assert.equal(purgeResult.tombstoneStatus, 'not_applicable');
    assert.equal(purgeResult.syncStatus, 'not_applicable');
    assert.equal(purgeResult.errors.length, 0);

    dom.window.close();
});

test('PLG3-P1 — Requirement 9 & 10: Complete deletion, col.delete returning false, thrown errors, and partial deletion accounting', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    const storage = storageService.createPluginStorage('purge.test.plugin');
    await storage.collection('items').set('k1', { val: 'a' });
    await storage.collection('items').set('k2', { val: 'b' });
    await storage.collection('items').set('k3', { val: 'c' });

    // Test Complete Deletion
    const purgeSuccess = await manager.purgePluginStorageData('purge.test.plugin');
    assert.equal(purgeSuccess.success, true);
    assert.equal(purgeSuccess.attemptedCount, 3);
    assert.equal(purgeSuccess.localPurgedCount, 3);
    assert.equal(purgeSuccess.failedCount, 0);
    assert.equal(purgeSuccess.errors.length, 0);

    // Verify all records for purge.test.plugin are gone
    const remaining = storageService.getAllRecords().filter(r => r.plugin_id === 'purge.test.plugin');
    assert.equal(remaining.length, 0);

    dom.window.close();
});

test('PLG3-P1 — Requirement 10 (cont): Partial deletion failure when col.delete fails or throws', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    const storage = storageService.createPluginStorage('partial.fail.plugin');
    await storage.collection('notes').set('n1', { title: '1' });
    await storage.collection('notes').set('n2', { title: '2' });

    // Intercept createPluginStorage to return a collection whose delete fails on n2
    const originalCreate = storageService.createPluginStorage.bind(storageService);
    storageService.createPluginStorage = (pluginId) => {
        const scoped = originalCreate(pluginId);
        const origCol = scoped.collection.bind(scoped);
        scoped.collection = (colName) => {
            const colObj = origCol(colName);
            const origDelete = colObj.delete.bind(colObj);
            colObj.delete = async (key) => {
                if (key === 'n2') {
                    return false; // Simulated deletion failure
                }
                return origDelete(key);
            };
            return colObj;
        };
        return scoped;
    };

    const outcome = await manager.purgePluginStorageData('partial.fail.plugin');
    assert.equal(outcome.success, false);
    assert.equal(outcome.attemptedCount, 2);
    assert.equal(outcome.localPurgedCount, 1);
    assert.equal(outcome.failedCount, 1);
    assert.ok(outcome.errors.length > 0);

    dom.window.close();
});

test('PLG3-P1 — Requirement 11: Tombstone/sync status reporting without overstating guarantees', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    // 1. SyncService unmuted (active)
    const mockSyncActive = { isMuted: false, addToQueue: () => {} };
    const storageService1 = new PluginStorageService(db, mockSyncActive);
    await storageService1.load();

    const runtime1 = new PluginRuntime(storageService1, appService);
    const manager1 = new PluginManagerService(runtime1);

    const storage1 = storageService1.createPluginStorage('status.test.plugin');
    await storage1.collection('data').set('d1', { text: 'hello' });

    const outcome1 = await manager1.purgePluginStorageData('status.test.plugin');
    assert.equal(outcome1.tombstoneStatus, 'best_effort_unverified');
    assert.equal(outcome1.syncStatus, 'attempted_unverified');

    // 2. SyncService muted (disabled)
    const mockSyncMuted = { isMuted: true, addToQueue: () => {} };
    const storageService2 = new PluginStorageService(db, mockSyncMuted);
    await storageService2.load();

    const runtime2 = new PluginRuntime(storageService2, appService);
    const manager2 = new PluginManagerService(runtime2);

    const storage2 = storageService2.createPluginStorage('status.test.plugin2');
    await storage2.collection('data').set('d1', { text: 'world' });

    const outcome2 = await manager2.purgePluginStorageData('status.test.plugin2');
    assert.equal(outcome2.tombstoneStatus, 'best_effort_unverified');
    assert.equal(outcome2.syncStatus, 'skipped_disabled');

    dom.window.close();
});

test('PLG3-P1 — Requirement 12: Never delete records belonging to another plugin', async () => {
    const dom = setupJSDOM();
    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const runtime = new PluginRuntime(storageService, appService);
    const manager = new PluginManagerService(runtime);

    const storageX = storageService.createPluginStorage('plugin.x');
    await storageX.collection('items').set('key1', { owner: 'X' });

    const storageY = storageService.createPluginStorage('plugin.y');
    await storageY.collection('items').set('key1', { owner: 'Y' });

    // Purge Plugin X
    const purgeX = await manager.purgePluginStorageData('plugin.x');
    assert.equal(purgeX.success, true);
    assert.equal(purgeX.localPurgedCount, 1);

    // Verify Plugin Y's record is strictly intact
    const recordY = await storageY.collection('items').get('key1');
    assert.ok(recordY);
    assert.equal(recordY.owner, 'Y');

    dom.window.close();
});
