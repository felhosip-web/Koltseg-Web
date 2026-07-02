// js/db-audit.js - IndexedDB Audit & Maintenance Tool (v4.0)
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
        const storeNames = ['items', 'months', 'entries', 'templates', 'reminders'];
        
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
                    if (e.cellKey) {
                        cellMap.set(e.cellKey, (cellMap.get(e.cellKey) || 0) + 1);
                    }
                });
                for (const [key, cnt] of cellMap) {
                    if (cnt > 15) {
                        // JAVÍTVA: Magas tételszám szövegbehelyettesítése
                        this.diagnostics.stores[storeName].issues.push(`Magas tételszám: ${key} (${cnt})`);
                    }
                }
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
        entries.forEach(e => {
            if (!e.cellKey) return;
            const [itemIdStr, month] = e.cellKey.split('_');
            if (!itemIds.has(parseInt(itemIdStr)) || !monthSet.has(month)) {
                orphans++;
            }
        });

        this.diagnostics.consistency = {
            orphans,
            status: orphans > 0 ? 'warning' : 'ok'
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
            const currentVersion = this.app.db.version || 5;
            this.app.db.version = currentVersion + 1;
            
            // Újra csatlakozás → upgrade trigger
            await this.app.db.connect();
            
            this.app.hmiNotif.showToast('✅ Indexek újjáépítve', 'success');
            return true;
        } catch (err) {
            console.error(err);
            this.app.hmiNotif.showToast('Index rebuild sikertelen', 'error');
            return false;
        }
    }

    /**
     * Szép HTML riport
     */
    generateReportHTML() {
        let html = `<div class="space-y-6">`;
        
        html += `<div class="bg-white p-5 rounded-3xl border">`;
        html += `<h3 class="font-bold text-lg mb-4 flex items-center gap-2"><span class="text-blue-600">📊</span> IndexedDB Audit</h3>`;
        
        if (this.diagnostics.quota) {
            html += `
                <div class="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                    <div>Tárhely használat</div>
                    <div class="text-right">
                        <div class="text-3xl font-mono font-bold text-blue-600">${this.diagnostics.quota.percent}%</div>
                        <div class="text-xs text-gray-500">${(this.diagnostics.quota.usage/1024/1024).toFixed(1)} MB / ${(this.diagnostics.quota.quota/1024/1024/1024).toFixed(1)} GB</div>
                    </div>
                </div>`;
        }

        html += `<div class="grid grid-cols-2 gap-4 mt-6">`;
        Object.entries(this.diagnostics.stores || {}).forEach(([name, s]) => {
            html += `
                <div class="border rounded-2xl p-4">
                    <div class="font-semibold">${name}</div>
                    <div class="text-2xl font-mono">${s.count}</div>
                    <div class="text-xs text-gray-500">${s.sizeEstimateKB} KB</div>
                    ${s.issues.length ? `<div class="text-amber-600 text-xs mt-2">${s.issues.join('<br>')}</div>` : ''}
                </div>`;
        });
        html += `</div>`;

        if (this.diagnostics.consistency) {
            const c = this.diagnostics.consistency;
            html += `<div class="p-4 rounded-2xl ${c.orphans > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}">`;
            html += c.orphans > 0 ? `⚠️ ${c.orphans} árva bejegyzés észlelve` : `✅ Adatbázis konzisztens`;
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }
}
