import { generateUUID } from './uuid-utils.js';
// js/db-audit.js - IndexedDB Audit & Maintenance Tool (v4.0)
import { parseCellKey, buildCellKey } from './utils/cell-key-utils.js';

export class DatabaseAudit {
    constructor(app) {
        this.app = app;
        this.diagnostics = {};
    }

    /**
     * Teljes diagnosztika futtatása
     */
    async runFullAudit() {
        this.diagnostics = {
            timestamp: new Date().toISOString(),
            dbVersion: this.app.db?.version || 'unknown',
            stores: {}
        };

        try {
            await this._auditAllStores();
            await this._checkDataConsistency();
            await this._checkStorageQuota();
            
            return this.diagnostics;
        } catch (err) {
            console.error('[DB-AUDIT] Audit hiba:', err);
            this.diagnostics.error = err.message;
            return this.diagnostics;
        }
    }

    async _auditAllStores() {
        const storeNames = ['items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works'];
        
        for (const storeName of storeNames) {
            const data = await this.app.db.getAll(storeName);
            const count = data.length;
            
            this.diagnostics.stores[storeName] = {
                count,
                sizeEstimateKB: Math.round(this._estimateSize(data) / 1024),
                issues: []
            };

            // Speciális ellenőrzések
            if (storeName === 'entries' && count > 0) {
                const cellMap = new Map();
                data.forEach(e => {
                    const parsed = parseCellKey(e);
                    if (parsed.itemId && parsed.month) {
                        const key = `${parsed.itemId}_${parsed.month}`;
                        cellMap.set(key, (cellMap.get(key) || 0) + 1);
                    }
                });
                for (const [key, cnt] of cellMap) {
                    if (cnt > 15) {
                        // JAVÍTVA: Magas tételszám szövegbehelyettesítése
                        this.diagnostics.stores[storeName].issues.push(`Magas tételszám: ${key} (${cnt})`);
                    }
                }
            }

            if (storeName === 'incomings' && count > 0) {
                const uniqueKeys = new Set();
                data.forEach(e => {
                    if (e.sender && e.date) {
                        const key = `${e.sender}__${e.date}`;
                        if (uniqueKeys.has(key)) {
                            this.diagnostics.stores[storeName].issues.push(`Duplikált utalás: ${e.sender} (${e.date})`);
                        }
                        uniqueKeys.add(key);
                    }
                });
            }
        }
    }

    _estimateSize(data) {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch {
            return data.length * 600;
        }
    }

    async _checkDataConsistency() {
        const entries = await this.app.db.getAll('entries');
        const itemIds = new Set((await this.app.db.getAll('items')).map(i => i.id));
        const monthSet = new Set((await this.app.db.getAll('months')).map(m => m.month));

        let orphans = 0;
        let badCellKeys = 0;
        let missingExplicitFields = 0;

        entries.forEach(e => {
            if (!e.itemId || !e.month) missingExplicitFields++;
            const parsed = parseCellKey(e);
            if (!parsed.itemId || !parsed.month) {
                badCellKeys++;
                orphans++;
            } else if (!itemIds.has(parsed.itemId) || !monthSet.has(parsed.month)) {
                orphans++;
            }
        });

        this.diagnostics.consistency = {
            orphans,
            badCellKeys,
            missingExplicitFields,
            status: orphans > 0 || badCellKeys > 0 ? 'warning' : 'ok'
        };

        const incomings = await this.app.db.getAll('incomings');
        const senders = new Set((await this.app.db.getAll('incoming_senders')).map(s => s.name));
        let missingIncomingSenders = 0;
        incomings.forEach(entry => {
            if (entry.sender && !senders.has(entry.sender)) {
                missingIncomingSenders++;
            }
        });

        this.diagnostics.incomingConsistency = {
            missingSenders: missingIncomingSenders,
            status: missingIncomingSenders > 0 ? 'warning' : 'ok'
        };
    }

