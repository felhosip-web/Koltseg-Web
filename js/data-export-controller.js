// js/data-export-controller.js - Teljes Export funkciók (Excel, PDF, JSON)
import { parseCellKey } from './utils/cell-key-utils.js';
import { generateUUID } from './uuid-utils.js';

function isValidCalendarDate(dateStr) {
    if (typeof dateStr !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) return false;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dateObj = new Date(year, month - 1, day);
    return dateObj.getFullYear() === year &&
           dateObj.getMonth() === month - 1 &&
           dateObj.getDate() === day;
}

export class DataExportController {
    /**
     * Konstruktor - Data Export vezérlő inicializálása
     * @param {Object} app - Az alkalmazás fő példánya
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * Alkalmazás adatainak lekérdezése
     * @returns {Object} Az alkalmazás összes adata
     */
    _getData() {
        return {
            entries: this.app.entries?.entries || [],
            items: this.app.items?.items || [],
            months: this.app.months?.months || [],
            incomings: this.app.incomingManager?.incomings || [],
            incoming_senders: this.app.incomingManager?.senders || []
        };
    }

    /**
     * Teljes backup adat struktúra felépítése
     * @returns {Object} A backup adatstruktúra
     */
    _buildBackupData() {
        return {
            version: 'v4.0',
            timestamp: new Date().toISOString(),
            appVersion: 'Költség Nyilvántartó v4.0',
            items: this.app.items?.items || [],
            months: this.app.months?.months || [],
            entries: this.app.entries?.entries || [],
            templates: this.app.templates?.templates || [],
            reminders: this.app.reminderManager?.reminders || [],
            incomings: this.app.incomingManager?.incomings || [],
            incoming_senders: this.app.incomingManager?.senders || [],
            works: this.app.workLogManager?.works || [],
            supabaseConfig: {
                url: this.app.config?.supabaseConfig?.url || '',
                key: this.app.config?.supabaseConfig?.key || '',
                useCloud: this.app.config?.useSupabase || false
            },
            settings: {
                eurRate: this.app.config?.eurRate || 400
            }
        };
    }

