const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const modalsToExtract = [
    'settingsPanel',
    'cellEditorModal',
    'hmiInputModal',
    'globalConfirmModal',
    'editReminderModal',
    'syncModal',
    'conflictModal',
    'helpModal',
    'dbAuditModal',
    'workEditorModal'
];

let extractedHtml = '';

for (const id of modalsToExtract) {
    // Find the start of the div
    const startRegex = new RegExp(`(<div[^>]*id="${id}"[^>]*>)`);
    const match = html.match(startRegex);
    if (!match) {
        console.log(`Could not find ${id}`);
        continue;
    }
    const startIndex = match.index;
    
    // Find the matching closing div
    let depth = 0;
    let i = startIndex;
    let foundEnd = false;
    let endIndex = -1;
    
    // We need to parse by tags
    // Let's use a simpler approach: regex with balanced groups, or just simple parsing
    while (i < html.length) {
        if (html.substring(i, i + 4) === '<div') {
            depth++;
            i += 4;
        } else if (html.substring(i, i + 6) === '</div>') {
            depth--;
            if (depth === 0) {
                endIndex = i + 6;
                foundEnd = true;
                break;
            }
            i += 6;
        } else {
            i++;
        }
    }
    
    if (foundEnd) {
        // Also grab any preceding comment like <!-- ===== ... ===== -->
        let realStartIndex = startIndex;
        const beforeStr = html.substring(startIndex - 150, startIndex);
        const commentMatch = beforeStr.lastIndexOf('<!--');
        if (commentMatch !== -1 && beforeStr.substring(commentMatch).includes('=====')) {
            realStartIndex = startIndex - 150 + commentMatch;
        }
        
        const modalHtml = html.substring(realStartIndex, endIndex);
        extractedHtml += modalHtml + '\n\n';
        
        // Remove from original
        html = html.substring(0, realStartIndex) + html.substring(endIndex);
        console.log(`Extracted ${id}`);
    } else {
        console.log(`Could not find end for ${id}`);
    }
}

// Insert before <div id="securityGuardOverlay">
const targetStr = '<div id="securityGuardOverlay"';
const targetIndex = html.indexOf(targetStr);
if (targetIndex !== -1) {
    // Also include preceding comment if any
    let realTargetIndex = targetIndex;
    const beforeTarget = html.substring(targetIndex - 100, targetIndex);
    const commentMatch = beforeTarget.lastIndexOf('<!--');
    if (commentMatch !== -1 && beforeTarget.substring(commentMatch).includes('=====')) {
        realTargetIndex = targetIndex - 100 + commentMatch;
    }
    
    html = html.substring(0, realTargetIndex) + '    <!-- ===== MODALS & OVERLAYS (GLOBAL) ===== -->\n' + extractedHtml + html.substring(realTargetIndex);
    fs.writeFileSync('index.html', html);
    console.log('Successfully written index.html');
} else {
    console.log('Could not find securityGuardOverlay');
}
