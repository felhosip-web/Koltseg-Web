const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacement = `
            <div id="debugTabGDrive" class="hidden space-y-4">
                <div class="bg-green-50 border border-green-200 p-4 rounded-2xl mb-4">
                    <h4 class="font-bold text-green-800 text-sm mb-1 flex items-center gap-1.5">
                        <i class="fab fa-google-drive"></i> Google Drive API & Szinkronizáció
                    </h4>
                    <p class="text-xs text-green-700">Részletes ellenőrzés a Google Drive API kapcsolatról és az appDataFolder írás/olvasási jogosultságokról.</p>
                </div>
                
                <div class="bg-gray-50 p-4 rounded-xl space-y-3">
                    <div class="flex items-center justify-between text-xs font-mono">
                        <div>Client ID: <span id="debugGDriveClientIdStatus" class="font-bold text-gray-500">Nincs</span></div>
                    </div>
                    <button id="btnTestGDriveConnDebug"
                        class="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2">
                        <i class="fas fa-plug-circle-check"></i> Kapcsolat Tesztelése (Hitelesítés)
                    </button>
                    <div id="debugGDriveConnResult" class="hidden p-3 rounded-lg text-xs font-mono"></div>
                </div>

                <div id="debugGDriveContainer"></div>
            </div>
`;

html = html.replace(/<div id="debugTabGDrive" class="hidden space-y-4">[\s\S]*?<div id="debugGDriveContainer"><\/div>\s*<\/div>/, replacement.trim());
fs.writeFileSync('index.html', html);
console.log('Patched index.html for GDrive tab');
