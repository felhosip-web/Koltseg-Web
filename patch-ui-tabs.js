import fs from 'fs';
let content = fs.readFileSync('js/ui-controller.js', 'utf8');

content = content.replace(
    "                } else if (targetTab === 'security') {",
    "                } else if (targetTab === 'ai') {\n                    contentId = 'settingsContentAi';\n                } else if (targetTab === 'security') {"
);

fs.writeFileSync('js/ui-controller.js', content);
