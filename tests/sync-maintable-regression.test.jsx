import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Database, ItemManager, MonthManager, EntryManager } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { useAppStore as useVanillaStore } from '../js/store.js';

test('Test 1 — EntryManager.load() synthesizes cellKey when missing but preserves existing cellKey', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
        url: 'http://localhost/'
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.window.Dexie = Dexie;

    const db = new Database();
    db._enableMockDb();

    // Entry 1: Missing cellKey, has itemId and month
    await db.save('entries', {
        id: 'entry-1',
        itemId: 'item-1',
        month: '2026-09',
        amount: 1234
    });

    // Entry 2: Existing custom cellKey
    await db.save('entries', {
        id: 'entry-2',
        itemId: 'item-1',
        month: '2026-09',
        cellKey: 'custom-key-123',
        amount: 5678
    });

    const entryManager = new EntryManager(db, null);
    await entryManager.load();

    const loadedEntries = entryManager.entries;
    assert.equal(loadedEntries.length, 2);

    const entry1 = loadedEntries.find(e => e.id === 'entry-1');
    const entry2 = loadedEntries.find(e => e.id === 'entry-2');

    // Missing cellKey should be synthesized
    assert.equal(entry1.cellKey, 'item-1_2026-09');

    // Existing custom cellKey should be preserved
    assert.equal(entry2.cellKey, 'custom-key-123');

    dom.window.close();
});

test('Test 2 — Sync Service updates React Zustand Store deterministically using production App.prototype.updateReactStore', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
        url: 'http://localhost/'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.window.Dexie = Dexie;
    globalThis.window.__DISABLE_AUTO_INIT__ = true;

    if (globalThis.navigator) {
        Object.defineProperty(globalThis.navigator, 'onLine', {
            configurable: true,
            get: () => true
        });
    }

    const [{ App }, React, { createRoot }, { useAppStore: useReactStore }, { default: MainTable }, { default: StoreSync }] = await Promise.all([
        import('../js/app.js'),
        import('react'),
        import('react-dom/client'),
        import('../src/store/useAppStore.js'),
        import('../src/components/table/MainTable.jsx'),
        import('../src/components/StoreSync.jsx')
    ]);

    // Reset stores
    useReactStore.setState({
        items: [],
        months: [],
        entries: [],
        isLoaded: false
    });
    useVanillaStore.setState({
        items: [],
        months: [],
        entries: []
    });

    const db = new Database();
    db._enableMockDb();

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://mock.supabase.co', key: 'mock-key' }
    };
    const offlineHandler = { getPendingCount: () => 0, processPendingChanges: async () => 0 };
    const syncService = new SyncService(configManager, offlineHandler);

    // Mock cloud returning cloud data without explicit cellKey for entry
    syncService.cloud.client = {
        from: (storeName) => ({
            select: async (cols) => {
                if (storeName === 'items') {
                    return { data: [{ id: 'item-1', name: 'Kávé', color: '#dbeafe', updated_at: new Date().toISOString() }], error: null };
                }
                if (storeName === 'months') {
                    return { data: [{ month: '2026-09', updated_at: new Date().toISOString() }], error: null };
                }
                if (storeName === 'entries') {
                    return { data: [{ id: 'entry-1', itemId: 'item-1', month: '2026-09', amount: 1500, updated_at: new Date().toISOString() }], error: null };
                }
                return { data: [], error: null };
            },
            upsert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };

    let eventDispatched = false;
    dom.window.addEventListener('app-data-updated', () => {
        eventDispatched = true;
    });

    // Instantiate app prototype so production updateReactStore() & getAppSnapshot() are tested directly
    const app = Object.create(App.prototype);
    Object.assign(app, {
        db,
        items: new ItemManager(db, syncService),
        months: new MonthManager(db, syncService),
        entries: new EntryManager(db, syncService),
        templates: { load: async () => {} },
        reminderManager: { load: async () => {} },
        incomingManager: { load: async () => {} },
        workLogManager: { load: async () => {} },
        config: { eurRate: 400 },
        isBooted: true,
        timeTracker: null,
        activeTab: 'table'
    });

    window.app = app;
    window.useAppStore = useReactStore;
    syncService.setApp(app);

    // Verify production App method exists and is a function
    assert.equal(typeof App.prototype.updateReactStore, 'function');
    assert.equal(typeof App.prototype.getAppSnapshot, 'function');

    const root = createRoot(document.getElementById('root'));
    const { act } = React;

    // Mount StoreSync bridge and MainTable before sync
    await act(async () => {
        root.render(
            React.createElement(React.Fragment, null,
                React.createElement(StoreSync, null),
                React.createElement(MainTable, null)
            )
        );
    });

    // Verify initial empty state
    assert.equal(useReactStore.getState().items.length, 0);

    // Perform sync
    await act(async () => {
        await syncService.sync();
    });

    // Verify app-data-updated event was dispatched by production updateReactStore()
    assert.equal(eventDispatched, true);

    // Verify React Zustand store state
    const reactState = useReactStore.getState();
    assert.equal(reactState.items.length, 1);
    assert.equal(reactState.items[0].name, 'Kávé');
    assert.equal(reactState.months.length, 1);
    assert.equal(reactState.months[0], '2026-09');
    assert.equal(reactState.entries.length, 1);
    assert.equal(reactState.entries[0].cellKey, 'item-1_2026-09');

    // Verify MainTable rendered category name and table element
    const tableEl = document.getElementById('vtTable');
    assert.ok(tableEl);
    assert.ok(document.body.innerHTML.includes('Kávé'));
    assert.ok(!document.body.innerHTML.includes('Nincs még adat'));

    await act(async () => {
        root.unmount();
    });
    dom.window.close();
});
