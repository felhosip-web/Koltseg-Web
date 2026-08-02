import fs from 'fs';

let content = fs.readFileSync('js/sync-service.js', 'utf8');

// Replace the addToQueue to log it to console clearly
content = content.replace(
    /addToQueue\(operation, data, table, priority = 'normal', customKey = 'id'\) \{/g,
    `addToQueue(operation, data, table, priority = 'normal', customKey = 'id') {
        console.log('[DEBUG_QUEUE] Added to queue:', operation, table, priority);
        console.trace('[DEBUG_QUEUE] Trace:');`
);

fs.writeFileSync('js/sync-service.js', content);
