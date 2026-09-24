// tests/work-sync.test.jsx
import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { useAppStore } from '../js/store.js';

// Setup minimal DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost'
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    writable: true,
    configurable: true
});
global.localStorage = dom.window.localStorage;
global.CustomEvent = dom.window.CustomEvent;

// Mock database
class MockDatabase {
    constructor() {
        this.data = {
            works: [],
            items: [],
            months: [],
            entries: [],
            templates: [],
            reminders: [],
            incomings: [],
            incoming_senders: [],
            deleted_records: []
        };
    }
    async getAll(store) {
        return this.data[store] || [];
    }
    async save(store, item) {
        if (!this.data[store]) this.data[store] = [];
        const idx = this.data[store].findIndex(i => i.id === item.id);
        if (idx >= 0) {
            this.data[store][idx] = item;
        } else {
            this.data[store].push(item);
        }
        return item;
    }
    async delete(store, id) {
        if (!this.data[store]) return;
        this.data[store] = this.data[store].filter(i => i.id !== id);
    }
    async _directDelete(store, id) {
        return this.delete(store, id);
    }
}

// Mock CloudSync
class MockCloudSync {
    constructor() {
        this.client = {}; // truthy client
        this.cloudWorks = [];
        this.pushedWorks = [];
    }
    async pull(table) {
        if (table === 'works') return this.cloudWorks;
        return [];
    }
    async upsert(table, data) {
        if (table === 'works') {
            this.pushedWorks.push(data);
        }
    }
    async delete() {}
}

test('Work log sync pushes local works to cloud and merges cloud works into IDB and Zustand store', async () => {
    const { WorkLogManager } = await import('../js/work-log.js');
    const { SyncService } = await import('../js/sync-service.js');

    const db = new MockDatabase();

    // Add a local work entry to IDB
    const localWork = {
        id: 'work-1',
        name: 'Local Test Work',
        status: 'folyamatban',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    await db.save('works', localWork);

    const mockCloud = new MockCloudSync();
    // Add a cloud-only work
    const cloudWork = {
        id: 'work-2',
        name: 'Cloud Test Work',
        status: 'elvégzett',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    mockCloud.cloudWorks = [cloudWork];

    const configManager = {
        useSupabase: true,
        supabaseConfig: { url: 'https://test.supabase.co', key: 'test-key' },
        setSupabaseEnabled: () => {}
    };

    const syncService = new SyncService(configManager, null);
    syncService.cloud = mockCloud;

    const workLogManager = new WorkLogManager(db, syncService);
    await workLogManager.load();

    const mockApp = {
        db,
        workLogManager,
        items: { load: async () => [] },
        months: { load: async () => [] },
        entries: { load: async () => [] },
        templates: { load: async () => [] },
        reminderManager: { load: async () => [] },
        incomingManager: { load: async () => [] },
        refreshAllTabs: () => {}
    };
    syncService.setApp(mockApp);
    window.app = mockApp;

    // Execute sync
    const results = await syncService.sync();

    assert.strictEqual(results.status, 'success');

    // 1. Check local work was pushed to cloud
    const pushed = mockCloud.pushedWorks.find(w => w.id === 'work-1');
    assert.ok(pushed, 'Local work should be pushed to cloud');
    assert.strictEqual(pushed.name, 'Local Test Work');

    // 2. Check cloud work was merged into IDB
    const idbWorks = await db.getAll('works');
    const mergedInDb = idbWorks.find(w => w.id === 'work-2');
    assert.ok(mergedInDb, 'Cloud work should be merged into IDB');
    assert.strictEqual(mergedInDb.name, 'Cloud Test Work');

    // 3. Check Zustand central store contains both works
    const storeWorks = useAppStore.getState().works;
    assert.strictEqual(storeWorks.length, 2, 'Zustand store should contain 2 works after sync');
    assert.ok(storeWorks.some(w => w.id === 'work-1'));
    assert.ok(storeWorks.some(w => w.id === 'work-2'));
});
