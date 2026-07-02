// scripts/build.js - Verzió automatikus növelése
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    if (!fs.existsSync(VERSION_FILE)) {
        console.error('❌ version.json nem található!');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    const newVersion = getVersionBump(type);
    
    data.version = newVersion;
    data.build = new Date().toISOString();
    
    // Changelog frissítés (opcionális)
    const changelogIndex = process.argv.indexOf('--changelog');
    if (changelogIndex !== -1) {
        const change = process.argv[changelogIndex + 1];
        if (change) {
            if (!data.changelog) data.changelog = [];
            data.changelog.unshift({
                version: newVersion,
                date: new Date().toISOString().slice(0, 10),
                changes: [change]
            });
        }
    }
    
    fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Verzió frissítve: ${newVersion}`);
    console.log(`📅 Build: ${data.build}`);
    
    // Git tag létrehozás (opcionális)
    if (process.argv.includes('--tag')) {
        try {
            execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });
            console.log(`🏷️ Git tag létrehozva: v${newVersion}`);
        } catch (e) {
            console.warn('⚠️ Git tag létrehozás sikertelen (lehet, hogy nincs git repo)');
        }
    }
}

// Parancssori argumentumok
const type = process.argv[2] || 'patch';
updateVersion(type);