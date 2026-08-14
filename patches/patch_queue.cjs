const fs = require('fs');

let js = fs.readFileSync('js/sync-service.js', 'utf8');

const replacement = `
    async _executeQueueItem(item) {
        const { operation, table } = item;
        let { data } = item;
        
        // CloudSync használata a tényleges művelethez
        if (!this.cloud.client) {
            return { success: false, error: 'Nincs felhő kapcsolat' };
        }

        const customKey = item.customKey || 'id';
        
        // Auto-fix invalid data
        if (operation !== 'delete' && (!data || typeof data !== 'object')) {
            if (table === 'months' && typeof data === 'string') {
                data = { month: data, updated_at: new Date().toISOString() };
            } else {
                return { success: false, error: 'Érvénytelen adat az upsert művelethez', unrecoverable: true };
            }
        }

        try {
            if (operation === 'delete') {
                await this.cloud.delete(table, data, customKey);
            } else {
                await this.cloud.upsert(table, data, customKey);
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
`;

js = js.replace(/async _executeQueueItem\(item\) \{[\s\S]*?return \{ success: false, error: e\.message \};\s*\}\s*\}/, replacement.trim());

// Also update the queue processing loop to drop unrecoverable items
const processLoop = `
            try {
                // Művelet végrehajtása
                const result = await this._executeQueueItem(item);
                
                if (result.success) {
                    this.updateQueueItem(item.id, { status: 'done' });
                    processed++;
                } else if (result.unrecoverable) {
                    console.warn(\`[SYNC] Javíthatatlan hiba (\${result.error}), elem eldobása a queue-ból.\`);
                    this.updateQueueItem(item.id, { status: 'done' }); // done-ra állítjuk, hogy kikerüljön
                    failed++;
                } else {
`;
js = js.replace(/try \{\s*\/\/ Művelet végrehajtása\s*const result = await this._executeQueueItem\(item\);\s*if \(result\.success\) \{\s*this\.updateQueueItem\(item\.id, \{ status: 'done' \}\);\s*processed\+\+;\s*\} else \{/, processLoop.trim());

fs.writeFileSync('js/sync-service.js', js);
console.log('Patched js/sync-service.js');
