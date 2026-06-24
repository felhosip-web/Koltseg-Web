// js/data-operation-controller.js - Adatműveletek egységes modal-okkal
// Tartalmazza: Szinkronizáció, Excel, PDF, JSON export/import, Wipe, Backup restore

export class DataOperationController {
    constructor(app) {
        this.app = app;
    }

    // ==================== SZINKRONIZÁCIÓ ====================
    async forceSync() {
        this.app.renderer.updateFooterStatus('Teljes szinkronizáció...', false);
        
        try {
            // === 1. ELLENŐRZÉSEK (csak ConfigManager-ből) ===
            const config = this.app.config;
            if (!config) {
                await this.app.hmiNotif.showInfo(
                    '⚠️ Konfigurációs hiba',
                    'A ConfigManager nem elérhető!'
                );
                return;
            }

            const useCloud = config.useSupabase === true;
            const hasUrl = !!(config.supabaseConfig?.url);
            const hasKey = !!(config.supabaseConfig?.key);
            
            if (!useCloud) {
                await this.app.hmiNotif.showInfo(
                    '☁️ Felhő kikapcsolva',
                    'A szinkronizációhoz kapcsold be a felhőt a Beállításokban!\n\n' +
                    '1. Kattints a ⚙️ gombra\n' +
                    '2. Kapcsold be a "Felhő használata" opciót\n' +
                    '3. Add meg a Supabase URL-t és API kulcsot\n' +
                    '4. Kattints a "Mentés és Alkalmazás" gombra'
                );
                return;
            }

            if (!hasUrl || !hasKey) {
                await this.app.hmiNotif.showInfo(
                    '⚠️ Hiányzó Supabase adatok',
                    'A szinkronizációhoz meg kell adni a Supabase URL-t és API kulcsot!\n\n' +
                    '1. Kattints a ⚙️ gombra\n' +
                    '2. Töltsd ki a Supabase URL és Anon Public API Key mezőket\n' +
                    '3. Kattints a "Mentés és Alkalmazás" gombra'
                );
                return;
            }

            // Internet kapcsolat ellenőrzése
            if (!navigator.onLine) {
                await this.app.hmiNotif.showInfo(
                    '📡 Nincs internetkapcsolat',
                    'A szinkronizációhoz internetkapcsolat szükséges!\n\n' +
                    'Ellenőrizd a hálózati kapcsolatot, majd próbáld újra.'
                );
                return;
            }

            // === 2. STATUSZ LEKÉRÉS ===
            const syncService = this.app.syncService || this.app.syncManager;
            if (!syncService) {
                throw new Error('Szinkronizációs szolgáltatás nem elérhető!');
            }

            const status = syncService.getStatus ? syncService.getStatus() : { 
                useCloud: useCloud,
                hasCloud: true,
                pendingChanges: 0,
                lastSyncTime: null
            };

            // Függő változtatások
            const pendingCount = status.pendingChanges || 0;
            
            // Üzenet összeállítása
            let message = `📋 Szinkronizációs információk:\n\n`;
            message += `☁️ Felhő állapot: ${status.useCloud ? '✅ Aktív' : '❌ Inaktív'}\n`;
            message += `📦 Függő változtatások: ${pendingCount} db\n`;
            if (status.lastSyncTime) {
                message += `🕐 Utolsó szinkron: ${status.lastSyncTime.toLocaleString('hu-HU')}\n`;
            }
            
            // Cloud kapcsolat ellenőrzése
            if (status.hasCloud !== undefined) {
                message += `🔗 Kapcsolat: ${status.hasCloud ? '✅ Elérhető' : '❌ Nem elérhető'}\n`;
            }
            
            message += `\n💡 A szinkronizáció során:\n`;
            message += `• A helyi adatok feltöltésre kerülnek a felhőbe (push)\n`;
            message += `• A felhőben lévő újabb adatok letöltésre kerülnek (pull)\n`;
            message += `• Konfliktus esetén a frissebb időbélyegű adat marad meg\n\n`;
            message += `Folytatod a szinkronizációt?`;

            const confirmed = await this.app.hmiNotif.showConfirm({
                title: '🔄 Szinkronizáció indítása',
                message: message,
                type: 'info',
                confirmText: '✅ Indítás'
            });

            if (!confirmed) return;

            // === 3. SZINKRONIZÁCIÓ VÉGREHAJTÁSA ===
            this.app.renderer.updateFooterStatus('🔄 Szinkronizáció folyamatban...', false);
            this.app.hmiNotif.showToast('🔄 Szinkronizáció indul...', 'info');

            try {
                // SyncService vagy SyncManager sync metódusa
                let result;
                if (typeof syncService.sync === 'function') {
                    result = await syncService.sync();
                } else if (typeof syncService.fullSync === 'function') {
                    result = await syncService.fullSync();
                } else {
                    throw new Error('A szinkronizációs szolgáltatás nem támogatja a sync műveletet!');
                }

                // === 4. UI FRISSÍTÉS ===
                this.app.renderer.renderTable();
                this.app.renderStats?.();
                this.app.remindersRenderer?.renderList?.();
                this.app.updateReminderStatus?.();

                const syncTime = new Date().toLocaleTimeString('hu-HU');
                this.app.hmiNotif.showToast('✅ Szinkronizáció sikeres!', 'success');
                this.app.renderer.updateFooterStatus(`✅ Szinkronizálva: ${syncTime}`, false);

                console.log('[SYNC] Szinkronizáció eredménye:', result);

            } catch (syncError) {
                console.error('[SYNC ERROR]', syncError);
                
                // Hibaüzenet részletezése
                let errorMsg = syncError.message || 'Ismeretlen hiba';
                if (errorMsg.includes('JWT')) {
                    errorMsg = 'Hitelesítési hiba! Ellenőrizd a Supabase API kulcsot.';
                } else if (errorMsg.includes('network')) {
                    errorMsg = 'Hálózati hiba! Ellenőrizd az internetkapcsolatot.';
                } else if (errorMsg.includes('permission')) {
                    errorMsg = 'Jogosultsági hiba! Ellenőrizd a Supabase RLS szabályokat.';
                }

                await this.app.hmiNotif.showInfo(
                    '❌ Szinkronizációs hiba',
                    `Hiba történt a szinkronizáció során:\n\n${errorMsg}\n\n` +
                    `Próbáld újra később, vagy ellenőrizd a konzolt (F12) a részletekért.`
                );
                this.app.renderer.updateFooterStatus('❌ Szinkronizációs hiba!', true);
            }

        } catch (err) {
            console.error('[FORCE SYNC ERROR]', err);
            await this.app.hmiNotif.showInfo(
                '❌ Kritikus hiba',
                `A szinkronizáció előkészítése során hiba történt:\n\n${err.message || 'Ismeretlen hiba'}`
            );
            this.app.renderer.updateFooterStatus('❌ Kritikus hiba!', true);
        }
    }

