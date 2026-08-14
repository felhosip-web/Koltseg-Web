import fs from 'fs';
let content = fs.readFileSync('js/ai-modal-controller.js', 'utf8');

content = content.replace(
    /body: JSON\.stringify\(\{\s+text,\s+categories,\s+months,\s+currentDate\s+\}\)/,
    `body: JSON.stringify({
                    text,
                    categories,
                    months,
                    currentDate,
                    aiConfig: this.app.config.aiConfig
                })`
);

fs.writeFileSync('js/ai-modal-controller.js', content);
