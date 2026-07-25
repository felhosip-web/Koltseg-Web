// js/data-export-controller.js - Teljes Export funkciók (Excel, PDF, JSON)
import { setBootstrapping } from './store.js';

export class DataExportController {
    constructor(app) {
        this.app = app;
    }

    _getData() {
        return {
            entries: this.app.entries?.entries || [],
            items: this.app.items?.items || [],
            months: this.app.months?.months || [],
            incomings: this.app.incomingManager?.incomings || [],
            incoming_senders: this.app.incomingManager?.senders || []
        };
    }

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
    async exportExcel() {
        this.app.renderer.updateFooterStatus('Részletes Excel generálása...', false);

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
            this.app.renderer.updateFooterStatus('Excel export kész', false);

        } catch (err) {
            console.error('[EXCEL ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ Excel generálási hiba', err.message || 'Ismeretlen hiba');
            this.app.renderer.updateFooterStatus('Excel hiba!', true);
        }
    }

    // ==================== PDF EXPORT ====================
    async exportPdf() {
        this.app.renderer.updateFooterStatus('Részletes PDF generálása...', false);

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

            doc.setFont('helvetica', 'bold');
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
                styles: { fontSize: 8.5, cellPadding: 4 },
                headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 48 } }
            });

            doc.save(`koltseg_nyilvantartas_${new Date().toISOString().slice(0,10)}.pdf`);

            this.app.hmiNotif.showToast('✅ PDF fájl letöltve!', 'success');
            this.app.renderer.updateFooterStatus('PDF export kész', false);

        } catch (err) {
            console.error('[PDF ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ PDF generálási hiba', err.message || 'Ismeretlen hiba');
            this.app.renderer.updateFooterStatus('PDF hiba!', true);
        }
    }

    // ==================== JSON EXPORT / IMPORT ====================
    async exportJson() {
        this.app.renderer.updateFooterStatus('Teljes JSON backup készítése...', false);

        try {
            const backupData = this._buildBackupData();

            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const anchor = document.createElement('a');
            anchor.href = dataStr;
            anchor.download = `koltseg_full_backup_${new Date().toISOString().slice(0,10)}.json`;
            anchor.click();

            this.app.hmiNotif.showToast('✅ JSON backup letöltve!', 'success');
            this.app.renderer.updateFooterStatus('JSON export kész', false);

        } catch (err) {
            console.error('[JSON EXPORT ERROR]', err);
            await this.app.hmiNotif.showInfo('❌ JSON export hiba', err.message || 'Ismeretlen hiba');
        }
    }

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

        setBootstrapping(true);
        try {
            await Promise.all([
                this.app.items.load(),
                this.app.months.load(),
                this.app.entries.load(),
                this.app.templates?.load?.(),
                this.app.reminderManager?.load?.(),
                this.app.incomingManager?.load?.(),
                this.app.workLogManager?.load?.()
            ]);
        } finally {
            setBootstrapping(false);
        }

        this.app.renderer.renderTable();
        this.app.workLogRenderer?.render?.();
        this.app.remindersRenderer?.renderList?.();
        this.app.incomingRenderer?.render?.();
        this.app.renderStats?.();
        this.app.renderDashboard?.();

        this.app.hmiNotif.showToast('✅ Backup sikeresen visszaállítva!', 'success');
    }

    // ==================== SEGÉD FÜGGVÉNYEK ====================
    _buildMainMatrix(items, months, entries, eurRate) {
        const data = [['Kategória', ...months.flatMap(m => [`${m} HUF`, `${m} EUR`, `${m} Összesen Ft`, `${m} Tételek`])]];

        items.forEach(item => {
            const row = [item.name];
            months.forEach(month => {
                const prefix = `${item.id}_${month}`;
                const cellEntries = entries.filter(e => e.cellKey && e.cellKey.startsWith(prefix));

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
                    if (e.cellKey && e.cellKey.includes(`_${month}`) && e.paymentMethod === method) {
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

    // ==================== WORK LOG EXPORT ====================
    async exportWorkExcel() {
        this.app.renderer.updateFooterStatus('Munka Excel generálása...', false);
        try {
            const entries = this.app.incomings?.entries || [];
            if (entries.length === 0) {
                await this.app.hmiNotif.showInfo('Nincs adat', 'Nincs megjeleníthető munka adat az Excel exportáláshoz!');
                return;
            }

            const wb = XLSX.utils.book_new();
            
            const data = [['Dátum', 'Megrendelő / Cég', 'Munka Leírása', 'Óra', 'Óradíj (EUR)', 'Összeg (EUR)', 'Típus', 'Státusz']];
            
            entries.forEach(e => {
                const totalEur = parseFloat(e.amount || 0);
                const hrs = parseFloat(e.hours || 0);
                const hrRate = hrs > 0 ? (totalEur / hrs).toFixed(2) : 0;
                
                data.push([
                    e.date,
                    e.sender,
                    e.note || '',
                    hrs,
                    hrRate,
                    totalEur,
                    e.type === 'income' ? 'Egyéb Bevétel' : 'Munka / Óradíj',
                    e.completed ? 'Fizetve' : 'Folyamatban'
                ]);
            });

            const sheet = XLSX.utils.aoa_to_sheet(data);
            sheet['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, sheet, 'Munka Nyilvántartás');
            
            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Munka_Nyilvantartas_${dateStr}.xlsx`);
            this.app.renderer.updateFooterStatus('Munka Excel export kész', false);
        } catch (err) {
            console.error('Work Excel Export error:', err);
            await this.app.hmiNotif.showInfo('❌ Export hiba', err.message || 'Hiba a Munka Excel generálásakor');
        }
    }

    async exportWorkPdf() {
        this.app.renderer.updateFooterStatus('Munka PDF generálása...', false);
        try {
            const entries = this.app.incomings?.entries || [];
            if (entries.length === 0) {
                await this.app.hmiNotif.showInfo('Nincs adat', 'Nincs megjeleníthető munka adat a PDF exportáláshoz!');
                return;
            }

            if (!window.jspdf) {
                await this.app.hmiNotif.showInfo('❌ Hiba', 'PDF generáló modul nincs betöltve!');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            
            doc.addFont("https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf", "Roboto", "normal");
            doc.setFont("Roboto");
            
            doc.setFontSize(18);
            doc.text('Munka Nyilvántartás', 14, 15);
            doc.setFontSize(10);
            const dateStr = new Date().toISOString().split('T')[0];
            doc.text(`Generálva: ${dateStr}`, 14, 22);

            const tableData = entries.map(e => {
                const totalEur = parseFloat(e.amount || 0);
                const hrs = parseFloat(e.hours || 0);
                const hrRate = hrs > 0 ? (totalEur / hrs).toFixed(2) : 0;
                
                return [
                    e.date,
                    e.sender,
                    e.note || '',
                    hrs.toString(),
                    hrRate.toString(),
                    `${totalEur.toFixed(2)} EUR`,
                    e.completed ? 'Fizetve' : 'Folyamatban'
                ];
            });

            doc.autoTable({
                head: [['Dátum', 'Cég', 'Leírás', 'Óra', 'Óradíj', 'Összesen', 'Státusz']],
                body: tableData,
                startY: 30,
                styles: { font: "Roboto", fontSize: 9 },
                headStyles: { fillColor: [16, 185, 129] } // Emerald 500
            });

            doc.save(`Munka_Nyilvantartas_${dateStr}.pdf`);
            this.app.renderer.updateFooterStatus('Munka PDF export kész', false);
        } catch (err) {
            console.error('Work PDF Export error:', err);
            await this.app.hmiNotif.showInfo('❌ Export hiba', err.message || 'Hiba a Munka PDF generálásakor');
        }
    }

    async exportWorkJson() {
        try {
            const data = {
                incomings: this.app.incomings?.entries || [],
                exportDate: new Date().toISOString(),
                version: '5.2.0'
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
            this.app.renderer.updateFooterStatus('Munka JSON export kész', false);
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
                    const data = JSON.parse(event.target.result);
                    if (!data.incomings) {
                        await this.app.hmiNotif.showInfo('Érvénytelen fájl', 'A kiválasztott JSON fájl nem tartalmaz Munka (incomings) adatokat!');
                        return;
                    }
                    
                    if (confirm(`Biztosan betöltesz ${data.incomings.length} munka adatot? (Ez felülírja a meglévő munka adatokat!)`)) {
                        for (const item of data.incomings) {
                            if (!item.id) item.id = this.app.uuid();
                            const existing = this.app.incomings.entries.find(x => String(x.id) === String(item.id));
                            if (!existing) {
                                await this.app.incomings.add(item);
                            } else {
                                await this.app.incomings.update(item.id, item);
                            }
                        }
                        await this.app.hmiNotif.showInfo('Sikeres importálás', 'Munka adatok sikeresen betöltve!');
                        this.app.workLogRenderer?.render?.();
                    }
                } catch (err) {
                    console.error('Work JSON import error:', err);
                    await this.app.hmiNotif.showInfo('❌ Hiba', 'Hibás JSON fájl formátum!');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

}
