const fs = require('fs');

let js = fs.readFileSync('js/app.js', 'utf8');

// 1. Add updateGDriveDebugInfo call when panel opens
js = js.replace('updateNotificationPermissionStatus();', 'updateNotificationPermissionStatus();\n            updateGDriveDebugInfo();');

// 2. Add to tabGDrive click handler
js = js.replace('switchTab(tabBtnGDrive, tabGDrive);', 'switchTab(tabBtnGDrive, tabGDrive);\n        updateGDriveDebugInfo();');

// 3. Add the function definitions before updateSupabaseDebugInfo
const funcCode = `
// === GOOGLE DRIVE DEBUG ===
function updateGDriveDebugInfo() {
    const container = document.getElementById('debugGDriveContainer');
    if (!container) return;
    
    const backupService = window.app?.backupManager?.gdrive;
    if (!backupService) {
        container.innerHTML = '<div class="text-rose-500 font-bold p-4 bg-rose-50 rounded-xl text-xs">Google Drive modul nem elérhető.</div>';
        return;
    }
    
    const status = backupService.getStatus();
    
    let html = '<div class="bg-gray-50 p-4 rounded-xl space-y-3">';
    
    html += '<div class="grid grid-cols-2 gap-y-2 text-[10px] sm:text-xs font-mono">';
    html += '<div>Konfigurálva (ID):</div>';
    html += \`<div class="font-bold \${status.isConfigured ? 'text-emerald-600' : 'text-amber-500 text-right'}">\${status.isConfigured ? 'Igen' : 'Nem'}</div>\`;
    html += '<div>Hitelesítve:</div>';
    html += \`<div class="font-bold \${status.isAuthorized ? 'text-emerald-600' : 'text-amber-500 text-right'}">\${status.isAuthorized ? 'Igen' : 'Nem'}</div>\`;
    if (status.tokenExpiry) {
        html += '<div>Token lejár:</div>';
        html += \`<div class="text-gray-600 text-right">\${status.tokenExpiry}</div>\`;
    }
    if (status.folderId) {
        html += '<div>Mappa azonosító:</div>';
        html += \`<div class="text-gray-600 truncate text-right">\${status.folderId}</div>\`;
    }
    html += '</div>';
    
    html += '<div class="pt-3">';
    html += '<button id="btnTestGDriveDebug" class="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2">';
    html += '<i class="fas fa-satellite-dish"></i> Átfogó Diagnosztika Futtatása';
    html += '</button>';
    html += '</div>';
    
    html += '<div id="debugGDriveResult" class="hidden mt-3 p-3 bg-slate-900 text-green-400 rounded-lg text-[10px] font-mono leading-relaxed max-h-[250px] overflow-y-auto"></div>';
    
    html += '</div>'; // bg-gray-50
    
    container.innerHTML = html;
    
    // Eseménykezelő
    document.getElementById('btnTestGDriveDebug')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnTestGDriveDebug');
        const resDiv = document.getElementById('debugGDriveResult');
        if (!btn || !resDiv) return;
        
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tesztelés folyamatban...';
        btn.disabled = true;
        resDiv.classList.remove('hidden');
        resDiv.innerHTML = 'Diagnosztika indítása...\\n';
        
        try {
            const results = await backupService.runDiagnostic();
            
            let logHtml = \`Eredmény: <strong class="\${results.overallSuccess ? 'text-green-500' : 'text-red-500'}">\${results.overallSuccess ? 'SIKERES' : 'HIBÁS'}</strong>\\n\\n\`;
            
            results.steps.forEach(step => {
                const icon = step.success ? '✅' : '❌';
                logHtml += \`\${icon} \${step.name}\\n\`;
                if (step.detail) logHtml += \`   > \${step.detail}\\n\`;
            });
            
            resDiv.innerHTML = logHtml;
            if (!results.overallSuccess) {
                resDiv.classList.replace('text-green-400', 'text-amber-400');
            }
        } catch (e) {
            resDiv.innerHTML += \`\\nKivétel történt: \${e.message}\`;
            resDiv.classList.replace('text-green-400', 'text-red-400');
        } finally {
            btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Átfogó Diagnosztika Futtatása';
            btn.disabled = false;
        }
    });
}

function updateSupabaseDebugInfo() {`;

js = js.replace('function updateSupabaseDebugInfo() {', funcCode);
fs.writeFileSync('js/app.js', js);
console.log('Patched js/app.js');
