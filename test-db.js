import 'fake-indexeddb/auto';
import { Database } from './js/oop-core.js';

global.window = { location: { pathname: '/index.html' }, indexedDB: global.indexedDB };

async function run() {
    const db = new Database('TestDB', 11);
    await db.connect();
    
    console.log("DB connected");
    await db.save('entries', { id: 'uuid-123', cellKey: '1_2026-07', amount: 1500 });
    await db.save('entries', { id: 'uuid-456', cellKey: '1_2026-07', amount: 500 });
    
    const byCell = await db.getByCellKey('1_2026-07');
    console.log("By cell (should be 2 items):", byCell.length);
    
    await db.delete('entries', 'uuid-123');
    const byCellAfterDel = await db.getByCellKey('1_2026-07');
    console.log("By cell after delete (should be 1 item):", byCellAfterDel.length);

    // Let's check deleted_records
    const deleted = await db.getAll('deleted_records');
    console.log("Deleted records:", deleted);
}

run().catch(console.error);
