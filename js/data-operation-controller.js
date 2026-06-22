// js/data-operation-controller.js
export class DataOperationController {
    constructor(app) {
        this.app = app;
    }

    async forceSync() {
        this.app.renderer.updateFooterStatus('Teljes szinkronizáció (push + pull)...', false);
        try {
            // Push minden helyi adatot
            await Promise.all([
                this.app.items.items.forEach(item => this.app.cloud.push('items', item)),
                this.app.entries.entries.forEach(entry => this.app.cloud.push('entries', entry)),
                // stb.
            ]);

            this.app.hmiNotif.showToast('Szinkronizáció elindítva (push sikeres)', 'success');
            this.app.renderer.updateFooterStatus('Supabase szinkronizálva', false);
        } catch (err) {
            console.error('[HMI SYNC ERR]', err);
            this.app.hmiNotif.showToast('Szinkronizációs hiba!', 'error');
        }
    }

    exportExcel() {
        this.app.renderer.updateFooterStatus('Részletes Excel generálása...', false);
    
        try {
            const wb = XLSX.utils.book_new();
            const items = this.app.items.items;
            const months = this.app.months.months;
            const entries = this.app.entries.entries;
            const eurRate = this.app.renderer.getEffectiveEurRate?.() || 400;

            // === 1. FŐ ADATLAP - Részletes mátrix ===
            const mainData = [];
        
            // Fejléc
            const header = ['Kategória', ...months.flatMap(m => [
                `${m} HUF`,
                `${m} EUR`,
                `${m} Összesen Ft`,
                `${m} Tételek száma`
            ])];
            mainData.push(header);

            items.forEach(item => {
                const row = [item.name];
            
                months.forEach(month => {
                    const cellBaseKey = `${item.id}_${month}`;
                    const cellEntries = entries.filter(e => e.cellKey && e.cellKey.startsWith(cellBaseKey));

                    let huf = 0, eur = 0;

                    cellEntries.forEach(e => {
                        if (e.currency === 'EUR') eur += e.amount;
                        else huf += e.amount;
                    });

                    const totalFt = huf + Math.round(eur * eurRate);

                    row.push(huf > 0 ? huf : 0);
                    row.push(eur > 0 ? eur : 0);
                    row.push(totalFt > 0 ? totalFt : 0);
                    row.push(cellEntries.length);
                });
            
                mainData.push(row);
            });

            // Összesítő sor
            const totalRow = ['ÖSSZESEN'];
            months.forEach(month => {
                let monthHuf = 0, monthEur = 0;
                entries.forEach(e => {
                    if (e.cellKey && e.cellKey.includes(`_${month}`)) {
                        if (e.currency === 'EUR') monthEur += e.amount;
                        else monthHuf += e.amount;
                    }
                });
                const monthTotal = monthHuf + Math.round(monthEur * eurRate);
                totalRow.push(monthHuf);
                totalRow.push(monthEur);
                totalRow.push(monthTotal);
                totalRow.push(''); // darabszám nem releváns az összesítőnél
            });
            mainData.push(totalRow);

            const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
        
            // Oszlopszélesség finomhangolás
            const colWidths = [{wch: 35}]; // Kategória
            for (let i = 0; i < months.length * 4; i++) {
                colWidths.push({wch: 14});
            }
            mainSheet['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(wb, mainSheet, 'Költség Mátrix');

            // === 2. FIZETÉSI MÓD BONTÁS LAP ===
            const methodData = [['Fizetési mód', ...months, 'Összesen Ft']];
        
            const methods = ['Kártya', 'Készpénz', 'Utalás', 'Egyéb'];
        
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
                methodData.push(row);
            });

            const methodSheet = XLSX.utils.aoa_to_sheet(methodData);
            methodSheet['!cols'] = [{wch: 20}, ...Array(months.length + 1).fill({wch: 16})];
            XLSX.utils.book_append_sheet(wb, methodSheet, 'Fizetési mód Bontás');

            // === 3. STATISZTIKA LAP ===
            const stats = [
                ['STATISZTIKAI ÖSSZESÍTŐ', ''],
                ['Generálva', new Date().toLocaleString('hu-HU')],
                ['EUR Árfolyam', eurRate + ' Ft'],
                ['', ''],
                ['Összes kiadás (Ft)', ''],
                ['Kategóriák száma', items.length],
                ['Hónapok száma', months.length],
                ['Bejegyzések száma', entries.length],
                ['', '']
            ];

            // Fizetési mód összesítők
            let totalCard = 0, totalCash = 0, totalTransfer = 0, totalOther = 0;
            entries.forEach(e => {
                const amt = e.currency === 'EUR' ? Math.round(e.amount * eurRate) : e.amount;
                if (e.paymentMethod === 'Kártya') totalCard += amt;
                else if (e.paymentMethod === 'Készpénz') totalCash += amt;
                else if (e.paymentMethod === 'Utalás') totalTransfer += amt;
                else totalOther += amt;
            });

            const grandTotal = totalCard + totalCash + totalTransfer + totalOther;

            stats.push(['Összes kiadás', grandTotal]);
            stats.push(['Kártya', totalCard]);
            stats.push(['Készpénz', totalCash]);
            stats.push(['Utalás', totalTransfer]);
            stats.push(['Egyéb', totalOther]);

            const statsSheet = XLSX.utils.aoa_to_sheet(stats);
            XLSX.utils.book_append_sheet(wb, statsSheet, 'Statisztika');

            // Mentés
            XLSX.writeFile(wb, `koltseg_nyilvantartas_reszletes_${new Date().toISOString().slice(0,10)}.xlsx`);

            this.app.hmiNotif.showToast('Részletes Excel fájl letöltve!', 'success');
            this.app.renderer.updateFooterStatus('Sikeres Excel export', false);

        } catch (err) {
            console.error('[EXCEL ENGINE ERROR]', err);
            this.app.hmiNotif.showToast('Excel generálási hiba!', 'error');
        }
    }

    async exportPdf() {
        this.app.renderer.updateFooterStatus('Részletes hivatalos PDF generálása...', false);
    
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a3'
            });

            const items = this.app.items.items;
            const months = this.app.months.months;
            const entries = this.app.entries.entries;
            const eurRate = this.app.renderer.getEffectiveEurRate?.() || 400;

            let y = 20;

            // Fejléc
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('KÖLTSÉG NYILVÁNTARTÁS - RÉSZLETES HIVATALOS ÖSSZESÍTŐ', 20, y);
            y += 8;

            doc.setFontSize(11);
            doc.text(`Generálva: ${new Date().toLocaleDateString('hu-HU')} | EUR árfolyam: ${eurRate} Ft/EUR`, 20, y);
            y += 15;

            // === FŐ TÁBLA - Részletes cellákkal ===
            doc.setFontSize(14);
            doc.text('1. Részletes kiadások kategóriánként és hónaponként', 20, y);
            y += 8;

            const tableColumn = ['Kategória', ...months.map(m => m + '\n(HUF | EUR | Össz)')];
            const tableRows = [];

            items.forEach(item => {
                const row = [item.name];

                months.forEach(month => {
                    const cellBaseKey = `${item.id}_${month}`;
                    const cellEntries = entries.filter(e => e.cellKey && e.cellKey.startsWith(cellBaseKey));

                    let totalHUF = 0;
                    let totalEUR = 0;
                    let details = [];

                    cellEntries.forEach(e => {
                        if (e.currency === 'EUR') {
                            totalEUR += e.amount;
                            details.push(`${e.amount} EUR (${e.paymentMethod})`);
                        } else {
                            totalHUF += e.amount;
                            details.push(`${e.amount} Ft (${e.paymentMethod})`);
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
                    if (e.cellKey && e.cellKey.includes(`_${month}`)) {
                        if (e.currency === 'EUR') monthEUR += e.amount;
                        else monthHUF += e.amount;
                    }
                });
                const monthTotal = monthHUF + Math.round(monthEUR * eurRate);
                totalRow.push(monthTotal > 0 ? 
                    `${monthHUF.toLocaleString()} | ${monthEUR} EUR | ${monthTotal.toLocaleString()} Ft` : '-');
                grandTotalAll += monthTotal;
            });

            tableRows.push(totalRow);

            doc.autoTable({
                startY: y,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                styles: { 
                    fontSize: 8.5, 
                    cellPadding: 4,
                    lineColor: [200, 200, 200]
                },
                headStyles: { 
                    fillColor: [30, 58, 138], 
                    textColor: 255, 
                    fontStyle: 'bold',
                    halign: 'center'
                },
                columnStyles: { 
                    0: { halign: 'left', cellWidth: 48 } 
                },
                margin: { left: 12, right: 12, top: 10 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // === FIZETÉSI MÓD BONTÁS (marad) ===
            doc.setFontSize(14);
            doc.text('2. Fizetési mód szerinti bontás', 20, y);
            y += 8;

            const methods = ['Kártya', 'Készpénz', 'Utalás', 'Egyéb'];
            const methodTableColumn = ['Fizetési mód', ...months, 'Összesen'];

            const methodRows = [];

            methods.forEach(method => {
                const row = [method];
                let methodGrandTotal = 0;

                months.forEach(month => {
                    let monthMethodTotal = 0;
                    entries.forEach(e => {
                        if (e.cellKey && e.cellKey.includes(`_${month}`) && e.paymentMethod === method) {
                            monthMethodTotal += e.currency === 'EUR' ? Math.round(e.amount * eurRate) : e.amount;
                        }
                    });
                    row.push(monthMethodTotal > 0 ? monthMethodTotal.toLocaleString('hu-HU') + ' Ft' : '-');
                    methodGrandTotal += monthMethodTotal;
                });

                row.push(methodGrandTotal > 0 ? methodGrandTotal.toLocaleString('hu-HU') + ' Ft' : '-');
                methodRows.push(row);
            });

            doc.autoTable({
                startY: y,
                head: [methodTableColumn],
                body: methodRows,
                theme: 'grid',
                styles: { fontSize: 10, cellPadding: 5, halign: 'right' },
                headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [240, 253, 244] },
                columnStyles: { 
                    0: { halign: 'left', cellWidth: 45 },
                    [methodTableColumn.length - 1]: { fontStyle: 'bold' }
                },
                margin: { left: 15, right: 15 }
            });

            y = doc.lastAutoTable.finalY + 12;
        

            // Végső összesítő
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`TELJES IDŐSZAK ÖSSZES KIADÁSA: ${grandTotalAll.toLocaleString('hu-HU')} Ft`, 20, y + 10);

            doc.save(`koltseg_nyilvantartas_reszletes_${new Date().toISOString().slice(0,10)}.pdf`);

            this.app.hmiNotif.showToast('Részletes PDF letöltve!', 'success');
            this.app.renderer.updateFooterStatus('Sikeres részletes PDF export', false);

        } catch (err) {
            console.error('[PDF ENGINE ERROR]', err);
            this.app.hmiNotif.showToast('PDF generálási hiba!', 'error');
        }
    }

    exportJson() {
        this.app.renderer.updateFooterStatus('Teljes JSON backup készítése (Supabase beállításokkal)...', false);
        try {
            const backupData = {
                version: 'v4.9-OOP-FULL-SECURE',
                timestamp: new Date().toISOString(),
                appVersion: 'Költség Nyilvántartó v4.0',
                
                // Domain adatok
                items: this.app.items.items || [],
                months: this.app.months.months || [],
                entries: this.app.entries.entries || [],
                templates: this.app.templates?.templates || [],
                reminders: this.app.reminderManager?.reminders || [],
                
                // Supabase teljes konfiguráció (saját használatra)
                supabaseConfig: {
                    url: this.app.config?.supabaseConfig?.url || 
                         localStorage.getItem('supabase_url') || '',
                    key: this.app.config?.supabaseConfig?.key || 
                         localStorage.getItem('supabase_key') || '',
                    useCloud: this.app.config?.useSupabase || 
                              localStorage.getItem('supabase_use') === 'true' || false
                },
                
                // Egyéb beállítások
                settings: {
                    eurRate: this.app.config?.eurRate || this.app.eurRate || 400
                }
            };

            const dataStr = 'data:text/json;charset=utf-8,' + 
                           encodeURIComponent(JSON.stringify(backupData, null, 2));

            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute('href', dataStr);
            downloadAnchor.setAttribute('download', `koltseg_full_backup_${new Date().toISOString().slice(0,10)}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();

            this.app.hmiNotif.showToast('Teljes backup (Supabase-el) letöltve!', 'success');
            this.app.renderer.updateFooterStatus('JSON Export kész', false);
        } catch (err) {
            console.error('[JSON EXPORT ERR]', err);
            this.app.hmiNotif.showToast('Exportálási hiba!', 'error');
        }
    }

    async importJson() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);

                    if (!importedData.items || !importedData.entries) {
                        throw new Error('Érvénytelen backup fájl!');
                    }

                    const confirmed = await this.app.hmiNotif.showConfirm(
                        'TELJES ADATBÁZIS + BEÁLLÍTÁSOK FELÜLÍRÁSA',
                        `Importálsz egy teljes backupot?\n\nVerzió: ${importedData.version || 'ismeretlen'}\nDátum: ${importedData.timestamp || 'ismeretlen'}\n\nEz felülírja az összes adatot ÉS a Supabase beállításokat is!`,
                        true,
                        'IGEN, FELÜLÍROM'
                    );

                    if (!confirmed) return;

                    this.app.renderer.updateFooterStatus('Adatok importálása...', false);

                    const dbRaw = this.app.db.db || this.app.db._db;
                    if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');

                    const tx = dbRaw.transaction(['items', 'months', 'entries', 'templates', 'reminders'], 'readwrite');

                    // Törlés
                    tx.objectStore('items').clear();
                    tx.objectStore('months').clear();
                    tx.objectStore('entries').clear();
                    tx.objectStore('templates').clear();
                    tx.objectStore('reminders').clear();

                    // Visszaírás
                    importedData.items?.forEach(item => tx.objectStore('items').put(item));
                    importedData.months?.forEach(m => {
                        if (typeof m === 'string') tx.objectStore('months').put({ month: m });
                        else tx.objectStore('months').put(m);
                    });
                    importedData.entries?.forEach(entry => tx.objectStore('entries').put(entry));
                    importedData.templates?.forEach(tpl => tx.objectStore('templates').put(tpl));
                    importedData.reminders?.forEach(rem => tx.objectStore('reminders').put(rem));

                    tx.oncomplete = async () => {
                        // Supabase beállítások visszaállítása
                        if (importedData.supabaseConfig) {
                            const cfg = importedData.supabaseConfig;
                            
                            localStorage.setItem('supabase_url', cfg.url || '');
                            localStorage.setItem('supabase_key', cfg.key || '');
                            localStorage.setItem('supabase_use', cfg.useCloud ? 'true' : 'false');

                            if (this.app.config) {
                                this.app.config.supabaseConfig = cfg;
                                this.app.config.useSupabase = cfg.useCloud;
                            }
                            
                            // Cloud kliens újrainicializálása
                            if (typeof this.app.cloud?.init === 'function') {
                                this.app.cloud.init();
                            }
                        }

                        // EUR árfolyam
                        if (importedData.settings?.eurRate) {
                            localStorage.setItem('eurRate', importedData.settings.eurRate);
                            if (this.app.config) this.app.config.eurRate = importedData.settings.eurRate;
                        }

                        // UI frissítés
                        await Promise.all([
                            this.app.items.load(),
                            this.app.months.load(),
                            this.app.entries.load(),
                            this.app.templates?.load?.(),
                            this.app.reminderManager?.load?.()
                        ]);

                        this.app.renderer.renderTable();
                        this.app.remindersRenderer?.renderList?.();

                        this.app.hmiNotif.showToast('Teljes backup sikeresen visszaállítva (Supabase beállításokkal)!', 'success');
                        this.app.renderer.updateFooterStatus('JSON Import kész', false);
                    };

                } catch (err) {
                    console.error('[JSON IMPORT ERR]', err);
                    this.app.hmiNotif.showToast('Hibás vagy sérült JSON fájl!', 'error');
                }
            };
            reader.readAsText(file);
        });

        fileInput.click();
    }

    async wipeDatabase() {
        const firstConfirm = await this.app.hmiNotif.showConfirm(
            'MINDEN HELYI ADAT TÖRLÉSE!',
            'Biztosan ki akarja törölni a **TELJES** helyi adatbázist?\n\nMinden kategória, hónap, tranzakció, sablon és határidő törlődni fog!',
            true,
            'IGEN, TÖRÖLJÖM'
        );

        if (!firstConfirm) return;

        const secondConfirm = await this.app.hmiNotif.showConfirm(
            'VÉGSŐ BIZTONSÁGI ELLENŐRZÉS',
            'Ez a művelet **visszafordíthatatlan**!\n\nBiztosan törli az összes helyi adatot?',
            true,
            'VÉGLEGES TÖRLÉS'
        );

        if (!secondConfirm) return;

        try {
            this.app.renderer.updateFooterStatus('Adatbázis teljes törlése...', true);

            const dbRaw = this.app.db.db || this.app.db._db;
            if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');

            const tx = dbRaw.transaction(['items', 'months', 'entries', 'templates', 'reminders'], 'readwrite');

            tx.objectStore('items').clear();
            tx.objectStore('months').clear();
            tx.objectStore('entries').clear();
            tx.objectStore('templates').clear();
            tx.objectStore('reminders').clear();

            tx.oncomplete = async () => {
                // Teljes újratöltés
                await Promise.all([
                    this.app.items.load(),
                    this.app.months.load(),
                    this.app.entries.load(),
                    this.app.templates?.load?.(),
                    this.app.reminderManager?.load?.()
                ]);

                this.app.renderer.renderTable();
                this.app.remindersRenderer?.renderList?.();

                this.app.hmiNotif.showToast('Minden helyi adat törölve! Gyári állapot visszaállítva.', 'error');
                this.app.renderer.updateFooterStatus('Adatbázis kiürítve', false);
            };

        } catch (err) {
            console.error('[WIPE DATABASE ERROR]', err);
            this.app.hmiNotif.showToast('Hiba történt a törlés során!', 'error');
            this.app.renderer.updateFooterStatus('Törlési hiba!', true);
        }
    }
}