import fs from 'fs';

let content = fs.readFileSync('js/sync-service.js', 'utf8');

// The exact string in the file right now is:
// addToQueue(operation, data, table, priority = 'normal', customKey = 'id') {
//         console.log('[DEBUG_QUEUE] Added to queue:', operation, table, priority);
//         console.trace('[DEBUG_QUEUE] Trace:');

const search = `addToQueue(operation, data, table, priority = 'normal', customKey = 'id') {
        console.log('[DEBUG_QUEUE] Added to queue:', operation, table, priority);
        console.trace('[DEBUG_QUEUE] Trace:');
        const item = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            operation, // 'create', 'update', 'delete'
            table,
            data,
            customKey,
            priority, // 'high', 'normal', 'low'
            timestamp: new Date().toISOString(),
            retryCount: 0,
            status: 'pending' // 'pending', 'processing', 'done', 'failed'
        };`;

const replace = `addToQueue(operation, data, table, priority = 'normal', customKey = 'id') {
        const keyValue = data[customKey] || data.id;
        const existingIndex = keyValue ? this._syncQueue.findIndex(i => i.table === table && (i.data[customKey] === keyValue || i.data.id === keyValue)) : -1;
        
        if (existingIndex !== -1) {
            this._syncQueue[existingIndex] = {
                ...this._syncQueue[existingIndex],
                operation,
                data,
                priority,
                timestamp: new Date().toISOString(),
                status: 'pending',
                retryCount: 0
            };
            this._saveSyncQueue();
            return this._syncQueue[existingIndex];
        }

        const item = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            operation, // 'create', 'update', 'delete'
            table,
            data,
            customKey,
            priority, // 'high', 'normal', 'low'
            timestamp: new Date().toISOString(),
            retryCount: 0,
            status: 'pending' // 'pending', 'processing', 'done', 'failed'
        };`;

if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync('js/sync-service.js', content);
    console.log("Successfully replaced");
} else {
    console.log("Search string not found!");
}
