import { DatabaseAudit } from '../js/db-audit.js';
import { generateUUID } from '../js/uuid-utils.js';
import { Database, ItemManager } from '../js/oop-core.js';

async function runTests() {
    let passed = 0;
    let failed = 0;

    const assert = (condition, message) => {
        if (condition) {
            passed++;
            console.log(`✅ PASS: ${message}`);
        } else {
            failed++;
            console.error(`❌ FAIL: ${message}`);
        }
    };

    // Test 1: legacy cellKey -> persistent itemId + month migration
    const entries = [
        { id: '1', cellKey: 'item1_2026-08_123', amount: 50 },
        { id: '2', cellKey: '2026-08_item2_456', amount: 100 }
    ];
    let savedEntries = [];
    let pushedEntries = [];
    const mockApp = {
        db: {
            getAll: async (store) => {
                if (store === 'entries') return entries;
                if (store === 'items') return [];
                if (store === 'months') return [];
                if (store === 'incomings') return [];
                if (store === 'incoming_senders') return [];
                return [];
            },
            save: async (store, entry) => {
                if (store === 'entries') savedEntries.push(entry);
            }
        },
        syncService: {
            push: async (store, entry) => {
                if (store === 'entries') pushedEntries.push(entry);
            }
        },
        items: { load: async () => {} },
        months: { load: async () => {} },
        entries: { load: async () => {} },
        incomingManager: { load: async () => {} },
        logger: { log: () => {} }
    };
    const audit = new DatabaseAudit(mockApp);
    await audit.autoRepairDatabase();

    assert(savedEntries.length === 2, "Legacy entries were migrated to persistent storage");
    assert(savedEntries[0].itemId === 'item1' && savedEntries[0].month === '2026-08', "Legacy cellKey format 1 properly parsed");
    assert(savedEntries[1].itemId === 'item2' && savedEntries[1].month === '2026-08', "Legacy cellKey format 2 properly parsed");
    assert(pushedEntries.length === 2, "Migrated entries were pushed to sync queue");
    assert(savedEntries[0].updated_at !== undefined, "Migrated entry has updated_at");

    // Test 2: Deleting an item with entries + queue sync
    const db = new Database();
    db._enableMockDb();
    const syncService = {
        queue: [],
        push: async (store, id, isDelete, type) => {
            syncService.queue.push({store, id, isDelete, type});
        }
    };

    db.mockStore['items']['itemX'] = {id: 'itemX', name: 'Item X'};
    db.mockStore['entries']['entry1'] = {id: 'entry1', itemId: 'itemX', month: '2026-08'};
    db.mockStore['entries']['entry2'] = {id: 'entry2', cellKey: 'itemX_2026-08_123'}; // legacy
    db.mockStore['entries']['entry3'] = {id: 'entry3', cellKey: '2026-08_itemX_456'}; // backwards legacy
    db.mockStore['entries']['entry4'] = {id: 'entry4', itemId: 'itemY', month: '2026-08'}; // Should remain

    global.window = {
        app: {
            entries: {
                entries: [
                    {id: 'entry1', itemId: 'itemX', month: '2026-08'},
                    {id: 'entry2', cellKey: 'itemX_2026-08_123'},
                    {id: 'entry3', cellKey: '2026-08_itemX_456'},
                    {id: 'entry4', itemId: 'itemY', month: '2026-08'}
                ]
            }
        }
    };

    const im = new ItemManager(db, syncService);
    im.items = [{id: 'itemX', name: 'Item X'}];

    await im.delete('itemX');

    assert(db.mockStore['items']['itemX'] === undefined, "Item deleted from DB");
    assert(db.mockStore['entries']['entry1'] === undefined, "Explicit field entry deleted from DB");
    assert(db.mockStore['entries']['entry2'] === undefined, "Legacy cellKey entry deleted from DB");
    assert(db.mockStore['entries']['entry3'] === undefined, "Legacy backwards cellKey entry deleted from DB");
    assert(db.mockStore['entries']['entry4'] !== undefined, "Other entry remains in DB");

    const tombstone = db.mockStore['deleted_records']['entries_entry1'];
    assert(tombstone !== undefined && tombstone.record_id === 'entry1', "Tombstone created for explicit entry");
    assert(db.mockStore['deleted_records']['entries_entry2'] !== undefined, "Tombstone created for legacy entry");

    const syncItemDelete = syncService.queue.find(q => q.store === 'items' && q.id === 'itemX' && q.isDelete === true);
    assert(syncItemDelete !== undefined, "Item delete pushed to sync queue");

    const syncEntryDelete = syncService.queue.find(q => q.store === 'entries' && q.id === 'entry1' && q.isDelete === true);
    assert(syncEntryDelete !== undefined, "Entry delete pushed to sync queue");

    const uiMemoryRemains = window.app.entries.entries.find(e => e.id === 'entry4');
    const uiMemoryDeleted = window.app.entries.entries.find(e => e.id === 'entry1');
    assert(uiMemoryRemains !== undefined && uiMemoryDeleted === undefined, "In-memory app array updated correctly");

    console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