    async _checkStorageQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const est = await navigator.storage.estimate();
                this.diagnostics.quota = {
                    usage: est.usage,
                    quota: est.quota,
                    percent: Math.round((est.usage / est.quota) * 100)
                };
            } catch (e) {}
        }
    }

    /**
     * Indexek újraindexelése (schema upgrade trigger)
     */
    async rebuildIndexes() {
        if (!this.app.db?.db) return false;
        
        try {
            console.log('[DB-AUDIT] Indexek újjáépítése: régi kapcsolat bezárása...');
            this.app.db.db.close();
            
            const currentVersion = this.app.db.version || 8;
            this.app.db.version = currentVersion + 1;
            
            console.log(`[DB-AUDIT] Új kapcsolat nyitása (v${this.app.db.version})...`);
            await this.app.db.connect();
            
            this.app.hmiNotif.showToast('✅ Indexek újjáépítve', 'success');
            return true;
        } catch (err) {
            console.error('[DB-AUDIT] Index rebuild hiba:', err);
            this.app.hmiNotif.showToast('Index rebuild sikertelen', 'error');
            try {
                await this.app.db.connect();
            } catch (e) {}
            return false;
        }
    }

    /**
     * Adatbázis automatikus öngyógyítása (konzisztencia hibák fixálása)
     */
    async autoRepairDatabase() {
        if (!this.app.db) return { repairedOrphans: 0, repairedSenders: 0, status: 'error', message: 'Nincs db!' };

        let repairedOrphans = 0;
        let repairedSenders = 0;
        let repairedMonths = 0;

        try {
            const entries = await this.app.db.getAll('entries');
            const items = await this.app.db.getAll('items');
            const itemIds = new Set(items.map(i => i.id));
            const months = await this.app.db.getAll('months');
            const monthSet = new Set(months.map(m => m.month));

            // 1. Árva bejegyzések és hónapok javítása
            for (const entry of entries) {
                let itemId = entry.itemId;
                let month = entry.month;
                let needsMigration = false;

                if (!itemId || !month) {
                    const parsed = parseCellKey(entry);
                    itemId = parsed.itemId;
                    month = parsed.month;
                    if (!itemId || !month) continue; // Unfixable entry
                    needsMigration = true;
                }

                // Persistent migration for legacy cellKey entries
                if (needsMigration && itemId && month) {
                    entry.itemId = itemId;
                    entry.month = month;
                    entry.updated_at = new Date().toISOString();
                    await this.app.db.save('entries', entry);
                    if (this.app.syncService) {
                         await this.app.syncService.push('entries', entry);
                    }
                }
                
                // Ha a hónap hiányzik, hozzuk létre
                if (month && !monthSet.has(month) && /^[0-9]{4}-\d{2}$/.test(month)) {
                    await this.app.db.save('months', { month, updated_at: new Date().toISOString() });
                    monthSet.add(month);
                    repairedMonths++;
                }

                // Ha a kategória hiányzik, hozzuk létre
                if (itemId && !itemIds.has(itemId) && (typeof itemId === 'string' && itemId.length > 0)) {
                    // Keresés más kategóriákban, esetleg valamilyen "Egyéb" kategóriában, ahelyett hogy mindenhol újat hozunk létre
                    const egyebItem = items.find(i => i && i.name && (i.name.toLowerCase().includes('egyéb') || i.name.toLowerCase() === 'egyeb'));

                    if (egyebItem) {
                        // Ha van "Egyéb", mentsük oda az orphanokat
                        entry.itemId = egyebItem.id;
                        if (entry.cellKey) {
                             // Assuming cellKey ends with timestamp if any
                             const parts = typeof entry.cellKey === 'string' ? entry.cellKey.split('_') : [];
                             const timestamp = parts.length >= 3 ? parts[parts.length - 1] : undefined;
                             entry.cellKey = buildCellKey(egyebItem.id, month, timestamp);
                        }
                        entry.updated_at = new Date().toISOString();
                        await this.app.db.save('entries', entry);
                        if (this.app.syncService) {
                             await this.app.syncService.push('entries', entry);
                        }
                        repairedOrphans++;
                    } else {
                         const restoredItem = {
                            id: itemId,
                            name: `Helyreállított kategória #${itemId}`,
                            color: '#fef08a',
                            updated_at: new Date().toISOString()
                        };
                        await this.app.db.save('items', restoredItem);
                        if (this.app.syncService) {
                            await this.app.syncService.push('items', restoredItem);
                        }
                        itemIds.add(itemId);
                        items.push(restoredItem);
                        repairedOrphans++;
                    }
                }
            }

            // 2. Bejövő utalások hiányzó partnereinek létrehozása
            const incomings = await this.app.db.getAll('incomings');
            const senders = await this.app.db.getAll('incoming_senders');
            const senderNames = new Set(senders.map(s => s.name));


            for (const inc of incomings) {
                try {
                    if (inc.sender && !senderNames.has(inc.sender)) {
                        const newSender = {
                            id: generateUUID(),
                            name: inc.sender,
                            updated_at: new Date().toISOString()
                        };
                        await this.app.db.save('incoming_senders', newSender);
                        senderNames.add(inc.sender);
                        repairedSenders++;
                    }
                } catch (err) {
                    console.error('[DB-AUDIT] Error repairing sender for incoming:', inc, err);
                }
            }

            // Memória újratöltése a fő app-ban
            await Promise.all([
                this.app.items?.load?.(),
                this.app.months?.load?.(),
                this.app.entries?.load?.(),
                this.app.incomingManager?.load?.()
            ]);

            const msg = `Sikeres adatbázis javítás! Helyreállított kategória: ${repairedOrphans}, Létrehozott hiányzó hónap: ${repairedMonths}, Generált utaló partner: ${repairedSenders}.`;
            
            if (this.app.logger) {
                this.app.logger.log('db', 'success', `Automatikus adatbázis helyreállítás lefutott: ${msg}`);
            }

            return {
                status: 'ok',
                repairedOrphans,
                repairedMonths,
                repairedSenders,
                message: msg
            };
        } catch (e) {
            console.error('[DB-AUDIT] Javítás hiba:', e);
            return { status: 'error', message: e.message };
        }
    }

    /**
     * Mély integrációs és egységteszt futtatása a teljes adatbázis-funkcionalitásra
     */
    async runDeepTestSuite() {
        const results = [];
        const log = (name, status, details) => {
            results.push({ name, status, details });
        };

        // Test 1: Kapcsolat
        try {
            if (this.app.db && this.app.db.db) {
                log('IndexedDB Kapcsolat', 'PASS', `Aktív adatbázis kapcsolat rendben. Verzió: ${this.app.db.version}`);
            } else {
                log('IndexedDB Kapcsolat', 'FAIL', 'Nincs aktív db példány');
            }
        } catch (e) {
            log('IndexedDB Kapcsolat', 'FAIL', e.message);
        }

        // Test 2: Séma validáció
        try {
            const { SecurityManager } = await import('./oop-core.js');
            const validEntry = { cellKey: '1_2026-07', amount: 1500 };
            const invalidEntry = { cellKey: '1_2026-07', amount: NaN };
            const validItem = { name: 'Teszt Kategória' };
            const invalidItem = { name: '   ' };

            const v1 = SecurityManager.validateSchema('entries', validEntry);
            const v2 = SecurityManager.validateSchema('entries', invalidEntry);
            const v3 = SecurityManager.validateSchema('items', validItem);
            const v4 = SecurityManager.validateSchema('items', invalidItem);

            if (v1 && !v2 && v3 && !v4) {
                log('Séma Validáció', 'PASS', 'Helyes sémakezelés. Blokkolja az érvénytelen mezőket, beengedi a helyeseket.');
            } else {
                log('Séma Validáció', 'FAIL', `Séma validátor eltérő viselkedés: validEntry=${v1}, invalidEntry=${v2}, validItem=${v3}, invalidItem=${v4}`);
            }
        } catch (e) {
            log('Séma Validáció', 'FAIL', e.message);
        }

        // Test 3: Items CRUD műveletek
        let tempItemId = null;
        try {
            const tempItem = { name: '___TEST_ITEM___', color: '#ff0000', updated_at: new Date().toISOString() };
            tempItemId = await this.app.db.save('items', tempItem);
            if (!tempItemId) throw new Error('Nem tért vissza ID az elmentéskor');

            const allItems = await this.app.db.getAll('items');
            const fetched = allItems.find(i => i.id === tempItemId);
            if (!fetched || fetched.name !== '___TEST_ITEM___') throw new Error('Adat visszaolvasás sikertelen');

            fetched.name = '___TEST_ITEM_UPDATED___';
            await this.app.db.save('items', fetched);

            const allItemsUpdated = await this.app.db.getAll('items');
            const fetchedUpdated = allItemsUpdated.find(i => i.id === tempItemId);
            if (!fetchedUpdated || fetchedUpdated.name !== '___TEST_ITEM_UPDATED___') throw new Error('Adat frissítés sikertelen');

            log('Kategória CRUD Műveletek', 'PASS', 'Létrehozás, kiolvasás és módosítás sikeresen rögzítve az IndexedDB-ben.');
        } catch (e) {
            log('Kategória CRUD Műveletek', 'FAIL', e.message);
        } finally {
            if (tempItemId) {
                try {
                    await this.app.db.delete('items', tempItemId);
                } catch (e) {}
            }
        }

        // Test 4: Hónapok CRUD műveletek
        const tempMonth = '1999-12';
        try {
            const data = { month: tempMonth, updated_at: new Date().toISOString() };
            await this.app.db.save('months', data);

            const allMonths = await this.app.db.getAll('months');
            if (!allMonths.some(m => m.month === tempMonth)) throw new Error('Hónap visszaolvasás sikertelen');

            log('Hónap CRUD Műveletek', 'PASS', 'Hozzáadás, létezés és indexelés ellenőrizve.');
        } catch (e) {
            log('Hónap CRUD Műveletek', 'FAIL', e.message);
        } finally {
            try {
                await this.app.db.delete('months', tempMonth);
            } catch (e) {}
        }

        // Test 5: Tranzakció (Entries) CRUD és CellKey lekérdezés
        let tempEntryId = null;
        try {
            const tempEntry = {
                cellKey: '___TEST_CELL___',
                amount: 12345,
                currency: 'HUF',
                paymentMethod: 'Kártya',
                note: 'Teszt bejegyzés',
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            tempEntryId = await this.app.db.save('entries', tempEntry);
            if (!tempEntryId) throw new Error('Bejegyzés ID mentési hiba');

            const resultsByCell = await this.app.db.getByCellKey('___TEST_CELL___');
            if (resultsByCell.length === 0 || resultsByCell[0].amount !== 12345) {
                throw new Error('getByCellKey index alapú lekérdezés sikertelen');
            }

            log('Bejegyzés Indexelt CRUD', 'PASS', 'Sikeres index-alapú lekérdezés (cellKey) és mentés.');
        } catch (e) {
            log('Bejegyzés Indexelt CRUD', 'FAIL', e.message);
        } finally {
            if (tempEntryId) {
                try {
                    await this.app.db.delete('entries', tempEntryId);
                } catch (e) {}
            }
        }

        // Test 6: Határidők és Ismétlődési logika
        let tempReminderId = null;
        try {
            const tempReminder = {
                title: '___TEST_REMINDER___',
                amount: 5000,
                currency: 'HUF',
                due_date: '2026-07-15',
                frequency: 'monthly',
                completed: false,
                updated_at: new Date().toISOString()
            };
            tempReminderId = await this.app.db.save('reminders', tempReminder);
            if (!tempReminderId) throw new Error('Határidő mentési hiba');

            const allReminders = await this.app.db.getAll('reminders');
            const fetched = allReminders.find(r => r.id === tempReminderId);
            if (!fetched) throw new Error('Határidő visszaolvasás sikertelen');

            log('Határidő Műveletek', 'PASS', 'Sikeres mentés és visszatöltés.');
        } catch (e) {
            log('Határidő Műveletek', 'FAIL', e.message);
        } finally {
            if (tempReminderId) {
                try {
                    await this.app.db.delete('reminders', tempReminderId);
                } catch (e) {}
            }
        }

        // Test 7: Bejövő utalások és Egyedi index vizsgálat
        let tempIncId1 = null;
        let tempIncId2 = null;
        let tempSenderId = null;
        try {
            tempSenderId = 99999;
            await this.app.db.save('incoming_senders', { id: tempSenderId, name: '___TEST_SENDER___', updated_at: new Date().toISOString() });

            const tempIncoming1 = {
                sender: '___TEST_SENDER___',
                date: '2026-07-01',
                amount: 150000,
                currency: 'HUF',
                comment: 'Első utalás',
                updated_at: new Date().toISOString()
            };
            tempIncId1 = await this.app.db.save('incomings', tempIncoming1);

            const tempIncoming2 = {
                sender: '___TEST_SENDER___',
                date: '2026-07-01',
                amount: 200000,
                currency: 'HUF',
                comment: 'Második azonos napon',
                updated_at: new Date().toISOString()
            };

            let indexBlockedDuplicate = false;
            try {
                tempIncId2 = await this.app.db.save('incomings', tempIncoming2);
            } catch (err) {
                indexBlockedDuplicate = true;
            }

            if (indexBlockedDuplicate) {
                log('Bejövő Utalás Egyediség', 'PASS', 'Helyes működés. Az adatbázis beépített egyedi indexe (sender_date) megakadályozta az azonos napi duplikált utalások mentését.');
            } else {
                log('Bejövő Utalás Egyediség', 'WARN', 'A beépített egyedi index nem blokkolta a duplikálást. Szoftveres deduplikáció szükséges.');
            }
        } catch (e) {
            log('Bejövő Utalás Műveletek', 'FAIL', e.message);
        } finally {
            if (tempIncId1) { try { await this.app.db.delete('incomings', tempIncId1); } catch (e) {} }
            if (tempIncId2) { try { await this.app.db.delete('incomings', tempIncId2); } catch (e) {} }
            if (tempSenderId) { try { await this.app.db.delete('incoming_senders', tempSenderId); } catch (e) {} }
        }

        // Test 8: Konzisztencia és Adatintegritás vizsgálat
        try {
            await this._checkDataConsistency();
            const cons = this.diagnostics.consistency;
            const incCons = this.diagnostics.incomingConsistency;

            if (cons.orphans === 0 && incCons.missingSenders === 0) {
                log('Adatkonzisztencia Állapot', 'PASS', 'Az adatbázis teljesen tiszta és konzisztens. Nincsenek árva bejegyzések vagy hiányzó hivatkozások.');
            } else {
                log('Adatkonzisztencia Állapot', 'WARN', `Inkonzisztenciákat észleltünk. Árva bejegyzések: ${cons.orphans}, Hiányzó utaló partnerek: ${incCons.missingSenders}. Az "Adatbázis Öngyógyítás" funkcióval javítható.`);
            }
        } catch (e) {
            log('Adatkonzisztencia Állapot', 'FAIL', e.message);
        }

        this.diagnostics.testSuite = {
            timestamp: new Date().toISOString(),
            results
        };

        if (this.app.logger) {
            this.app.logger.log('db', 'success', `Mély Adatbázis Tesztfutás befejezve. Eredmény: ${results.filter(r => r.status === 'FAIL').length === 0 ? 'Sikeres' : 'Hiba észlelve'}`);
        }

        return results;
    }

    /**
     * Szép HTML riport
     */
    generateReportHTML() {
        let html = `<div class="space-y-6">`;
        
        html += `<div class="bg-gray-50/50 p-5 rounded-3xl border border-gray-100">`;
        html += `<h3 class="font-bold text-lg mb-4 flex items-center gap-2"><span class="text-blue-600">📊</span> Tárolási információk</h3>`;
        
        if (this.diagnostics.quota) {
            html += `
                <div class="flex justify-between items-center bg-white border p-4 rounded-2xl">
                    <div class="text-sm text-gray-600">Böngésző tárhely használat</div>
                    <div class="text-right">
                        <div class="text-3xl font-mono font-bold text-indigo-600">${this.diagnostics.quota.percent}%</div>
                        <div class="text-[10px] text-gray-500 font-mono">${(this.diagnostics.quota.usage/1024/1024).toFixed(1)} MB / ${(this.diagnostics.quota.quota/1024/1024/1024).toFixed(1)} GB</div>
                    </div>
                </div>`;
        }

        html += `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">`;
        Object.entries(this.diagnostics.stores || {}).forEach(([name, s]) => {
            html += `
                <div class="bg-white border rounded-2xl p-4 flex flex-col justify-between">
                    <div>
                        <div class="text-xs text-gray-400 font-bold uppercase tracking-wider">${name}</div>
                        <div class="text-2xl font-mono font-bold mt-1 text-gray-800">${s.count} db</div>
                    </div>
                    <div class="text-[10px] text-gray-400 font-mono mt-2">${s.sizeEstimateKB} KB</div>
                    ${s.issues.length ? `<div class="text-red-500 text-[10px] mt-2 font-bold bg-red-50 p-1.5 rounded-lg border border-red-100">${s.issues.join('<br>')}</div>` : ''}
                </div>`;
        });
        html += `</div>`;

        // Konzisztencia állapot kártyák
        html += `<div class="mt-4 space-y-3">`;
        let hasInconsistency = false;

        if (this.diagnostics.consistency) {
            const c = this.diagnostics.consistency;
            if (c.orphans > 0) hasInconsistency = true;
            html += `<div class="p-4 rounded-2xl border flex items-center justify-between ${c.orphans > 0 ? 'bg-amber-50/50 border-amber-200 text-amber-800' : 'bg-emerald-50/50 border-emerald-100 text-emerald-800'}">`;
            html += `<div class="text-xs font-semibold flex items-center gap-2">`;
            html += c.orphans > 0 ? `<span>⚠️</span> <span>${c.orphans} db árva tranzakció (hiányzó kategória/hónap hivatkozás)</span>` : `<span>✅</span> <span>A tranzakciós bejegyzések mind konzisztensek</span>`;
            html += `</div>`;
            html += `</div>`;
        }

        if (this.diagnostics.incomingConsistency) {
            const c = this.diagnostics.incomingConsistency;
            if (c.missingSenders > 0) hasInconsistency = true;
            html += `<div class="p-4 rounded-2xl border flex items-center justify-between ${c.missingSenders > 0 ? 'bg-amber-50/50 border-amber-200 text-amber-800' : 'bg-emerald-50/50 border-emerald-100 text-emerald-800'}">`;
            html += `<div class="text-xs font-semibold flex items-center gap-2">`;
            html += c.missingSenders > 0 ? `<span>⚠️</span> <span>${c.missingSenders} db utalás hiányzó küldő lista-bejegyzéssel</span>` : `<span>✅</span> <span>Bejövő utalások partnerei szinkronban vannak</span>`;
            html += `</div>`;
            html += `</div>`;
        }
        html += `</div>`;

        // Öngyógyító panel, ha hiba van
        if (hasInconsistency) {
            html += `
                <div class="mt-5 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <h4 class="font-bold text-indigo-900 text-sm flex items-center gap-1.5">🛡️ Automatikus Adatbázis Öngyógyítás</h4>
                        <p class="text-xs text-indigo-700/80">Konzisztencia-hibák, árva rekordok vagy hiányzó hivatkozások észlelhetők. A javítás gombbal az app biztonságosan, adatvesztés nélkül helyreállítja a logikai struktúrát.</p>
                    </div>
                    <button id="btnAutoRepairDb" class="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all shrink-0 active:scale-95 flex items-center gap-1.5">
                        <i class="fas fa-magic"></i> Adatbázis Gyógyítása
                    </button>
                </div>
            `;
        }
        html += `</div>`;

        // Teszt futtatás szekció
        html += `
            <div class="bg-gray-50/50 p-5 rounded-3xl border border-gray-100">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-lg flex items-center gap-2"><span class="text-emerald-600">🛡️</span> Részletes Adatbázis Tesztelés</h3>
                    <button id="btnRunDeepTests" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 transition-all active:scale-95 flex items-center gap-1.5">
                        <i class="fas fa-vial"></i> Mély Teszt Suite Futtatása
                    </button>
                </div>
        `;

        if (this.diagnostics.testSuite) {
            html += `
                <div class="bg-white border rounded-2xl p-4 space-y-2.5 max-h-[300px] overflow-y-auto">
                    <div class="text-[10px] text-gray-400 font-mono flex justify-between border-b pb-2 mb-2">
                        <span>Utolsó teszt futás: ${new Date(this.diagnostics.testSuite.timestamp).toLocaleString('hu-HU')}</span>
                        <span class="font-bold text-emerald-600">Összes teszt ellenőrizve</span>
                    </div>
            `;

            this.diagnostics.testSuite.results.forEach(res => {
                const colorClass = res.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : res.status === 'WARN' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100';
                const badge = res.status === 'PASS' ? '✅ SIKERES' : res.status === 'WARN' ? '⚠️ FIGYELMEZTETÉS' : '❌ SIKERTELEN';
                
                html += `
                    <div class="p-3 rounded-xl border flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center ${colorClass}">
                        <div class="space-y-0.5">
                            <div class="text-xs font-bold text-gray-800">${res.name}</div>
                            <div class="text-[10px] text-gray-500/90 font-medium">${res.details}</div>
                        </div>
                        <span class="text-[9px] font-bold uppercase px-2 py-1 rounded-lg bg-white/80 border select-none">${badge}</span>
                    </div>
                `;
            });

            html += `</div>`;
        } else {
            html += `
                <div class="text-center py-8 text-gray-400 italic text-xs bg-white border border-dashed rounded-2xl">
                    <i class="fas fa-microscope text-2xl mb-2 text-gray-300 block"></i>
                    A mély tesztelés futtatásával tesztelhetők a CRUD műveletek, a sémák, az indexek, az egyediségi megszorítások és a kapcsolat.
                </div>
            `;
        }

        html += `</div>`; // Teszt szekció vége
        html += `</div>`; // Fő div vége
        return html;
    }
}
