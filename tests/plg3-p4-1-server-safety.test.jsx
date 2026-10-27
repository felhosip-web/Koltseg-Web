import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { PGlite } from '@electric-sql/pglite';

import { Database, ConfigManager } from '../js/oop-core.js';
import { SyncService } from '../js/sync-service.js';
import { PluginStorageService } from '../src/services/plugin/PluginStorageService.js';
import { generateUUID } from '../js/uuid-utils.js';

function setupEnvironment() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost/',
        runScripts: 'dangerously'
    });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.window.indexedDB = globalThis.indexedDB;
    globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
    Object.defineProperty(globalThis, 'navigator', {
        value: dom.window.navigator,
        configurable: true,
        writable: true
    });
    globalThis.localStorage = dom.window.localStorage;
    globalThis.localStorage.clear();
    return dom;
}

async function setupRealPostgres() {
    const pg = new PGlite();
    await pg.exec('CREATE ROLE authenticated; CREATE ROLE anon;');
    await pg.exec('CREATE SCHEMA IF NOT EXISTS auth;');
    await pg.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$ LANGUAGE sql;`);

    const migrationFiles = [
        'supabase/migrations/20260712222340_init_schema.sql',
        'supabase/migrations/20260814000000_add_item_id_month.sql',
        'supabase/migrations/20261007000000_add_plugin_records.sql',
        'supabase/migrations/20261022000000_add_op_id_and_schema_version.sql',
        'supabase/migrations/20261028000000_add_stale_write_and_tombstone_protection.sql'
    ];

    for (const file of migrationFiles) {
        const sql = fs.readFileSync(file, 'utf8');
        await pg.exec(sql);
    }
    return pg;
}

test('REAL SQL PL/pgSQL — Scenario 1: Newer write reaches server before older delayed write', async () => {
    const pg = await setupRealPostgres();

    // 1. Commit newer write at T2
    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-1', 'Newer Version (T2)', '2026-01-01 12:00:00+00');
    `);

    // 2. Delayed older write at T1 (PostgREST upsert ON CONFLICT UPDATE)
    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-1', 'Delayed Older Version (T1)', '2026-01-01 10:00:00+00')
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at;
    `);

    const res = await pg.query("SELECT * FROM items WHERE id = 'item-1';");
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, 'Newer Version (T2)', 'REAL SQL: Stored row retains newer version after trigger suppressed older update');
});

test('REAL SQL PL/pgSQL — Scenario 2: Equal timestamp update with differing payload suppressed', async () => {
    const pg = await setupRealPostgres();

    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-eq', 'Original Version', '2026-01-01 12:00:00+00');
    `);

    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-eq', 'Conflicting Equal Version', '2026-01-01 12:00:00+00')
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at;
    `);

    const res = await pg.query("SELECT * FROM items WHERE id = 'item-eq';");
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, 'Original Version', 'REAL SQL: Equal timestamp update suppressed deterministically in PostgreSQL trigger');
});

test('REAL SQL PL/pgSQL — Scenario 3: Upsert suppressed when active tombstone exists', async () => {
    const pg = await setupRealPostgres();

    // Tombstone at 12:00
    await pg.exec(`
        INSERT INTO deleted_records (id, record_id, table_name, deleted_at, updated_at)
        VALUES ('del-1', 'item-tombstone-1', 'items', '2026-01-01 12:00:00+00', '2026-01-01 12:00:00+00');
    `);

    // Delayed insert/upsert at 11:00
    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-tombstone-1', 'Resurrected Item', '2026-01-01 11:00:00+00')
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at;
    `);

    const res = await pg.query("SELECT * FROM items WHERE id = 'item-tombstone-1';");
    assert.equal(res.rows.length, 0, 'REAL SQL: Item was NOT resurrected in Postgres when active tombstone exists');
});

