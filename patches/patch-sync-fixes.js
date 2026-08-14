import fs from 'fs';

let content = fs.readFileSync('js/sync-service.js', 'utf8');

// 1. Fix processQueue
content = content.replace(
    'async processQueue() {',
    'async processQueue(fromSync = false) {'
);
content = content.replace(
    'if (this.isSyncing) {',
    'if (this.isSyncing && !fromSync) {'
);
content = content.replace(
    'const queueResult = await this.processQueue();',
    'const queueResult = await this.processQueue(true);'
);

// 2. Fix push
content = content.replace(
    "async push(storeName, data, isDelete = false, customKey = 'id') {",
    "async push(storeName, data, isDelete = false, customKey = 'id', skipQueueOnError = false) {"
);
content = content.replace(
    "this.addToQueue(operation, data, storeName, 'high', customKey);",
    "if (!skipQueueOnError) this.addToQueue(operation, data, storeName, 'high', customKey);"
);

// 3. Update sync to use skipQueueOnError
content = content.replace(
    'await this.push(table, cleanItem, false, customKey);',
    'await this.push(table, cleanItem, false, customKey, true);'
);

// 4. Update addToQueue to deduplicate
content = content.replace(
    "addToQueue(operation, data, table, priority = 'normal', customKey = 'id') {",
    `addToQueue(operation, data, table, priority = 'normal', customKey = 'id') {
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
        }`
);

fs.writeFileSync('js/sync-service.js', content);
