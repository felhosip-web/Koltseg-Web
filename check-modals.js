import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const modals = [...html.matchAll(/id="(.*?Modal[A-Za-z0-9_]*)"/g)].map(m => m[1]);

console.log("Found modals:", modals);

// Check if they have hide/close logic
const jsFiles = fs.readdirSync('js/').filter(f => f.endsWith('.js'));
let missingClose = [];

for (const modal of modals) {
    let found = false;
    // check in HTML
    if (html.includes(`document.getElementById('${modal}').classList.add('hidden')`)) {
        found = true;
    }
    // check in JS
    if (!found) {
        for (const file of jsFiles) {
            const content = fs.readFileSync('js/' + file, 'utf8');
            if (content.includes(modal) && (content.includes('classList.add(\'hidden\')') || content.includes('.close()') || content.includes('hideModal('))) {
                found = true;
                break;
            }
        }
    }
    if (!found) {
        missingClose.push(modal);
    }
}

console.log("Modals possibly missing close logic:", missingClose);
