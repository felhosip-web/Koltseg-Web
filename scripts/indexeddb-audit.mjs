import { chromium } from 'playwright-core';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  const port = process.env.PLAYWRIGHT_TEST_PORT || 8000;
  const url = `http://127.0.0.1:${port}/index.html`;

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DB]') || text.includes('[SYNC]') || text.includes('[ERROR]')) {
      logs.push(`[PAGE ${msg.type()}] ${text}`);
      console.log(`[PAGE ${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', err => console.error(`[PAGEERROR] ${err.message}`));

  try {
    console.log(`\n🔍 IndexedDB Komprehenzív Audit\n${'='.repeat(60)}`);

    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => window.app?.isBooted === true, { timeout: 20000 });

    // ====================================================================
    // 1. ADATBÁZIS ÁLLAPOT VIZSGÁLAT
    // ====================================================================
    const dbStatus = await page.evaluate(async () => {
      if (!window.app?.db?.db) return { error: 'No DB connection' };
      
      const db = window.app.db.db;
      const stores = Array.from(db.objectStoreNames);
      
      const storeSizes = {};
      for (const storeName of stores) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const getAllReq = store.getAll();
        
        await new Promise((resolve) => {
          getAllReq.onsuccess = () => {
            storeSizes[storeName] = getAllReq.result?.length || 0;
            resolve();
          };
          getAllReq.onerror = () => {
            storeSizes[storeName] = -1;
            resolve();
          };
        });
      }
      
      return {
        dbName: db.name,
        version: db.version,
        stores: stores,
        storeSizes: storeSizes
      };
    });

    console.log('\n✅ ADATBÁZIS ÁLLAPOT:');
    console.log(`   Név: ${dbStatus.dbName}`);
    console.log(`   Verzió: ${dbStatus.version}`);
    console.log(`   Táblák: ${dbStatus.stores.join(', ')}`);
    console.log('   Tartalom:');
    for (const [store, count] of Object.entries(dbStatus.storeSizes)) {
      console.log(`     - ${store}: ${count} rekord`);
    }

    // ====================================================================
    // 2. ITEM MANAGER CRUD TESZT
    // ====================================================================
    console.log('\n✅ ITEM MANAGER CRUD TESZT:');

    const itemTest = await page.evaluate(async () => {
      const results = {};
      try {
        // CREATE
        const item1 = await window.app.items.add('Teszt Kategória 1', '#e0e7ff');
        results.create = { success: true, id: item1.id, name: item1.name };

        const item2 = await window.app.items.add('Teszt Kategória 2', '#dbeafe');
        results.create2 = { success: true, id: item2.id, name: item2.name };

        // READ
        const itemsBefore = window.app.items.items.length;
        results.read = { count: itemsBefore };

        // UPDATE
        const updated = await window.app.items.update(item1.id, { name: 'Módosított Kategória' });
        results.update = { success: true, name: updated?.name };

        // DELETE
        await window.app.items.delete(item2.id);
        const itemsAfter = window.app.items.items.length;
        results.delete = { before: itemsBefore, after: itemsAfter };

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   CREATE (item1): ${itemTest.create?.id ? '✓' : '✗'} - ${itemTest.create?.name}`);
    console.log(`   CREATE (item2): ${itemTest.create2?.id ? '✓' : '✗'} - ${itemTest.create2?.name}`);
    console.log(`   READ: ${itemTest.read?.count} položaj`);
    console.log(`   UPDATE: ${itemTest.update?.success ? '✓' : '✗'} - ${itemTest.update?.name}`);
    console.log(`   DELETE: ${itemTest.delete?.after < itemTest.delete?.before ? '✓' : '✗'} (${itemTest.delete?.before} → ${itemTest.delete?.after})`);

    // ====================================================================
    // 3. MONTH MANAGER TESZT
    // ====================================================================
    console.log('\n✅ MONTH MANAGER TESZT:');

    const monthTest = await page.evaluate(async () => {
      const results = {};
      try {
        const testMonth = '2026-07';
        
        // CREATE
        const before = window.app.months.months.length;
        await window.app.months.add(testMonth);
        const after = window.app.months.months.length;
        results.create = { before, after, added: after > before };

        // READ
        results.read = { months: window.app.months.months };

        // DELETE
        const beforeDelete = window.app.months.months.length;
        await window.app.months.delete(testMonth);
        const afterDelete = window.app.months.months.length;
        results.delete = { before: beforeDelete, after: afterDelete };

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   CREATE: ${monthTest.create?.added ? '✓' : '✗'} (${monthTest.create?.before} → ${monthTest.create?.after})`);
    console.log(`   READ: ${monthTest.read?.months?.length} hónap`);
    console.log(`   DELETE: ${monthTest.delete?.after < monthTest.delete?.before ? '✓' : '✗'}`);

    // ====================================================================
    // 4. ENTRY MANAGER TESZT (CellKey indexing)
    // ====================================================================
    console.log('\n✅ ENTRY MANAGER TESZT:');

    const entryTest = await page.evaluate(async () => {
      const results = {};
      try {
        // CREATE entries
        const entry1 = await window.app.entries.saveEntry({
          cellKey: '1_2026-07',
          amount: 5000,
          currency: 'HUF',
          method: 'Kártya',
          note: 'Test entry'
        });
        results.create = { id: entry1.id, cellKey: entry1.cellKey };

        const entry2 = await window.app.entries.saveEntry({
          cellKey: '1_2026-07',
          amount: 3000,
          currency: 'HUF',
          method: 'Készpénz',
          note: 'Test entry 2'
        });
        results.create2 = { id: entry2.id };

        // CELLKEY SEARCH
        const cellResults = await window.app.entries.getByCellKey('1_2026-07');
        results.cellKeySearch = { found: cellResults.length, results: cellResults };

        // DELETE
        const before = window.app.entries.entries.length;
        await window.app.entries.deleteEntry(entry1.id);
        const after = window.app.entries.entries.length;
        results.delete = { before, after };

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   CREATE (entry1): ${entryTest.create?.id ? '✓' : '✗'} - ${entryTest.create?.cellKey}`);
    console.log(`   CREATE (entry2): ${entryTest.create2?.id ? '✓' : '✗'}`);
    console.log(`   CELLKEY SEARCH: ${entryTest.cellKeySearch?.found} tárgy talált (1_2026-07)`);
    console.log(`   DELETE: ${entryTest.delete?.after < entryTest.delete?.before ? '✓' : '✗'}`);

    // ====================================================================
    // 5. REMINDER MANAGER TESZT
    // ====================================================================
    console.log('\n✅ REMINDER MANAGER TESZT:');

    const reminderTest = await page.evaluate(async () => {
      const results = {};
      try {
        // CREATE
        const reminder = await window.app.reminderManager.add({
          title: 'Test Reminder',
          amount: 10000,
          due_date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
          frequency: 'monthly',
          completed: false
        });
        results.create = { id: reminder.id, title: reminder.title };

        // READ
        results.read = { count: window.app.reminderManager.reminders.length };

        // DELETE
        const before = window.app.reminderManager.reminders.length;
        await window.app.reminderManager.delete(reminder.id);
        const after = window.app.reminderManager.reminders.length;
        results.delete = { before, after };

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   CREATE: ${reminderTest.create?.id ? '✓' : '✗'} - ${reminderTest.create?.title}`);
    console.log(`   READ: ${reminderTest.read?.count} emlékeztető`);
    console.log(`   DELETE: ${reminderTest.delete?.after < reminderTest.delete?.before ? '✓' : '✗'}`);

    // ====================================================================
    // 6. TEMPLATE MANAGER TESZT
    // ====================================================================
    console.log('\n✅ TEMPLATE MANAGER TESZT:');

    const templateTest = await page.evaluate(async () => {
      const results = {};
      try {
        // CREATE
        const template = await window.app.templates.add({
          name: 'Test Template',
          amount: 25000,
          currency: 'HUF',
          method: 'Kártya'
        });
        results.create = { id: template.id, name: template.name };

        // READ
        results.read = { count: window.app.templates.templates.length };

        // DELETE
        const before = window.app.templates.templates.length;
        await window.app.templates.delete(template.id);
        const after = window.app.templates.templates.length;
        results.delete = { before, after };

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   CREATE: ${templateTest.create?.id ? '✓' : '✗'} - ${templateTest.create?.name}`);
    console.log(`   READ: ${templateTest.read?.count} sablon`);
    console.log(`   DELETE: ${templateTest.delete?.after < templateTest.delete?.before ? '✓' : '✗'}`);

    // ====================================================================
    // 7. SCHEMA VALIDÁCIÓ TESZT
    // ====================================================================
    console.log('\n✅ SCHEMA VALIDÁCIÓ TESZT:');

    const schemaTest = await page.evaluate(async () => {
      const results = {};
      try {
        // Items schema test
        try {
          await window.app.db.save('items', { name: '' });
          results.itemsInvalid = false;
        } catch {
          results.itemsInvalid = true;
        }

        // Months schema test
        try {
          await window.app.db.save('months', { month: 'invalid' });
          results.monthsInvalid = false;
        } catch {
          results.monthsInvalid = true;
        }

        // Entries schema test
        try {
          await window.app.db.save('entries', { cellKey: 'valid_key', amount: 'not_a_number' });
          results.entriesInvalid = false;
        } catch {
          results.entriesInvalid = true;
        }

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   Items (üresnév elutasítva): ${schemaTest.itemsInvalid ? '✓' : '✗'}`);
    console.log(`   Months (érvénytelen formátum elutasítva): ${schemaTest.monthsInvalid ? '✓' : '✗'}`);
    console.log(`   Entries (érvénytelen összeg elutasítva): ${schemaTest.entriesInvalid ? '✓' : '✗'}`);

    // ====================================================================
    // 8. DUPLIKÁCIÓ KEZELÉS TESZT
    // ====================================================================
    console.log('\n✅ DUPLIKÁCIÓ KEZELÉS TESZT:');

    const duplicationTest = await page.evaluate(async () => {
      const results = {};
      try {
        // Ugyanazon CategoryID módosítása
        const item = await window.app.items.add('Original', '#dbeafe');
        const id = item.id;

        // UPDATE: ugyanazon ID-val
        const updated = await window.app.items.update(id, { name: 'Updated' });
        const count = window.app.items.items.filter(i => i.id === id).length;
        results.noDuplication = count === 1;
        results.idMatch = updated?.id === id;

        // Cleanup
        await window.app.items.delete(id);

        return results;
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`   Same ID update (nincs duplikáció): ${duplicationTest.noDuplication ? '✓' : '✗'}`);
    console.log(`   ID konzistencia: ${duplicationTest.idMatch ? '✓' : '✗'}`);

    // ====================================================================
    // 9. TRANZAKCIÓ TESZT
    // ====================================================================
    console.log('\n✅ TRANZAKCIÓ TESZT:');

    const transactionTest = await page.evaluate(async () => {
      const results = { success: true, errors: [] };
      try {
        // Multi-step operation
        const item = await window.app.items.add('Multi-step Item', '#e0e7ff');
        const month = '2026-07';

        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        const entry = await window.app.entries.saveEntry({
          cellKey: `${item.id}_${month}`,
          amount: 15000,
          currency: 'HUF',
          method: 'Kártya'
        });

        // Verify all saved correctly
        const items = window.app.items.items.find(i => i.id === item.id);
        const entries = window.app.entries.entries.find(e => e.id === entry.id);

        results.itemSaved = !!items;
        results.entrySaved = !!entries;

        // Cleanup
        if (entries) await window.app.entries.deleteEntry(entry.id);
        if (items) await window.app.items.delete(item.id);

        return results;
      } catch (e) {
        results.success = false;
        results.errors.push(e.message);
        return results;
      }
    });

    console.log(`   Multi-step operáció: ${transactionTest.success ? '✓' : '✗'}`);
    console.log(`   Item mentve: ${transactionTest.itemSaved ? '✓' : '✗'}`);
    console.log(`   Entry mentve: ${transactionTest.entrySaved ? '✓' : '✗'}`);
    if (transactionTest.errors.length > 0) {
      console.log(`   Hibák: ${transactionTest.errors.join(', ')}`);
    }

    // ====================================================================
    // ÖSSZEFOGLALÁS
    // ====================================================================
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ IndexedDB Audit Befejezve');
    console.log(`${'='.repeat(60)}\n`);

    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error('\n❌ AUDIT ERROR:', err);
    await browser.close();
    process.exit(1);
  }
})();
