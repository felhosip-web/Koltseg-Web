import fs from 'fs';

let content = fs.readFileSync('js/sync-service.js', 'utf8');

// Replace the specific line for offline check
content = content.replace(
    "this.addToQueue(operation, data, storeName, 'high', customKey);",
    "if (!skipQueueOnError) this.addToQueue(operation, data, storeName, 'high', customKey);"
);

// Replace the specific line for no cloud check
content = content.replace(
    "this.addToQueue(operation, data, storeName, 'normal', customKey);",
    "if (!skipQueueOnError) this.addToQueue(operation, data, storeName, 'normal', customKey);"
);

fs.writeFileSync('js/sync-service.js', content);
