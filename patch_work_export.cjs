const fs = require('fs');
let js = fs.readFileSync('js/data-export-controller.js', 'utf8');

const workMethods = `
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
            XLSX.writeFile(wb, \`Munka_Nyilvantartas_\${dateStr}.xlsx\`);
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
            doc.text(\`Generálva: \${dateStr}\`, 14, 22);

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
                    \`\${totalEur.toFixed(2)} EUR\`,
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

            doc.save(\`Munka_Nyilvantartas_\${dateStr}.pdf\`);
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
                version: '5.0.1'
            };
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`Munka_Backup_\${new Date().toISOString().split('T')[0]}.json\`;
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
                    
                    if (confirm(\`Biztosan betöltesz \${data.incomings.length} munka adatot? (Ez felülírja a meglévő munka adatokat!)\`)) {
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
`;

js = js.replace(/^}$/m, workMethods + '\n}');
fs.writeFileSync('js/data-export-controller.js', js);
console.log('Patched js/data-export-controller.js');
