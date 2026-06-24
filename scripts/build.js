// scripts/build.js - Verzió automatikus növelése
const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '../version.json');

function getVersionBump(type = 'patch') {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    const parts = data.version.split('.').map(Number);
    
    switch (type) {
        case 'major': parts[0]++; parts[1] = 0; parts[2] = 0; break;
        case 'minor': parts[1]++; parts[2] = 0; break;
        case 'patch': parts[2]++; break;
        default: parts[2]++;
    }
    
    return parts.join('.');
}

function updateVersion(type = 'patch') {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    const newVersion = getVersionBump(type);
    
    data.version = newVersion;
    data.build = new Date().toISOString();
    
    // Changelog frissítés (opcionális)
    if (process.argv.includes('--changelog')) {
        const change = process.argv[process.argv.indexOf('--changelog') + 1];
        if (change) {
            data.changelog.unshift({
                version: newVersion,
                date: new Date().toISOString().slice(0,10),
                changes: [change]
            });
        }
    }
    
    fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Verzió frissítve: ${newVersion}`);
    console.log(`📅 Build: ${data.build}`);
}

// Parancssori argumentumok
const type = process.argv[2] || 'patch';
updateVersion(type);