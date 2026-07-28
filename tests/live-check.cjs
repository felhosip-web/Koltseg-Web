const https = require('https');
const http = require('http');
const fs = require('fs');

async function fetchWithTimeout(url, timeoutMs = 90000) {
    const protocol = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const req = protocol.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

async function runCheck() {
    console.log('Indítás: https://koltseg-web.onrender.com ellenőrzése...');
    const url = 'https://koltseg-web.onrender.com';

    const startTime = Date.now();

    try {
        const response = await fetchWithTimeout(url, 90000);
        const coldStartTime = Date.now() - startTime;
        console.log(`✅ Oldal betöltve. Válaszidő: ${coldStartTime}ms`);
        console.log(`📡 Státusz: ${response.status}`);

        if (response.status === 502) {
            console.error('❌ Hiba: 502 Bad Gateway! Az oldal nem elérhető.');
            process.exit(1);
        }

        if (response.status !== 200) {
            console.error(`❌ Váratlan státuszkód: ${response.status}`);
            process.exit(1);
        }

        const html = response.data;

        const hasTitle = html.includes('<title>');
        const hasKoltseg = html.includes('Költség') || html.includes('koltseg');
        const hasAppJs = html.includes('app.js') || html.includes('bundle') || html.includes('main.js') || html.includes('script');

        if (!hasTitle) console.error('❌ <title> tag hiányzik az HTML-ből!');
        if (!hasKoltseg) console.error('❌ "Költség" szó hiányzik az HTML-ből!');
        if (!hasAppJs) console.error('❌ Nincs utalás a JS fájlokra (app.js, script tag) az HTML-ben!');

        if (hasTitle && hasKoltseg && hasAppJs) {
            console.log('✅ HTML tartalom ellenőrzés sikeres.');
            console.log('   - <title> tag megtalálva.');
            console.log('   - "Költség" kulcsszó megtalálva.');
            console.log('   - Script / App betöltő rész megtalálva.');

            console.log('\n✅ MINDEN TESZT SIKERES! 🎉');

            if (fs.existsSync('E2E_LIVE_REPORT.md')) {
                let report = fs.readFileSync('E2E_LIVE_REPORT.md', 'utf8');
                report = report.replace('{RENDER_TIME}', coldStartTime.toString());
                fs.writeFileSync('E2E_LIVE_REPORT.md', report);
            }

            process.exit(0);
        } else {
            console.error('❌ A HTML tartalom ellenőrzés elbukott.');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Hiba történt a letöltés során:');
        console.error(err.message);
        process.exit(1);
    }
}

runCheck();