    // ==================== EXCEL EXPORT ====================
    /**
     * Excel formátumú export generálása és letöltése
     * @returns {Promise<void>}
     */
    async exportExcel() {
        this.app.setSystemStatus?.('Részletes Excel generálása...', false);

        try {
            const { entries, items, months } = this._getData();
            if (entries.length === 0) {
                await this.app.hmiNotif.showInfo('Nincs adat', 'Nincs megjeleníthető adat az Excel exportáláshoz!');
                return;
            }

            const wb = XLSX.utils.book_new();
            const eurRate = this.app.config?.eurRate || 400;

            // 1. FŐ ADATLAP - Mátrix
            const mainData = this._buildMainMatrix(items, months, entries, eurRate);
            const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
            mainSheet['!cols'] = [{ wch: 35 }, ...Array(months.length * 4).fill({ wch: 14 })];
            XLSX.utils.book_append_sheet(wb, mainSheet, 'Költség Mátrix');

            // 2. FIZETÉSI MÓD BONTÁS
            const methodData = this._buildMethodBreakdown(entries, months, eurRate);
            const methodSheet = XLSX.utils.aoa_to_sheet(methodData);
            methodSheet['!cols'] = [{ wch: 20 }, ...Array(months.length + 1).fill({ wch: 16 })];
            XLSX.utils.book_append_sheet(wb, methodSheet, 'Fizetési mód Bontás');

            // 3. STATISZTIKA LAP
            const statsData = this._buildStatsSheet(entries, items, months, eurRate);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(statsData), 'Statisztika');

            XLSX.writeFile(wb, `koltseg_nyilvantartas_${new Date().toISOString().slice(0,10)}.xlsx`);

            this.app.hmiNotif.showToast('✅ Excel fájl letöltve!', 'success');
            this.app.setSystemStatus?.('Excel export kész', false);

        } catch (err) {
            console.error('[EXCEL ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ Excel generálási hiba', err.message || 'Ismeretlen hiba');
            this.app.setSystemStatus?.('Excel hiba!', true);
        }
    }

    // ==================== PDF EXPORT ====================
    /**
     * PDF formátumú export generálása és letöltése
     * @returns {Promise<void>}
     */
    async exportPdf() {
        this.app.setSystemStatus?.('Részletes PDF generálása...', false);

        try {
            const { entries, items, months } = this._getData();
            if (entries.length === 0) {
                await this.app.hmiNotif.showInfo('Nincs adat', 'Nincs megjeleníthető adat a PDF exportáláshoz!');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
            const eurRate = this.app.config?.eurRate || 400;
            let y = 20;

            // Load and set Roboto font to support Hungarian accents properly
            try {
                doc.addFont("https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf", "Roboto", "normal");
                doc.setFont("Roboto");
            } catch (fontErr) {
                console.warn("Could not load Roboto font for Hungarian accents, falling back to Helvetica", fontErr);
                doc.setFont('helvetica', 'bold');
            }

            doc.setFontSize(18);
            doc.text('KÖLTSÉG NYILVÁNTARTÁS - RÉSZLETES ÖSSZESÍTŐ', 20, y);
            y += 8;

            doc.setFontSize(11);
            doc.text(`Generálva: ${new Date().toLocaleDateString('hu-HU')} | EUR árfolyam: ${eurRate} Ft/EUR`, 20, y);
            y += 15;

            // Részletes táblázat
            const tableData = this._buildPdfTableData(items, months, entries, eurRate);
            doc.autoTable({
                startY: y,
                head: [tableData.headers],
                body: tableData.rows,
                theme: 'grid',
                styles: { font: "Roboto", fontSize: 8.5, cellPadding: 4 },
                headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 48 } }
            });

            doc.save(`koltseg_nyilvantartas_${new Date().toISOString().slice(0,10)}.pdf`);

            this.app.hmiNotif.showToast('✅ PDF fájl letöltve!', 'success');
            this.app.setSystemStatus?.('PDF export kész', false);

        } catch (err) {
            console.error('[PDF ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ PDF generálási hiba', err.message || 'Ismeretlen hiba');
            this.app.setSystemStatus?.('PDF hiba!', true);
        }
    }

    // ==================== JSON EXPORT / IMPORT ====================
    /**
     * JSON formátumú teljes backup export
     * @returns {Promise<void>}
     */
    async exportJson() {
        this.app.setSystemStatus?.('Teljes JSON backup készítése...', false);

        try {
            const backupData = this._buildBackupData();

            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const anchor = document.createElement('a');
            anchor.href = dataStr;
            anchor.download = `koltseg_full_backup_${new Date().toISOString().slice(0,10)}.json`;
            anchor.click();

            this.app.hmiNotif.showToast('✅ JSON backup letöltve!', 'success');
            this.app.setSystemStatus?.('JSON export kész', false);

        } catch (err) {
            console.error('[JSON EXPORT ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ JSON export hiba', err.message || 'Ismeretlen hiba');
        }
    }

    /**
     * JSON backup import fájlból
     * @returns {Promise<void>}
     */
    async importJson() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);

                    if (!importedData.items || !importedData.entries) {
                        await this.app.hmiNotif.showInfo('Érvénytelen fájl', 'A kiválasztott fájl nem érvényes backup!');
                        return;
                    }

                    const confirmed = await this.app.hmiNotif.showConfirm({
                        title: '⚠️ TELJES ADATBÁZIS FELÜLÍRÁSA',
                        message: `Importálsz egy teljes backupot?\nVerzió: ${importedData.version || 'ismeretlen'}\nDátum: ${importedData.timestamp || 'ismeretlen'}\n\nEz felülírja az összes jelenlegi adatot!`,
                        type: 'danger',
                        confirmText: 'IGEN, FELÜLÍROM'
                    });

                    if (!confirmed) return;

                    await this._performImport(importedData);

                } catch (err) {
                    console.error('[JSON IMPORT ERROR]', err);
                    await this.app.hmiNotif.showInfo('❌ Importálási hiba', err.message || 'Érvénytelen JSON formátum');
                }
            };
            reader.readAsText(file);
        };

        fileInput.click();
    }

    async _performImport(data) {
        const dbRaw = this.app.db.db || this.app.db._db;
        if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');

        const tx = dbRaw.transaction([
            'items',
            'months',
            'entries',
            'templates',
            'reminders',
            'incomings',
            'incoming_senders',
            'works'
        ], 'readwrite');

        tx.objectStore('items').clear();
        tx.objectStore('months').clear();
        tx.objectStore('entries').clear();
        tx.objectStore('templates').clear();
        tx.objectStore('reminders').clear();
        tx.objectStore('incomings').clear();
        tx.objectStore('incoming_senders').clear();
        tx.objectStore('works').clear();

        data.items?.forEach(item => tx.objectStore('items').put(item));
        data.months?.forEach(m => {
            if (typeof m === 'string') tx.objectStore('months').put({ month: m });
            else tx.objectStore('months').put(m);
        });
        data.entries?.forEach(entry => tx.objectStore('entries').put(entry));
        data.templates?.forEach(tpl => tx.objectStore('templates').put(tpl));
        data.reminders?.forEach(rem => tx.objectStore('reminders').put(rem));
        data.incomings?.forEach(incoming => tx.objectStore('incomings').put(incoming));
        data.incoming_senders?.forEach(sender => tx.objectStore('incoming_senders').put(sender));
        data.works?.forEach(work => tx.objectStore('works').put(work));

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('Import tranzakciós hiba'));
        });

        await Promise.all([
            this.app.items.load(),
            this.app.months.load(),
            this.app.entries.load(),
            this.app.templates?.load?.(),
            this.app.reminderManager?.load?.(),
            this.app.incomingManager?.load?.(),
            this.app.workLogManager?.load?.()
        ]);

        this.app.updateReactStore?.();
        this.app.updateReminderStatus?.();

        this.app.hmiNotif.showToast('✅ Backup sikeresen visszaállítva!', 'success');
    }

    // ==================== SEGÉD FÜGGVÉNYEK ====================
    _buildMainMatrix(items, months, entries, eurRate) {
        const data = [['Kategória', ...months.flatMap(m => [`${m} HUF`, `${m} EUR`, `${m} Összesen Ft`, `${m} Tételek`])]];

        items.forEach(item => {
            const row = [item.name];
            months.forEach(month => {
                const cellEntries = entries.filter(e => {
                    const parsed = parseCellKey(e);
                    return parsed.itemId === item.id && parsed.month === month;
                });

                let huf = 0, eur = 0;
                cellEntries.forEach(e => {
                    if (e.currency === 'EUR') eur += e.amount;
                    else huf += e.amount;
                });

                row.push(huf || 0, eur || 0, huf + Math.round(eur * eurRate), cellEntries.length);
            });
            data.push(row);
        });

        return data;
    }

    _buildMethodBreakdown(entries, months, eurRate) {
        const methods = ['Kártya', 'Készpénz', 'Utalás', 'Egyéb'];
        const data = [['Fizetési mód', ...months, 'Összesen']];

        methods.forEach(method => {
            const row = [method];
            let methodTotal = 0;
            months.forEach(month => {
                let sum = 0;
                entries.forEach(e => {
                    const parsed = parseCellKey(e);
                    if (parsed.month === month && e.paymentMethod === method) {
                        sum += e.currency === 'EUR' ? Math.round(e.amount * eurRate) : e.amount;
                    }
                });
                row.push(sum);
                methodTotal += sum;
            });
            row.push(methodTotal);
            data.push(row);
        });

        return data;
    }

    _buildStatsSheet(entries, items, months, eurRate) {
        let total = 0, card = 0, cash = 0, transfer = 0;
        entries.forEach(e => {
            const amt = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
            total += amt;
            if (e.paymentMethod === 'Kártya') card += amt;
            else if (e.paymentMethod === 'Készpénz') cash += amt;
            else if (e.paymentMethod === 'Utalás') transfer += amt;
        });

        return [
            ['STATISZTIKAI ÖSSZESÍTŐ', ''],
            ['Generálva', new Date().toLocaleString('hu-HU')],
            ['EUR Árfolyam', eurRate + ' Ft'],
            [''],
            ['Kategóriák száma', items.length],
            ['Hónapok száma', months.length],
            ['Bejegyzések száma', entries.length],
            [''],
            ['Összes kiadás', total.toLocaleString('hu-HU') + ' Ft'],
            ['Kártya', card.toLocaleString('hu-HU') + ' Ft'],
            ['Készpénz', cash.toLocaleString('hu-HU') + ' Ft'],
            ['Utalás', transfer.toLocaleString('hu-HU') + ' Ft']
        ];
    }

    _buildPdfTableData(items, months, entries, eurRate) {
        const tableColumn = ['Kategória', ...months.map(m => m + '\n(HUF | EUR | Össz)')];
        const tableRows = [];

        items.forEach(item => {
            const row = [item.name];

            months.forEach(month => {
                const cellEntries = entries.filter(e => {
                    const parsed = parseCellKey(e);
                    return parsed.itemId === item.id && parsed.month === month;
                });

                let totalHUF = 0;
                let totalEUR = 0;

                cellEntries.forEach(e => {
                    if (e.currency === 'EUR') {
                        totalEUR += e.amount;
                    } else {
                        totalHUF += e.amount;
                    }
                });

                const totalHUF_Ft = totalHUF;
                const totalEUR_Ft = Math.round(totalEUR * eurRate);
                const grandCellTotal = totalHUF_Ft + totalEUR_Ft;

                let cellText = '-';
                if (grandCellTotal > 0) {
                    cellText = `${totalHUF_Ft.toLocaleString('hu-HU')} | ${totalEUR} EUR | ${grandCellTotal.toLocaleString('hu-HU')} Ft`;

                    // Ha több tétel van, jelezzük
                    if (cellEntries.length > 1) {
                        cellText += `\n(${cellEntries.length} tétel)`;
                    }
                }

                row.push(cellText);
            });

            tableRows.push(row);
        });

        // Összesítő sor
        const totalRow = ['ÖSSZESEN'];
        let grandTotalAll = 0;

        months.forEach(month => {
            let monthHUF = 0, monthEUR = 0;
            entries.forEach(e => {
                if (parseCellKey(e).month === month) {
                    if (e.currency === 'EUR') monthEUR += e.amount;
                    else monthHUF += e.amount;
                }
            });
            const monthTotal = monthHUF + Math.round(monthEUR * eurRate);
            totalRow.push(monthTotal > 0 ?
                `${monthHUF.toLocaleString('hu-HU')} | ${monthEUR} EUR | ${monthTotal.toLocaleString('hu-HU')} Ft` : '-');
            grandTotalAll += monthTotal;
        });

        tableRows.push(totalRow);

        return {
            headers: tableColumn,
            rows: tableRows,
            grandTotalAll: grandTotalAll
        };
    }

    // ==================== WORK LOG EXPORT ====================
    async exportWorkExcel() {
        this.app.setSystemStatus?.('Munka Excel generálása...', false);
        try {
            const works = this.app.workLogManager?.works || [];
            if (works.length === 0) {
                await this.app.hmiNotif.showInfo('Nincs adat', 'Nincs megjeleníthető munka adat az Excel exportáláshoz!');
                return;
            }

            const wb = XLSX.utils.book_new();
            
            const data = [['Sorszám', 'Munka Neve', 'Leírás', 'Helyszín', 'Dátum', 'Időtartam (nap)', 'Státusz']];
            
            works.forEach((w, idx) => {
                data.push([
                    idx + 1,
                    w.name || '',
                    w.description || '',
                    w.location || '',
                    w.date || '',
                    w.duration !== undefined ? w.duration : 1,
                    w.status || 'folyamatban'
                ]);
            });

            const sheet = XLSX.utils.aoa_to_sheet(data);
            sheet['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 40 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(wb, sheet, 'Munka Nyilvántartás');
            
            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Munka_Nyilvantartas_${dateStr}.xlsx`);
            this.app.setSystemStatus?.('Munka Excel export kész', false);
        } catch (err) {
            console.error('Work Excel Export error:', err);
            await this.app.hmiNotif.showInfo('❌ Export hiba', err.message || 'Hiba a Munka Excel generálásakor');
        }
    }

    async exportWorkPdf() {
        this.app.setSystemStatus?.('Munka PDF generálása...', false);
        try {
            const works = this.app.workLogManager?.works || [];
            if (works.length === 0) {
                await this.app.hmiNotif.showInfo('Nincs adat', 'Nincs megjeleníthető munka adat a PDF exportáláshoz!');
                return;
            }

            const jspdfModule = (typeof window !== 'undefined' && window.jspdf) || (typeof globalThis !== 'undefined' && globalThis.jspdf);
            if (!jspdfModule) {
                await this.app.hmiNotif.showInfo('❌ Hiba', 'PDF generáló modul nincs betöltve!');
                return;
            }

            const { jsPDF } = jspdfModule;
            const doc = new jsPDF('landscape');
            
            doc.addFont("https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf", "Roboto", "normal");
            doc.setFont("Roboto");
            
            doc.setFontSize(18);
            doc.text('Munka Nyilvántartás', 14, 15);
            doc.setFontSize(10);
            const dateStr = new Date().toISOString().split('T')[0];
            doc.text(`Generálva: ${dateStr}`, 14, 22);

            const tableData = works.map((w, idx) => {
                return [
                    (idx + 1).toString(),
                    w.name || '',
                    (w.description || '').replace(/\n/g, ' '),
                    w.location || '-',
                    w.date || '-',
                    `${w.duration !== undefined ? w.duration : 1} nap`,
                    w.status || 'folyamatban'
                ];
            });

            doc.autoTable({
                head: [['#', 'Munka Neve', 'Leírás', 'Helyszín', 'Dátum', 'Időtartam', 'Státusz']],
                body: tableData,
                startY: 30,
                styles: { font: "Roboto", fontSize: 9 },
                headStyles: { fillColor: [16, 185, 129] } // Emerald 500
            });

            doc.save(`Munka_Nyilvantartas_${dateStr}.pdf`);
            this.app.setSystemStatus?.('Munka PDF export kész', false);
        } catch (err) {
            console.error('Work PDF Export error:', err);
            await this.app.hmiNotif.showInfo('❌ Export hiba', err.message || 'Hiba a Munka PDF generálásakor');
        }
    }

    async exportWorkJson() {
        try {
            const data = {
                works: this.app.workLogManager?.works || [],
                exportDate: new Date().toISOString(),
                version: '7.3.0'
            };
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Munka_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.app.setSystemStatus?.('Munka JSON export kész', false);
        } catch (err) {
            console.error('Work JSON export error:', err);
            await this.app.hmiNotif.showInfo('❌ JSON export hiba', err.message || 'Ismeretlen hiba');
        }
    }

    importWorkJson() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async event => {
                try {
                    let data;
                    try {
                        data = JSON.parse(event.target.result);
                    } catch (parseErr) {
                        await this.app.hmiNotif.showInfo('❌ Hiba', 'Hibás JSON fájl formátum!');
                        return;
                    }

                    if (!data || typeof data !== 'object' || !Array.isArray(data.works)) {
                        await this.app.hmiNotif.showInfo('Érvénytelen fájl', 'A kiválasztott JSON fájl nem tartalmaz Munka (works) adatokat!');
                        return;
                    }

                    if (data.works.length === 0) {
                        await this.app.hmiNotif.showInfo('Üres adatállomány', 'A JSON fájl nem tartalmaz importálható munka bejegyzéseket.');
                        return;
                    }

                    // Validate items before writing
                    const validWorks = [];
                    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

                    for (const item of data.works) {
                        if (!item || typeof item !== 'object') continue;

                        // 1. Name validation
                        if (typeof item.name !== 'string' || item.name.trim() === '') continue;

                        // 2. Strict calendar date validation
                        if (!isValidCalendarDate(item.date)) continue;

                        // 3. Duration validation: reject NaN, Infinity, -Infinity, non-integers, zero, and negative values
                        let dur = item.duration;
                        if (dur !== undefined && dur !== null) {
                            if (typeof dur === 'string' && dur.trim() !== '') {
                                dur = Number(dur);
                            }
                            if (typeof dur !== 'number' || !Number.isInteger(dur) || dur < 1) {
                                continue;
                            }
                        } else {
                            dur = 1;
                        }

                        const trimmedName = item.name.trim();
                        const trimmedDesc = typeof item.description === 'string' ? item.description.trim() : (item.description || '');
                        const trimmedLoc = typeof item.location === 'string' ? item.location.trim() : (item.location || '');

                        // 4. Stable ID generation: use explicit ID or generate deterministic ID for ID-less items so re-import is idempotent
                        let stableId = item.id;
                        if (!stableId) {
                            const raw = `work_import_${trimmedName}_${item.date}_${dur}_${trimmedDesc}_${trimmedLoc}`;
                            let hash = 0;
                            for (let ch = 0; ch < raw.length; ch++) {
                                hash = ((hash << 5) - hash) + raw.charCodeAt(ch);
                                hash |= 0;
                            }
                            stableId = `imp-${Math.abs(hash).toString(16).padStart(8, '0')}`;
                        }

                        // 5. Preserve non-dangerous compatible metadata & legacy keys (e.g. _old_autoincrement_id)
                        const safeMetadata = {};
                        for (const key of Object.keys(item)) {
                            if (!dangerousKeys.has(key)) {
                                safeMetadata[key] = item[key];
                            }
                        }

                        // 6. Assemble normalized record, protecting core attributes from raw override
                        const normalizedRecord = {
                            ...safeMetadata,
                            id: stableId,
                            name: trimmedName,
                            description: trimmedDesc,
                            location: trimmedLoc,
                            date: item.date,
                            duration: dur,
                            status: typeof item.status === 'string' ? item.status : 'folyamatban'
                        };

                        // 7. Strictly validate created_at if present: reject malformed values, numbers, objects, and invalid date strings
                        // Do not silently convert malformed timestamps into current timestamps
                        if (item.created_at !== undefined && item.created_at !== null) {
                            if (typeof item.created_at !== 'string' || item.created_at.trim() === '') {
                                continue;
                            }
                            const parsedCreated = Date.parse(item.created_at);
                            if (isNaN(parsedCreated)) {
                                continue;
                            }
                            normalizedRecord.created_at = item.created_at;
                        }

                        validWorks.push(normalizedRecord);
                    }

                    if (validWorks.length === 0) {
                        await this.app.hmiNotif.showInfo('Érvénytelen adatok', 'A fájlban található bejegyzések egyike sem érvényes munka bejegyzés!');
                        return;
                    }

                    let shouldImport = true;
                    if (typeof confirm === 'function') {
                        shouldImport = confirm(`Biztosan betöltesz ${validWorks.length} munka adatot?`);
                    }

                    if (shouldImport) {
                        let importedCount = 0;
                        const failedRecords = [];

                        for (const item of validWorks) {
                            if (this.app.workLogManager && typeof this.app.workLogManager.save === 'function') {
                                try {
                                    await this.app.workLogManager.save(item);
                                    importedCount++;
                                } catch (saveErr) {
                                    console.error(`[WorkLogImport] Hiba a rekord (${item.name || item.id}) mentésekor:`, saveErr);
                                    failedRecords.push({
                                        id: item.id,
                                        name: item.name,
                                        error: saveErr?.message || 'Ismeretlen mentési hiba'
                                    });
                                }
                            }
                        }

                        if (failedRecords.length === 0) {
                            await this.app.hmiNotif.showInfo('Sikeres importálás', `${importedCount} munka adat sikeresen betöltve!`);
                        } else if (importedCount > 0) {
                            const errDetails = failedRecords.slice(0, 5).map(f => `• ${f.name || f.id}: ${f.error}`).join('\n');
                            const moreMsg = failedRecords.length > 5 ? `\n...és további ${failedRecords.length - 5} hiba.` : '';
                            await this.app.hmiNotif.showInfo(
                                'Részleges importálás',
                                `${importedCount} sikeres, ${failedRecords.length} sikertelen a(z) ${validWorks.length} tételből.\nHibák:\n${errDetails}${moreMsg}`
                            );
                        } else {
                            const errDetails = failedRecords.slice(0, 5).map(f => `• ${f.name || f.id}: ${f.error}`).join('\n');
                            await this.app.hmiNotif.showInfo(
                                'Importálási hiba',
                                `Egyetlen munka adatot sem sikerült importálni (${failedRecords.length} hiba).\nHibák:\n${errDetails}`
                            );
                        }

                        this.app.updateReactStore?.();
                    }
                } catch (err) {
                    console.error('Work JSON import error:', err);
                    await this.app.hmiNotif.showInfo('❌ Hiba', 'Hiba történt az importálás során: ' + (err.message || 'Ismeretlen hiba'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

}