    // ==================== EXCEL EXPORT ====================
    async exportExcel() {
        this.app.renderer.updateFooterStatus('Részletes Excel generálása...', false);
    
        try {
            const entries = this.app.entries.entries;
            if (entries.length === 0) {
                await this.app.hmiNotif.showInfo(
                    'Nincs adat',
                    'Nincs megjeleníthető adat az Excel exportáláshoz!'
                );
                return;
            }

            const wb = XLSX.utils.book_new();
            const items = this.app.items.items;
            const months = this.app.months.months;
            const eurRate = this.app.config.eurRate || 400;

            // === 1. FŐ ADATLAP ===
            const mainData = [];
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
                    row.push(huf || 0);
                    row.push(eur || 0);
                    row.push(totalFt || 0);
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
                totalRow.push('');
            });
            mainData.push(totalRow);

            const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
            mainSheet['!cols'] = [{wch: 35}, ...Array(months.length * 4).fill({wch: 14})];
            XLSX.utils.book_append_sheet(wb, mainSheet, 'Költség Mátrix');

            // === 2. FIZETÉSI MÓD BONTÁS ===
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
                ['Kategóriák száma', items.length],
                ['Hónapok száma', months.length],
                ['Bejegyzések száma', entries.length],
                ['', '']
            ];

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

            XLSX.writeFile(wb, `koltseg_nyilvantartas_${new Date().toISOString().slice(0,10)}.xlsx`);

            this.app.hmiNotif.showToast('✅ Excel fájl letöltve!', 'success');
            this.app.renderer.updateFooterStatus('Excel export kész', false);

        } catch (err) {
            console.error('[EXCEL ERROR]', err);
            await this.app.hmiNotif.showInfo(
                '❌ Excel generálási hiba',
                `Hiba történt az Excel exportálás során:\n\n${err.message || 'Ismeretlen hiba'}`
            );
            this.app.renderer.updateFooterStatus('Excel hiba!', true);
        }
    }

    // ==================== PDF EXPORT ====================
    async exportPdf() {
        this.app.renderer.updateFooterStatus('Részletes PDF generálása...', false);
    
        try {
            const entries = this.app.entries.entries;
            if (entries.length === 0) {
                await this.app.hmiNotif.showInfo(
                    'Nincs adat',
                    'Nincs megjeleníthető adat a PDF exportáláshoz!'
                );
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a3'
            });

            const items = this.app.items.items;
            const months = this.app.months.months;
            const eurRate = this.app.config.eurRate || 400;

            let y = 20;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('KÖLTSÉG NYILVÁNTARTÁS - RÉSZLETES ÖSSZESÍTŐ', 20, y);
            y += 8;

            doc.setFontSize(11);
            doc.text(`Generálva: ${new Date().toLocaleDateString('hu-HU')} | EUR árfolyam: ${eurRate} Ft/EUR`, 20, y);
            y += 15;

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

                    let totalHUF = 0, totalEUR = 0;
                    cellEntries.forEach(e => {
                        if (e.currency === 'EUR') totalEUR += e.amount;
                        else totalHUF += e.amount;
                    });

                    const totalEUR_Ft = Math.round(totalEUR * eurRate);
                    const grandCellTotal = totalHUF + totalEUR_Ft;

                    let cellText = '-';
                    if (grandCellTotal > 0) {
                        cellText = `${totalHUF.toLocaleString('hu-HU')} | ${totalEUR} EUR | ${grandCellTotal.toLocaleString('hu-HU')} Ft`;
                        if (cellEntries.length > 1) {
                            cellText += `\n(${cellEntries.length} tétel)`;
                        }
                    }
                    row.push(cellText);
                });
                tableRows.push(row);
            });

            doc.autoTable({
                startY: y,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                styles: { fontSize: 8.5, cellPadding: 4, lineColor: [200, 200, 200] },
                headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'center' },
                columnStyles: { 0: { halign: 'left', cellWidth: 48 } },
                margin: { left: 12, right: 12, top: 10 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // Fizetési mód bontás
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
                columnStyles: { 0: { halign: 'left', cellWidth: 45 } },
                margin: { left: 15, right: 15 }
            });

            doc.save(`koltseg_nyilvantartas_${new Date().toISOString().slice(0,10)}.pdf`);

            this.app.hmiNotif.showToast('✅ PDF fájl letöltve!', 'success');
            this.app.renderer.updateFooterStatus('PDF export kész', false);

        } catch (err) {
            console.error('[PDF ERROR]', err);
            await this.app.hmiNotif.showInfo(
                '❌ PDF generálási hiba',
                `Hiba történt a PDF exportálás során:\n\n${err.message || 'Ismeretlen hiba'}`
            );
            this.app.renderer.updateFooterStatus('PDF hiba!', true);
        }
    }

    // ==================== JSON EXPORT ====================
    async exportJson() {
        this.app.renderer.updateFooterStatus('Teljes JSON backup készítése...', false);
        
        try {
            const entries = this.app.entries.entries;
            if (entries.length === 0) {
                const confirmed = await this.app.hmiNotif.showConfirm({
                    title: 'Üres adatbázis',
                    message: 'Nincs egyetlen bejegyzés sem. Mégis exportálnád az üres adatbázist?',
                    type: 'warning',
                    confirmText: 'Igen, exportálom'
                });
                if (!confirmed) return;
            }

            const backupData = {
                version: 'v4.0',
                timestamp: new Date().toISOString(),
                appVersion: 'Költség Nyilvántartó v4.0',
                items: this.app.items.items || [],
                months: this.app.months.months || [],
                entries: this.app.entries.entries || [],
                templates: this.app.templates?.templates || [],
                reminders: this.app.reminderManager?.reminders || [],
                supabaseConfig: {
                    url: this.app.config?.supabaseConfig?.url || '',
                    key: this.app.config?.supabaseConfig?.key || '',
                    useCloud: this.app.config?.useSupabase || false
                },
                settings: {
                    eurRate: this.app.config?.eurRate || 400
                }
            };

            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute('href', dataStr);
            downloadAnchor.setAttribute('download', `koltseg_full_backup_${new Date().toISOString().slice(0,10)}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();

            this.app.hmiNotif.showToast('✅ JSON backup letöltve!', 'success');
            this.app.renderer.updateFooterStatus('JSON export kész', false);

        } catch (err) {
            console.error('[JSON EXPORT ERROR]', err);
            await this.app.hmiNotif.showInfo(
                '❌ JSON exportálási hiba',
                `Hiba történt a JSON exportálás során:\n\n${err.message || 'Ismeretlen hiba'}`
            );
        }
    }

    // ==================== JSON IMPORT ====================
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
                        await this.app.hmiNotif.showInfo(
                            'Érvénytelen fájl',
                            'A kiválasztott fájl nem érvényes backup fájl!'
                        );
                        return;
                    }

                    const confirmed = await this.app.hmiNotif.showConfirm({
                        title: '⚠️ TELJES ADATBÁZIS FELÜLÍRÁSA',
                        message: `Importálsz egy teljes backupot?\n\n📁 Verzió: ${importedData.version || 'ismeretlen'}\n📅 Dátum: ${importedData.timestamp || 'ismeretlen'}\n\nEz felülírja az összes jelenlegi adatot!`,
                        type: 'danger',
                        confirmText: 'IGEN, FELÜLÍROM'
                    });

                    if (!confirmed) return;

                    this.app.renderer.updateFooterStatus('Adatok importálása...', false);

                    const dbRaw = this.app.db.db || this.app.db._db;
                    if (!dbRaw) throw new Error('Nincs adatbázis kapcsolat!');

                    const tx = dbRaw.transaction(['items', 'months', 'entries', 'templates', 'reminders'], 'readwrite');

                    tx.objectStore('items').clear();
                    tx.objectStore('months').clear();
                    tx.objectStore('entries').clear();
                    tx.objectStore('templates').clear();
                    tx.objectStore('reminders').clear();

                    importedData.items?.forEach(item => tx.objectStore('items').put(item));
                    importedData.months?.forEach(m => {
                        if (typeof m === 'string') tx.objectStore('months').put({ month: m });
                        else tx.objectStore('months').put(m);
                    });
                    importedData.entries?.forEach(entry => tx.objectStore('entries').put(entry));
                    importedData.templates?.forEach(tpl => tx.objectStore('templates').put(tpl));
                    importedData.reminders?.forEach(rem => tx.objectStore('reminders').put(rem));

                    tx.oncomplete = async () => {
                        // Supabase beállítások
                        if (importedData.supabaseConfig) {
                            const cfg = importedData.supabaseConfig;
                            localStorage.setItem('supabase_url', cfg.url || '');
                            localStorage.setItem('supabase_key', cfg.key || '');
                            localStorage.setItem('supabase_use', cfg.useCloud ? 'true' : 'false');
                            if (this.app.config) {
                                this.app.config.supabaseConfig = cfg;
                                this.app.config.useSupabase = cfg.useCloud;
                            }
                            if (typeof this.app.cloud?.init === 'function') {
                                this.app.cloud.init();
                            }
                        }

                        if (importedData.settings?.eurRate) {
                            localStorage.setItem('eurRate', importedData.settings.eurRate);
                            if (this.app.config) this.app.config.eurRate = importedData.settings.eurRate;
                        }

                        await Promise.all([
                            this.app.items.load(),
                            this.app.months.load(),
                            this.app.entries.load(),
                            this.app.templates?.load?.(),
                            this.app.reminderManager?.load?.()
                        ]);

                        this.app.renderer.renderTable();
                        this.app.remindersRenderer?.renderList?.();
                        this.app.renderStats?.();

                        this.app.hmiNotif.showToast('✅ Backup sikeresen visszaállítva!', 'success');
                        this.app.renderer.updateFooterStatus('JSON import kész', false);
                    };

                } catch (err) {
                    console.error('[JSON IMPORT ERROR]', err);
                    await this.app.hmiNotif.showInfo(
                        '❌ Importálási hiba',
                        `Hiba történt az importálás során:\n\n${err.message || 'Érvénytelen JSON formátum'}`
                    );
                }
            };
            reader.readAsText(file);
        });

        fileInput.click();
    }

    // ==================== ADATBÁZIS WIPE ====================
    async wipeDatabase() {
        const firstConfirm = await this.app.hmiNotif.showConfirm({
            title: '🚨 MINDEN HELYI ADAT TÖRLÉSE!',
            message: 'Biztosan ki akarja törölni a **TELJES** helyi adatbázist?\n\nMinden kategória, hónap, tranzakció, sablon és határidő törlődni fog!',
            type: 'danger',
            confirmText: 'IGEN, TÖRÖLJÖM'
        });

        if (!firstConfirm) return;

        const secondConfirm = await this.app.hmiNotif.showConfirm({
            title: '🚨 VÉGSŐ BIZTONSÁGI ELLENŐRZÉS',
            message: 'Ez a művelet **visszafordíthatatlan**!\n\nBiztosan törli az összes helyi adatot?',
            type: 'danger',
            confirmText: 'VÉGLEGES TÖRLÉS'
        });

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
                await Promise.all([
                    this.app.items.load(),
                    this.app.months.load(),
                    this.app.entries.load(),
                    this.app.templates?.load?.(),
                    this.app.reminderManager?.load?.()
                ]);

                this.app.renderer.renderTable();
                this.app.remindersRenderer?.renderList?.();
                this.app.renderStats?.();

                this.app.hmiNotif.showToast('🗑️ Minden helyi adat törölve!', 'error');
                this.app.renderer.updateFooterStatus('Adatbázis kiürítve', false);
            };

        } catch (err) {
            console.error('[WIPE DATABASE ERROR]', err);
            await this.app.hmiNotif.showInfo(
                '❌ Törlési hiba',
                `Hiba történt az adatbázis törlése során:\n\n${err.message || 'Ismeretlen hiba'}`
            );
            this.app.renderer.updateFooterStatus('Törlési hiba!', true);
        }
    }

    // ==================== BACKUP VISSZAÁLLÍTÁS ====================
    async restoreFromBackup() {
        await this.app.backupManager.restoreFromBackup();
    }
}