test('REAL SQL PL/pgSQL — Scenario 4: Legitimate new record insertion succeeds', async () => {
    const pg = await setupRealPostgres();

    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-legit', 'Legitimate New Item', '2026-01-01 10:00:00+00');
    `);

    const res = await pg.query("SELECT * FROM items WHERE id = 'item-legit';");
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, 'Legitimate New Item');
});

test('REAL SQL PL/pgSQL — Scenario 5: Legitimate recreation after tombstone expiry succeeds', async () => {
    const pg = await setupRealPostgres();

    // Tombstone at 10:00
    await pg.exec(`
        INSERT INTO deleted_records (id, record_id, table_name, deleted_at, updated_at)
        VALUES ('del-2', 'item-recreate', 'items', '2026-01-01 10:00:00+00', '2026-01-01 10:00:00+00');
    `);

    // Re-creation at 12:00 (updated_at > deleted_at)
    await pg.exec(`
        INSERT INTO items (id, name, updated_at)
        VALUES ('item-recreate', 'Recreated Item', '2026-01-01 12:00:00+00')
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at;
    `);

    const res = await pg.query("SELECT * FROM items WHERE id = 'item-recreate';");
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, 'Recreated Item', 'REAL SQL: Re-creation allowed when updated_at > tombstone deleted_at');
});

test('REAL SQL PL/pgSQL — Scenario 6: Months table month primary key & plugin_fuel_logs table key mappings', async () => {
    const pg = await setupRealPostgres();

    // 1. Months table tombstone
    await pg.exec(`
        INSERT INTO deleted_records (id, record_id, table_name, deleted_at, updated_at)
        VALUES ('del-m1', '2026-05', 'months', '2026-01-01 12:00:00+00', '2026-01-01 12:00:00+00');
    `);

    // Attempt insert stale month
    await pg.exec(`
        INSERT INTO months (month, updated_at)
        VALUES ('2026-05', '2026-01-01 11:00:00+00')
        ON CONFLICT (month) DO UPDATE SET updated_at = EXCLUDED.updated_at;
    `);

    const resMonth = await pg.query("SELECT * FROM months WHERE month = '2026-05';");
    assert.equal(resMonth.rows.length, 0, 'REAL SQL: months primary key (month) tombstone protection verified in Postgres');

    // 2. plugin_fuel_logs table stale protection
    await pg.exec(`
        INSERT INTO plugin_fuel_logs (id, odo, liters, price, totalCost, updated_at)
        VALUES ('fuel-1', 1000, 40, 600, 24000, '2026-01-01 12:00:00+00');
    `);

    // Stale update
    await pg.exec(`
        INSERT INTO plugin_fuel_logs (id, odo, liters, price, totalCost, updated_at)
        VALUES ('fuel-1', 900, 30, 550, 16500, '2026-01-01 10:00:00+00')
        ON CONFLICT (id) DO UPDATE SET
            odo = EXCLUDED.odo,
            updated_at = EXCLUDED.updated_at;
    `);

    const resFuel = await pg.query("SELECT * FROM plugin_fuel_logs WHERE id = 'fuel-1';");
    assert.equal(resFuel.rows.length, 1);
    assert.equal(Number(resFuel.rows[0].odo), 1000, 'REAL SQL: plugin_fuel_logs trigger stale protection verified in Postgres');
});

test('REAL SQL PL/pgSQL — Scenario 7: Client Sync integration with WASM Postgres boundary', async () => {
    setupEnvironment();
    const pg = await setupRealPostgres();

    const db = new Database('TestDB_WasmSync_' + Date.now(), 12);
    await db.connect();

    const config = new ConfigManager();
    config.useSupabase = true;
    const syncService = new SyncService(config, null);

    // Seed WASM Postgres with T2 row
    await pg.exec(`
        INSERT INTO entries (id, "cellKey", amount, updated_at)
        VALUES ('entry-wasm-1', 'c1_m1', 1000, '2026-01-01 12:00:00+00');
    `);

    // Client attempts stale T1 push via SyncService
    const staleT1Payload = { id: 'entry-wasm-1', cellKey: 'c1_m1', amount: 200, updated_at: '2026-01-01T10:00:00.000Z' };
    syncService.addToQueue('update', staleT1Payload, 'entries');

    syncService.cloud = {
        client: {},
        pull: async (table) => {
            if (table === 'entries') {
                const r = await pg.query('SELECT * FROM entries;');
                return r.rows;
            }
            return [];
        },
        upsert: async (table, data) => {
            const sql = `
                INSERT INTO entries (id, "cellKey", amount, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET
                    "cellKey" = EXCLUDED."cellKey",
                    amount = EXCLUDED.amount,
                    updated_at = EXCLUDED.updated_at;
            `;
            await pg.query(sql, [data.id, data.cellKey || 'c1_m1', data.amount, data.updated_at]);
        },
        delete: async () => {}
    };

    const mockApp = {
        db,
        items: { items: [], load: async () => {} },
        months: { months: [], load: async () => {} },
        entries: { entries: [staleT1Payload], load: async () => {} },
        templates: { templates: [], load: async () => {} },
        reminderManager: { reminders: [], load: async () => {} },
        incomingManager: { incomings: [], senders: [], load: async () => {} },
        workLogManager: { works: [], load: async () => {} },
        pluginStorageService: { load: async () => {}, getAllRecords: () => [] }
    };
    syncService.setApp(mockApp);

    // Process queue
    const queueRes = await syncService.processQueue(true);
    assert.equal(queueRes.succeeded, 1, 'Stale write against WASM Postgres resolves cleanly');

    // Run sync pull reconciliation
    const syncRes = await syncService.sync();
    assert.equal(syncRes.status, 'success');

    // Verify WASM Postgres retains 1000
    const pgCheck = await pg.query("SELECT * FROM entries WHERE id = 'entry-wasm-1';");
    assert.equal(Number(pgCheck.rows[0].amount), 1000, 'REAL SQL: Postgres retains 1000');

    // Verify local IndexedDB updated to 1000
    const localCheck = await db.getAll('entries');
    assert.equal(localCheck.length, 1);
    assert.equal(Number(localCheck[0].amount), 1000, 'Client IndexedDB reconciled to 1000 from Postgres');
});
