const fs = require('fs');

let content = fs.readFileSync('js/ui-controller.js', 'utf8');

const searchBlock = `    // Check gomb eseménykezelője
    if (checkBtn) {
        checkBtn.onclick = async () => {
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-600 text-xl"></i><div><h4 class="font-bold text-gray-800">Ellenőrzés folyamatban...</h4></div>';
            statusText.textContent = 'Adatok letöltése és összehasonlítása...';
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse';

            try {
                if (typeof this.app.syncManager.getSyncDiff !== 'function') {
                    throw new Error("getSyncDiff függvény nem található");
                }
                const diffs = await this.app.syncManager.getSyncDiff();

                const escapeHtml = (unsafe) => {
                    return (unsafe || '').toString()
                         .replace(/&/g, "&amp;")
                         .replace(/</g, "&lt;")
                         .replace(/>/g, "&gt;")
                         .replace(/"/g, "&quot;")
                         .replace(/'/g, "&#039;");
                };

                // Diff konténer megjelenítése
                diffContainer.classList.remove('hidden');

                // Helyi változások listázása
                if (diffs.local && diffs.local.length > 0) {
                    localDiffList.innerHTML = diffs.local.map(d =>
                        \`<div class="flex justify-between items-center bg-white p-2 rounded border border-emerald-100 shadow-sm">
                            <div class="truncate mr-2"><span class="font-bold text-emerald-700">\${d.table}</span>: \${escapeHtml(d.label)}</div>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold \${d.type === 'new' ? 'bg-emerald-100 text-emerald-800' : (d.type === 'deleted' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}">
                                \${d.type === 'new' ? 'ÚJ' : (d.type === 'deleted' ? 'TÖRLÉS' : 'MOD')}
                            </span>
                        </div>\`
                    ).join('');
                } else {
                    localDiffList.innerHTML = '<div class="text-center text-gray-400 italic p-4">Nincs új/módosított helyi adat</div>';
                }

                // Felhő változások listázása
                if (diffs.cloud && diffs.cloud.length > 0) {
                    cloudDiffList.innerHTML = diffs.cloud.map(d =>
                        \`<div class="flex justify-between items-center bg-white p-2 rounded border border-blue-100 shadow-sm">
                            <div class="truncate mr-2"><span class="font-bold text-blue-700">\${d.table}</span>: \${escapeHtml(d.label)}</div>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold \${d.type === 'new' ? 'bg-blue-100 text-blue-800' : (d.type === 'deleted' ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800')}">
                                \${d.type === 'new' ? 'ÚJ' : (d.type === 'deleted' ? 'TÖRLÉS' : 'MOD')}
                            </span>
                        </div>\`
                    ).join('');
                } else {
                    cloudDiffList.innerHTML = '<div class="text-center text-gray-400 italic p-4">Nincs új/módosított felhő adat</div>';
                }

                // Eredmény kijelzése
                if ((!diffs.local || diffs.local.length === 0) && (!diffs.cloud || diffs.cloud.length === 0)) {
                    statusText.textContent = 'Minden adat szinkronban van!';
                    document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-green-500';
                    executeBtn.disabled = true;
                } else {
                    statusText.textContent = \`Eltérések találva: \${diffs.local?.length || 0} helyi, \${diffs.cloud?.length || 0} felhő.\`;
                    document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-yellow-500';
                    executeBtn.disabled = false;
                }

            } catch (err) {
                console.error('[SyncModal] Check diff hiba:', err);
                statusText.textContent = 'Hiba az ellenőrzés során: ' + err.message;
                document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-red-500';
            } finally {
                checkBtn.disabled = false;
                checkBtn.innerHTML = \`
                    <i class="fas fa-search text-blue-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-gray-800">Újraellenőrzés</h4>
                        <p class="text-xs text-gray-500">Kattints a frissítéshez</p>
                    </div>
                \`;
            }
        };
    }`;

const replaceBlock = `    // Check gomb eseménykezelője
    if (checkBtn) {
        checkBtn.onclick = async () => {
            if (this.isCheckingSync) return;
            this.isCheckingSync = true;

            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-600 text-xl"></i><div><h4 class="font-bold text-gray-800">Ellenőrzés folyamatban...</h4></div>';
            statusText.textContent = 'Adatok letöltése és összehasonlítása...';
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse';

            try {
                // Modal elrejtése a nagy művelet előtt
                modal.classList.add('hidden');

                await runAndShowSyncDiff(this.app, 'pull');

                statusText.textContent = 'Kattints az "Ellenőrzés" gombra a különbségek lekéréséhez.';
                document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-gray-400';

            } catch (err) {
                console.error('[SyncModal] Check diff hiba:', err);

                // Hiba esetén visszaállítjuk az eredeti modal láthatóságát
                modal.classList.remove('hidden');
                statusText.textContent = 'Hiba az ellenőrzés során: ' + err.message;
                document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-red-500';
            } finally {
                this.isCheckingSync = false;
                checkBtn.disabled = false;
                checkBtn.innerHTML = \`
                    <i class="fas fa-search text-blue-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-gray-800">Újraellenőrzés</h4>
                        <p class="text-xs text-gray-500">Kattints a frissítéshez</p>
                    </div>
                \`;
            }
        };
    }`;

if (content.includes(replaceBlock)) {
    process.exit(0);
}

if (!content.includes(searchBlock)) {
    throw new Error('Az elvárt szinkron-ellenőrző eseménykezelő nem található a js/ui-controller.js fájlban.');
}

const importStatement = "import { runAndShowSyncDiff } from './sync-diff-view.js';";
const importAnchor = "import { DataMaintenanceController } from './data-maintenance-controller.js';";

if (!content.includes(importStatement)) {
    if (!content.includes(importAnchor)) {
        throw new Error('A sync diff import beszúrási pontja nem található a js/ui-controller.js fájlban.');
    }
    content = content.replace(importAnchor, `${importAnchor}\n${importStatement}`);
}

content = content.replace(searchBlock, replaceBlock);
fs.writeFileSync('js/ui-controller.js', content, 'utf8');
