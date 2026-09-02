// scripts/build.js - Verzió automatikus növelése (ESM)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VERSION_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'version.json');

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
    
    // Frissítjük a service-worker.js-ben a CACHE_VERSION és BUILD_DATE értékeket
    const SW_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'service-worker.js');
    if (fs.existsSync(SW_FILE)) {
        let swContent = fs.readFileSync(SW_FILE, 'utf8');
        swContent = swContent.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${newVersion}';`);
        swContent = swContent.replace(/const BUILD_DATE = '[^']+';/, `const BUILD_DATE = '${data.build.slice(0, 10)}';`);
        fs.writeFileSync(SW_FILE, swContent);
        console.log(`✅ service-worker.js frissítve (CACHE_VERSION: ${newVersion})`);
    }

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