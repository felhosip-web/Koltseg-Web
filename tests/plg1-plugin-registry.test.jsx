import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database } from '../js/oop-core.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { PluginRegistry } from '../src/services/plugin/PluginRegistry.js';
import { validatePluginManifest, KNOWN_PERMISSIONS } from '../src/services/plugin/PluginManifestValidator.js';
import { createPluginContext } from '../src/services/plugin/PluginCapabilityFactory.js';
import { PluginRuntime } from '../src/services/plugin/PluginRuntime.js';

test('PLG1 — Manifest Contract: Valid manifest is accepted', () => {
    const validManifest = {
        id: 'example.plugin',
        name: 'Example Plugin',
        version: '1.0.0',
        apiVersion: '1',
        description: 'Test description',
        permissions: ['storage:private', 'ui:toast', 'expenses:read']
    };

    assert.equal(validatePluginManifest(validManifest), true);
});

test('PLG1 — Manifest Contract: Missing required fields are rejected deterministically', () => {
    const base = {
        id: 'example.plugin',
        name: 'Example Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    // Missing id
    assert.throws(() => {
        const m = { ...base };
        delete m.id;
        validatePluginManifest(m);
    }, /Missing required field: "id"/);

    // Missing name
    assert.throws(() => {
        const m = { ...base };
        delete m.name;
        validatePluginManifest(m);
    }, /Missing required field: "name"/);

    // Missing version
    assert.throws(() => {
        const m = { ...base };
        delete m.version;
        validatePluginManifest(m);
    }, /Missing required field: "version"/);

    // Missing apiVersion
    assert.throws(() => {
        const m = { ...base };
        delete m.apiVersion;
        validatePluginManifest(m);
    }, /Missing required field: "apiVersion"/);

    // Missing permissions
    assert.throws(() => {
        const m = { ...base };
        delete m.permissions;
        validatePluginManifest(m);
    }, /Missing required field: "permissions"/);
});

test('PLG1 — Manifest Contract: Invalid formats & unsupported versions are rejected', () => {
    const base = {
        id: 'example.plugin',
        name: 'Example Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    // Invalid ID format (spaces)
    assert.throws(() => {
        validatePluginManifest({ ...base, id: 'invalid id with spaces' });
    }, /Invalid ID format/);

    // Invalid version format
    assert.throws(() => {
        validatePluginManifest({ ...base, version: 'v1-beta-alpha' });
    }, /Invalid version format/);

    // Unsupported apiVersion
    assert.throws(() => {
        validatePluginManifest({ ...base, apiVersion: '2' });
    }, /Unsupported apiVersion/);

    // Non-array permissions
    assert.throws(() => {
        validatePluginManifest({ ...base, permissions: 'storage:private' });
    }, /Field "permissions" must be an array/);
});

test('PLG1 — Manifest Contract: Unknown permissions are explicitly rejected (no implicit fallback)', () => {
    const base = {
        id: 'example.plugin',
        name: 'Example Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private', 'super:admin']
    };

    assert.throws(() => {
        validatePluginManifest(base);
    }, /Unknown or invalid permission: "super:admin"/);
});

test('PLG1 — PluginRegistry: Registration, Duplicate ID rejection, and query operations', () => {
    const registry = new PluginRegistry();

    const manifest1 = {
        id: 'plugin.one',
        name: 'Plugin One',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    const manifest2 = {
        id: 'plugin.two',
        name: 'Plugin Two',
        version: '2.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    // Register
    const record1 = registry.register(manifest1);
    assert.equal(record1.manifest.id, 'plugin.one');
    assert.equal(record1.state, 'registered');

    // Duplicate ID -> Reject
    assert.throws(() => {
        registry.register(manifest1);
    }, /Plugin with ID "plugin.one" is already registered/);

    // Invalid setup -> Reject
    assert.throws(() => {
        registry.register(manifest2, 'invalid-non-function-setup');
    }, /Setup must be a function or null/);

    // Query methods
    assert.equal(registry.has('plugin.one'), true);
    assert.equal(registry.has('plugin.two'), false);

    const retrieved = registry.get('plugin.one');
    assert.equal(retrieved.manifest.name, 'Plugin One');

    registry.register(manifest2);
    const list = registry.list();
    assert.equal(list.length, 2);

    // Unregister
    assert.equal(registry.unregister('plugin.one'), true);
    assert.equal(registry.has('plugin.one'), false);
    assert.equal(registry.list().length, 1);
});

test('PLG1 Promise Contract — Invalid plugin ID returns a Promise rejection', async () => {
    const registry = new PluginRegistry();
    const res = registry.initialize(null);
    assert.ok(res instanceof Promise, 'initialize() must return a Promise');
    await assert.rejects(res, /Valid pluginId is required for initialize/);
});

test('PLG1 Promise Contract — Unknown plugin ID returns a Promise rejection', async () => {
    const registry = new PluginRegistry();
    const res = registry.initialize('non.existent.plugin');
    assert.ok(res instanceof Promise, 'initialize() must return a Promise');
    await assert.rejects(res, /Cannot initialize unregistered plugin/);
});

test('PLG1 Promise Contract — Initializing a disposed plugin returns a Promise rejection', async () => {
    const registry = new PluginRegistry();
    registry.register({
        id: 'disposed.contract.plugin',
        name: 'Disposed Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    });
    registry.dispose('disposed.contract.plugin');

    const res = registry.initialize('disposed.contract.plugin');
    assert.ok(res instanceof Promise, 'initialize() must return a Promise');
    await assert.rejects(res, /Cannot initialize disposed plugin/);
});

test('PLG1 Promise Contract — Context creation failure is exposed as a Promise rejection', async () => {
    const failingStorageService = {
        createPluginStorage() {
            throw new Error('Storage service unavailable during context creation');
        }
    };
    const registry = new PluginRegistry(failingStorageService);
    registry.register({
        id: 'corrupted.context.plugin',
        name: 'Corrupted Context Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    });

    const res = registry.initialize('corrupted.context.plugin');
    assert.ok(res instanceof Promise, 'initialize() must return a Promise');
    await assert.rejects(res, /Storage service unavailable during context creation/);
});

test('PLG1 Promise Contract — Initialization with no setup function reaches active and clears initPromise', async () => {
    const registry = new PluginRegistry();
    registry.register({
        id: 'no.setup.plugin',
        name: 'No Setup Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    });

    const rec = await registry.initialize('no.setup.plugin');
    assert.equal(rec.state, 'active');
    assert.equal(rec.initPromise, null, 'initPromise must be cleared after initialization with no setup');
});

test('PLG1 Promise Contract — Successful setup clears initPromise', async () => {
    const registry = new PluginRegistry();
    registry.register({
        id: 'successful.setup.plugin',
        name: 'Successful Setup Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    }, async (ctx) => {
        await new Promise(r => setTimeout(r, 10));
    });

    const rec = await registry.initialize('successful.setup.plugin');
    assert.equal(rec.state, 'active');
    assert.equal(rec.initPromise, null, 'initPromise must be cleared after successful setup');
});

test('PLG1 Promise Contract — Failed setup clears initPromise and preserves rollback behavior', async () => {
    const registry = new PluginRegistry();
    const setupError = new Error('Setup failed intentionally');

    registry.register({
        id: 'failed.setup.plugin',
        name: 'Failed Setup Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    }, () => {
        throw setupError;
    });

    await assert.rejects(async () => {
        await registry.initialize('failed.setup.plugin');
    }, (err) => err === setupError);

    const rec = registry.get('failed.setup.plugin');
    assert.equal(rec.state, 'registered');
    assert.equal(rec.context, null);
    assert.equal(rec.error, setupError);
    assert.equal(rec.initPromise, null, 'initPromise must be cleared after failed setup');
});

test('PLG1 — Sync Setup Lifecycle: Successful synchronous setup resolves and activates plugin', async () => {
    let setupRan = false;
    const registry = new PluginRegistry();

    const manifest = {
        id: 'sync.plugin',
        name: 'Sync Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    registry.register(manifest, (ctx) => {
        setupRan = true;
        assert.ok(ctx.ui);
    });

    const regRecord = registry.get('sync.plugin');
    assert.equal(regRecord.state, 'registered');

    const initRecord = await registry.initialize('sync.plugin');
    assert.equal(setupRan, true);
    assert.equal(initRecord.state, 'active');
});

test('PLG1 — Async Setup Lifecycle: Successful asynchronous setup waits for setup to finish before becoming active', async () => {
    let asyncCompleted = false;
    let resolveSetupPromise;

    const deferredSetupPromise = new Promise(resolve => {
        resolveSetupPromise = resolve;
    });

    const registry = new PluginRegistry();

    const manifest = {
        id: 'async.plugin',
        name: 'Async Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    registry.register(manifest, async (ctx) => {
        await deferredSetupPromise;
        asyncCompleted = true;
    });

    const initPromise = registry.initialize('async.plugin');

    // Deterministic state check before setup completes: state is 'initialized', not 'active'
    const recordBefore = registry.get('async.plugin');
    assert.equal(recordBefore.state, 'initialized');
    assert.equal(asyncCompleted, false);

    // Resolve deferred promise
    resolveSetupPromise();

    // Await completion
    const recordAfter = await initPromise;
    assert.equal(asyncCompleted, true);
    assert.equal(recordAfter.state, 'active');
});

test('PLG1 — Sync & Async Failure Rollback: Synchronous setup failure rolls back state to registered and preserves error', async () => {
    const registry = new PluginRegistry();

    const manifest = {
        id: 'sync.failing.plugin',
        name: 'Sync Failing Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    const syncError = new Error('Sync setup exception');
    registry.register(manifest, () => {
        throw syncError;
    });

    await assert.rejects(async () => {
        await registry.initialize('sync.failing.plugin');
    }, (err) => err === syncError);

    const record = registry.get('sync.failing.plugin');
    assert.equal(record.state, 'registered');
    assert.equal(record.context, null);
    assert.equal(record.error, syncError);
});

test('PLG1 — Sync & Async Failure Rollback: Asynchronous setup rejection rolls back state to registered and preserves error', async () => {
    let rejectSetupPromise;
    const deferredRejectPromise = new Promise((_, reject) => {
        rejectSetupPromise = reject;
    });

    const registry = new PluginRegistry();

    const manifest = {
        id: 'async.failing.plugin',
        name: 'Async Failing Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    const asyncError = new Error('Async network failure during plugin init');
    registry.register(manifest, async () => {
        await deferredRejectPromise;
    });

    const initPromise = registry.initialize('async.failing.plugin');

    // Reject the setup promise deterministically
    rejectSetupPromise(asyncError);

    await assert.rejects(async () => {
        await initPromise;
    }, (err) => err === asyncError);

    const record = registry.get('async.failing.plugin');
    assert.equal(record.state, 'registered');
    assert.equal(record.context, null);
    assert.equal(record.error, asyncError);
});

test('PLG1 — Repeated Initialization: Already-active plugin is not re-initialized', async () => {
    let setupCount = 0;
    const registry = new PluginRegistry();

    const manifest = {
        id: 'repeated.plugin',
        name: 'Repeated Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    registry.register(manifest, () => {
        setupCount++;
    });

    const rec1 = await registry.initialize('repeated.plugin');
    assert.equal(setupCount, 1);
    assert.equal(rec1.state, 'active');

    const rec2 = await registry.initialize('repeated.plugin');
    assert.equal(setupCount, 1, 'Setup must NOT run again for active plugin');
    assert.equal(rec2.state, 'active');
});

test('PLG1 — Concurrent Initialization: Simultaneous calls execute setup exactly once and return same result', async () => {
    let setupExecutions = 0;
    let resolveSetupPromise;

    const deferredPromise = new Promise(resolve => {
        resolveSetupPromise = resolve;
    });

    const registry = new PluginRegistry();

    const manifest = {
        id: 'concurrent.plugin',
        name: 'Concurrent Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    registry.register(manifest, async (ctx) => {
        setupExecutions++;
        await deferredPromise;
    });

    // Invoke initialize simultaneously twice
    const p1 = registry.initialize('concurrent.plugin');
    const p2 = registry.initialize('concurrent.plugin');

    resolveSetupPromise();

    const [rec1, rec2] = await Promise.all([p1, p2]);

    assert.equal(setupExecutions, 1, 'Concurrent initialization must execute setup exactly once');
    assert.equal(rec1.state, 'active');
    assert.equal(rec2.state, 'active');
});

test('PLG1 — Disposal During Pending Initialization: Disposal during pending setup prevents reactivation and preserves disposed state', async () => {
    let resolveSetupPromise;
    const deferredPromise = new Promise(resolve => {
        resolveSetupPromise = resolve;
    });

    const registry = new PluginRegistry();

    const manifest = {
        id: 'disposal.pending.plugin',
        name: 'Disposal Pending Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    };

    registry.register(manifest, async (ctx) => {
        await deferredPromise;
    });

    const initPromise = registry.initialize('disposal.pending.plugin');

    // Plugin is currently in 'initialized' state
    assert.equal(registry.get('disposal.pending.plugin').state, 'initialized');

    // Call dispose while initialization is pending
    registry.dispose('disposal.pending.plugin');

    // State is now 'disposed' and context is null
    const recordDisposed = registry.get('disposal.pending.plugin');
    assert.equal(recordDisposed.state, 'disposed');
    assert.equal(recordDisposed.context, null);

    // Resolve pending setup
    resolveSetupPromise();

    // The in-flight initialization promise rejects because plugin was disposed
    await assert.rejects(async () => {
        await initPromise;
    }, /was disposed during initialization/);

    // Verify plugin NEVER reactivated and remains 'disposed' with context null
    const finalRecord = registry.get('disposal.pending.plugin');
    assert.equal(finalRecord.state, 'disposed');
    assert.equal(finalRecord.context, null);
});

test('PLG1 — Dispose Behavior: Idempotent disposal and prohibition of initializing disposed plugin', async () => {
    const registry = new PluginRegistry();

    const manifest = {
        id: 'dispose.plugin',
        name: 'Dispose Plugin',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['ui:toast']
    };

    registry.register(manifest);

    await registry.initialize('dispose.plugin');

    // Dispose
    assert.equal(registry.dispose('dispose.plugin'), true);
    assert.equal(registry.get('dispose.plugin').state, 'disposed');

    // Double dispose is idempotent
    assert.equal(registry.dispose('dispose.plugin'), true);
    assert.equal(registry.get('dispose.plugin').state, 'disposed');

    // Cannot initialize disposed plugin
    await assert.rejects(async () => {
        await registry.initialize('dispose.plugin');
    }, /Cannot initialize disposed plugin/);
});

test('PLG1 — Permission Enforcement & Context Security: Capabilities strictly granted per manifest', async () => {
    let toastCalled = false;
    const mockAppService = {
        showToast: (msg, type) => {
            toastCalled = true;
        },
        getAppInstance: () => ({
            items: { items: [{ id: 'item1', name: 'Kávé' }] }
        })
    };

    const storageService = new PluginStorageService(null, null);
    const registry = new PluginRegistry(storageService, mockAppService);

    // Plugin 1: Has 'storage:private' and 'ui:toast', but NOT 'expenses:read'
    const manifest1 = {
        id: 'perm.plugin1',
        name: 'Permission Plugin 1',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private', 'ui:toast']
    };

    let ctx1 = null;
    registry.register(manifest1, (ctx) => { ctx1 = ctx; });
    await registry.initialize('perm.plugin1');

    // Storage is provided
    assert.ok(ctx1.storage);

    // Toast succeeds
    ctx1.ui.showToast('Hello');
    assert.equal(toastCalled, true);

    // expenses:read capability throws host permission error
    assert.throws(() => {
        ctx1.api.getCategoryList();
    }, /lacks "expenses:read" permission/);

    // Plugin 2: Has NO 'storage:private'
    const manifest2 = {
        id: 'perm.plugin2',
        name: 'Permission Plugin 2',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['expenses:read']
    };

    let ctx2 = null;
    registry.register(manifest2, (ctx) => { ctx2 = ctx; });
    await registry.initialize('perm.plugin2');

    // Storage is null when permission missing
    assert.equal(ctx2.storage, null);

    // expenses:read succeeds
    const categories = ctx2.api.getCategoryList();
    assert.equal(categories.length, 1);
    assert.equal(categories[0].name, 'Kávé');

    // ui:toast capability throws host permission error
    assert.throws(() => {
        ctx2.ui.showToast('Test');
    }, /lacks "ui:toast" permission/);

    // Security check: Context objects are frozen and permissions cannot be mutated by plugin
    assert.ok(Object.isFrozen(ctx1));
    assert.ok(Object.isFrozen(ctx1.ui));
    assert.ok(Object.isFrozen(ctx1.api));

    assert.throws(() => {
        ctx1.permissions = ['expenses:read', 'storage:private', 'ui:toast'];
    }, TypeError);
});

test('PLG1 — Storage Isolation: Scoped plugin storage prevents cross-plugin data access', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    const db = new Database();
    db._enableMockDb();

    const storageService = new PluginStorageService(db, null);
    await storageService.load();

    const registry = new PluginRegistry(storageService, null);

    let storageA = null;
    let storageB = null;

    registry.register({
        id: 'plugin.a',
        name: 'Plugin A',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    }, (ctx) => { storageA = ctx.storage; });

    registry.register({
        id: 'plugin.b',
        name: 'Plugin B',
        version: '1.0.0',
        apiVersion: '1',
        permissions: ['storage:private']
    }, (ctx) => { storageB = ctx.storage; });

    await registry.initialize('plugin.a');
    await registry.initialize('plugin.b');

    const collA = storageA.collection('shared_name');
    const collB = storageB.collection('shared_name');

    await collA.set('k1', { value: 'Secret A' });
    await collB.set('k1', { value: 'Secret B' });

    assert.equal((await collA.get('k1')).value, 'Secret A');
    assert.equal((await collB.get('k1')).value, 'Secret B');

    // Clear Plugin A collection does not affect Plugin B
    await collA.clear();
    assert.equal(await collA.get('k1'), null);
    assert.equal((await collB.get('k1')).value, 'Secret B');

    dom.window.close();
});

test('PLG1 — First-Party Test Plugin Example', async () => {
    const mockAppService = {
        toastLog: [],
        showToast(msg, type) {
            this.toastLog.push({ msg, type });
        }
    };

    const storageService = new PluginStorageService(null, null);
    const registry = new PluginRegistry(storageService, mockAppService);

    // Declarative manifest contract
    const testPluginManifest = {
        id: 'firstparty.test.plugin',
        name: 'First Party Test Plugin',
        version: '1.0.0',
        apiVersion: '1',
        description: 'Infrastructure test plugin verifying PLG1 host contract',
        permissions: ['storage:private', 'ui:toast']
    };

    let testPluginOutput = null;

    // Register test plugin
    registry.register(testPluginManifest, async (ctx) => {
        // Use toast capability
        ctx.ui.showToast('Test plugin initialized', 'info');

        // Use scoped storage capability
        const notes = ctx.storage.collection('test_notes');
        await notes.set('n1', { content: 'First-party note' });
        testPluginOutput = await notes.get('n1');
    });

    // Initialize test plugin and await real initialization promise without arbitrary sleep
    const record = await registry.initialize('firstparty.test.plugin');

    assert.equal(record.state, 'active');
    assert.equal(mockAppService.toastLog.length, 1);
    assert.equal(mockAppService.toastLog[0].msg, 'Test plugin initialized');

    assert.ok(testPluginOutput);
    assert.equal(testPluginOutput.content, 'First-party note');

    // Dispose test plugin
    registry.dispose('firstparty.test.plugin');
    assert.equal(registry.get('firstparty.test.plugin').state, 'disposed');
});

test('PLG1 — Static Security Boundary: Codebase scan for forbidden execution and handle patterns', () => {
    const pluginDir = path.resolve(process.cwd(), 'src/services/plugin');
    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));

    const forbiddenPatterns = [
        { pattern: /\beval\s*\(/, description: 'eval()' },
        { pattern: /new\s+Function\s*\(/, description: 'new Function()' },
        { pattern: /Function\s*\(/, description: 'Function()' },
        { pattern: /window\.app\b/, description: 'window.app' },
        { pattern: /globalThis\.app\b/, description: 'globalThis.app' },
        { pattern: /rawIndexedDB/, description: 'rawIndexedDB' },
        { pattern: /rawSupabase/, description: 'rawSupabase' }
    ];

    for (const file of files) {
        const filePath = path.join(pluginDir, file);
        const code = fs.readFileSync(filePath, 'utf8');

        for (const { pattern, description } of forbiddenPatterns) {
            assert.equal(pattern.test(code), false, `Forbidden pattern "${description}" found in ${file}`);
        }
    }
});
