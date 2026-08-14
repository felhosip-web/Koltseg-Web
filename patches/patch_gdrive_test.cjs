const fs = require('fs');
let js = fs.readFileSync('js/app.js', 'utf8');

const replacement = `
    // Google Drive Kapcsolati teszt
    const btnTestGDrive = document.getElementById('btnTestGDriveConnDebug');
    btnTestGDrive?.addEventListener('click', async () => {
        const app = window.app;
        if (!app) return;
        const clientId = app.config?.gdriveClientId;
        const resultDiv = document.getElementById('debugGDriveConnResult');
        if (!resultDiv) return;

        resultDiv.classList.remove('hidden');
        resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-amber-50 text-amber-800 border border-amber-200";
        resultDiv.textContent = "OAuth kapcsolat ellenőrzése folyamatban...";

        if (!clientId) {
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-red-50 text-red-800 border border-red-200";
            resultDiv.textContent = "Hiba: Google OAuth Client ID nincs megadva a beállításokban!";
            return;
        }

        try {
            if (app.gdriveBackup) {
                // Meghívjuk az authorize-t interaktív móddal
                const token = await app.gdriveBackup.authorize(true);
                if (token) {
                    resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200";
                    resultDiv.textContent = \`🟢 SIKERES KAPCSOLAT!\\nAz OAuth token sikeresen lekérve.\\nGoogle Drive API készen áll a biztonsági mentésekre.\`;
                } else {
                    resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
                    resultDiv.textContent = \`🔴 HITELESÍTÉSI HIBA!\\nA felugró ablak be lett zárva, vagy a hitelesítés meghiúsult.\`;
                }
            } else {
                resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
                resultDiv.textContent = "Hiba: GDrive modul nincs betöltve.";
            }
        } catch (err) {
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
            resultDiv.textContent = \`🔴 HÁLÓZATI/OAUTH HIBA!\\nRészletek: \${err.message}\\nJavaslat: Ellenőrizd a Client ID helyességét és az engedélyeket!\`;
        }
    });

    // Supabase felhő adatbázis teljes törlése (RESET)
`;

js = js.replace(/\/\/\s*Supabase felhő adatbázis teljes törlése \(RESET\)/, replacement.trim() + '\n    // Supabase felhő adatbázis teljes törlése (RESET)');

// Also we need to make sure the debugGDriveClientIdStatus is updated when opening the panel
const statusRepl = `
        const sUrlSpan = document.getElementById('debugSupaUrlStatus');
        const sKeySpan = document.getElementById('debugSupaKeyStatus');
        const gdClientSpan = document.getElementById('debugGDriveClientIdStatus');
        if (sUrlSpan) sUrlSpan.textContent = app.config?.supabaseConfig?.url ? "BEÁLLÍTVA" : "HIÁNYZIK";
        if (sKeySpan) sKeySpan.textContent = app.config?.supabaseConfig?.key ? "BEÁLLÍTVA" : "HIÁNYZIK";
        if (gdClientSpan) gdClientSpan.textContent = app.config?.gdriveClientId ? "BEÁLLÍTVA" : "HIÁNYZIK";
`;
js = js.replace(/const sUrlSpan = document\.getElementById\('debugSupaUrlStatus'\);\s*const sKeySpan = document\.getElementById\('debugSupaKeyStatus'\);\s*if \(sUrlSpan\) sUrlSpan\.textContent[^;]+;\s*if \(sKeySpan\) sKeySpan\.textContent[^;]+;/, statusRepl.trim());

fs.writeFileSync('js/app.js', js);
console.log('Patched js/app.js for GDrive test');
