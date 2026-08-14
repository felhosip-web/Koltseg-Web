// ================================================================
// === DEBUG CONSOLE PATCH + DEBUG PANEL (JAVÍTOTT) ===
// ================================================================

// Biztonságos console monkey-patch normál függvényként definálva
export function setupDebugConsole() {
    if (window.__debugConsolePatched) return;

    // Csak ha a debug mód kifejezetten engedélyezett
    if (localStorage.getItem('debug_mode') !== 'true') return;

    window.__debugConsolePatched = true;

    const serializeArgs = (args) => {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return '[Object]';
            }
            return String(arg);
        }).join(' ');
    };

    const originalLog = console.log;
    console.log = function(...args) {
        originalLog.apply(console, args);
        try {
            const logs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
            logs.push(new Date().toLocaleTimeString('hu-HU') + ' ' + serializeArgs(args));
            localStorage.setItem('debug_logs', JSON.stringify(logs.slice(-100)));
        } catch(e) {}
    };

    const originalError = console.error;
    console.error = function(...args) {
        originalError.apply(console, args);
        try {
            const logs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
            logs.push('❌ ' + new Date().toLocaleTimeString('hu-HU') + ' ' + serializeArgs(args));
            localStorage.setItem('debug_logs', JSON.stringify(logs.slice(-100)));
        } catch(e) {}
    };

    console.log('💡 Debug console patch aktiválva');
}

// ================================================================
// === DEBUG PANEL HELPER FÜGGVÉNYEK ===
// ================================================================

export function initDebugPanel() {
    const panel = document.getElementById('debugPanel');
    const closeBtn = document.getElementById('closeDebugPanel');

    if (!panel) return;

    let clickCount = 0;
    let clickTimer = null;
    let lastInteractionTime = 0;

    function handleTrigger(e) {
        const now = Date.now();
        // Prevent double counting from overlapping touchstart and click events
        if (now - lastInteractionTime < 250) {
            return;
        }
        lastInteractionTime = now;

        clickCount++;
        clearTimeout(clickTimer);

        if (clickCount >= 5) {
            clickCount = 0;
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                updateDebugStatus();
                updateDebugLogs();
                updateSupabaseDebugInfo();
                updateNotificationPermissionStatus();
                updateGDriveDebugInfo();
            }
        }

        clickTimer = setTimeout(() => { clickCount = 0; }, 1000);
    }

    // Select all version labels, debug buttons, and footer container
    const triggerElements = document.querySelectorAll('.app-version-label, #debugToggleBtn, #debugToggleBtnContainer');

    triggerElements.forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            handleTrigger(e);
        });
        el.addEventListener('touchstart', (e) => {
            // Do not call preventDefault on touchstart here, as it might block standard scroll or focus in parents,
            // but we stop propagation and count the touch.
            handleTrigger(e);
        }, { passive: true });
    });

    closeBtn?.addEventListener('click', () => {
        panel.classList.add('hidden');
    });

    // Delegált kattintásfigyelő a Súgóból nyitható fejlesztői és debug panelhez
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#helpOpenDevPanelBtn');
        if (btn) {
            e.preventDefault();
            panel.classList.remove('hidden');
            updateDebugStatus();
            updateDebugLogs();
            updateSupabaseDebugInfo();
            updateNotificationPermissionStatus();
        }

        const srvBtn = e.target.closest('#helpOpenServicePanelBtn');
        if (srvBtn) {
            e.preventDefault();
            if (window.app?.serviceDev) {
                window.app.serviceDev.showMenu();
            } else {
                console.warn('[APP] ServiceDevManager not found on window.app');
            }
        }
    });

    // --- TAB VÁLASZTÓ LOGIKA ---
    const tabBtnActions = document.getElementById('tabBtnDebugActions');
    const tabBtnSupabase = document.getElementById('tabBtnDebugSupabase');
    const tabBtnReminders = document.getElementById('tabBtnDebugReminders');
    const tabBtnGDrive = document.getElementById('tabBtnDebugGDrive');

    const tabActions = document.getElementById('debugTabActions');
    const tabSupabase = document.getElementById('debugTabSupabase');
    const tabReminders = document.getElementById('debugTabReminders');
    const tabGDrive = document.getElementById('debugTabGDrive');

    const switchTab = (activeBtn, activeTab) => {
        [tabBtnActions, tabBtnSupabase, tabBtnReminders, tabBtnGDrive].forEach(btn => {
            if (btn) {
                btn.className = "flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white/50 transition";
            }
        });
        [tabActions, tabSupabase, tabReminders, tabGDrive].forEach(tab => {
            if (tab) tab.classList.add('hidden');
        });

        if (activeBtn) activeBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl bg-white text-slate-800 shadow-sm transition";
        if (activeTab) activeTab.classList.remove('hidden');
    };

    tabBtnActions?.addEventListener('click', () => switchTab(tabBtnActions, tabActions));
    tabBtnSupabase?.addEventListener('click', () => {
        switchTab(tabBtnSupabase, tabSupabase);
        updateSupabaseDebugInfo();
    });
    tabBtnReminders?.addEventListener('click', () => {
        switchTab(tabBtnReminders, tabReminders);
        updateNotificationPermissionStatus();
    });
    tabBtnGDrive?.addEventListener('click', () => {
        switchTab(tabBtnGDrive, tabGDrive);
        updateGDriveDebugInfo();
    });

    // Debug gombok
    document.querySelectorAll('.debug-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const originalText = btn.textContent;
            btn.textContent = '⏳ ...';
            btn.disabled = true;

            try {
                await handleDebugAction(action);
                updateDebugStatus();
                updateDebugLogs();
            } catch(e) {
                console.error('[DEBUG] Hiba:', e);
                alert('❌ Hiba: ' + e.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });

    // Logok törlése gomb
    const btnClearLogs = document.getElementById('btnClearDebugLogs');
    btnClearLogs?.addEventListener('click', () => {
        localStorage.removeItem('debug_logs');
        updateDebugLogs();
    });

    // Supabase SQL másolás
    const btnCopySQL = document.getElementById('btnCopySupabaseSQL');
    const sqlTextarea = document.getElementById('debugSupabaseSQL');
    if (sqlTextarea) {
        sqlTextarea.value = getSupabaseSQLScript();
    }
    btnCopySQL?.addEventListener('click', () => {
        if (sqlTextarea) {
            navigator.clipboard.writeText(sqlTextarea.value);
            window.app?.hmiNotif?.showToast('SQL séma másolva a vágólapra!', 'success');
        }
    });

    // Supabase Ping / Kapcsolati teszt
    const btnTestSupa = document.getElementById('btnTestSupabaseConnDebug');
    btnTestSupa?.addEventListener('click', async () => {
        const app = window.app;
        if (!app) return;

        const config = app.config;
        let url = config?.supabaseConfig?.url;
        const key = config?.supabaseConfig?.key;
        const resultDiv = document.getElementById('debugSupabaseConnResult');

        if (!resultDiv) return;

        // URL tisztítása és normalizálása ha esetleg rossz formátumban maradt
        if (url) {
            url = url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
        }
        resultDiv.classList.remove('hidden');
        resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-amber-50 text-amber-800 border border-amber-200";
        resultDiv.textContent = "Kapcsolódás folyamatban...";

        if (!url || !key) {
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-red-50 text-red-800 border border-red-200";
            resultDiv.textContent = "Hiba: Supabase URL és Key megadása kötelező a Beállításokban!";
            return;
        }

        try {
            // Ping a Supabase REST API-nak a kategóriák (items) tábla lekérésével, limit 1
            const response = await fetch(`${url}/rest/v1/items?select=id&limit=1`, {
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`
                }
            });

            if (response.ok) {
                resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200";
                resultDiv.textContent = `🟢 SIKERES KAPCSOLAT!\nA Supabase szerver elérhető és válaszol.\nA Kategóriák (items) tábla ellenőrzése rendben.\nStátusz: ${response.status} (${response.statusText})`;
            } else {
                const text = await response.text();
                resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
                resultDiv.textContent = `🔴 KAPCSOLATI HIBA!\nA szerver válaszolt, de hibát jelzett.\n\nStátusz: ${response.status} (${response.statusText})\nRészletek: ${text}\n\nJavaslat: Ellenőrizd, hogy lefuttattad-e az SQL sémát és nincsenek-e elgépelve a kulcsok!`;
            }
        } catch(err) {
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
            resultDiv.textContent = `🔴 HÁLÓZATI HIBA!\nNem sikerült elérni a megadott Supabase címet.\n\nRészletek: ${err.message}\n\nJavaslat: Ellenőrizd az URL formátumát (pl. https://xxx.supabase.co)!`;
        }
    });

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
                    resultDiv.textContent = `🟢 SIKERES KAPCSOLAT!\nAz OAuth token sikeresen lekérve.\nGoogle Drive API készen áll a biztonsági mentésekre.`;
                } else {
                    resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
                    resultDiv.textContent = `🔴 HITELESÍTÉSI HIBA!\nA felugró ablak be lett zárva, vagy a hitelesítés meghiúsult.`;
                }
            } else {
                resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
                resultDiv.textContent = "Hiba: GDrive modul nincs betöltve.";
            }
        } catch (err) {
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200";
            resultDiv.textContent = `🔴 HÁLÓZATI/OAUTH HIBA!\nRészletek: ${err.message}\nJavaslat: Ellenőrizd a Client ID helyességét és az engedélyeket!`;
        }
    });

    // Supabase felhő adatbázis teljes törlése (RESET)
    // Supabase felhő adatbázis teljes törlése (RESET)
    const btnWipeSupa = document.getElementById('btnWipeSupabaseCloudDebug');
    btnWipeSupa?.addEventListener('click', async () => {
        const app = window.app;
        if (!app) return;

        if (app.securityGuard && app.securityGuard.currentUser === 'guest') {
            app.hmiNotif?.showToast('❌ Törlés elutasítva: Vendég (User 2) módban ez a funkció le van tiltva!', 'error');
            return;
        }

        const resultDiv = document.getElementById('debugSupabaseWipeResult');
        if (!resultDiv) return;

        const url = app.config?.supabaseConfig?.url;
        const key = app.config?.supabaseConfig?.key;

        if (!url || !key) {
            resultDiv.classList.remove('hidden');
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-red-50 text-red-800 border border-red-200 mt-2";
            resultDiv.textContent = "Hiba: Supabase URL és Key nincs megadva a Beállításokban!";
            return;
        }

        // Külön ablak / Input modal a jelszó bekérésére
        const password = await app.hmiNotif.showInputModal({
            title: '🔑 Felhő RESET Megerősítése',
            label: 'Ez a művelet TELJESEN és visszafordíthatatlanul törli a felhő adatbázis összes táblájának tartalmát! Kérjük, írd be a jelszót a folytatáshoz:',
            placeholder: 'Jelszó...',
            inputType: 'text',
            confirmText: 'MINDEN TÖRÖLVE LEGYEN'
        });

        if (!password) {
            app.hmiNotif.showToast('Törlés megszakítva', 'info');
            return;
        }

        // A kért jelszó ellenőrzése: " !!most minden torles!! " (trimmed vagy pontos egyezés)
        if (password !== '!!most minden torles!!' && password !== ' !!most minden torles!! ') {
            app.hmiNotif.showToast('❌ Hibás jelszó! A törlés elutasítva.', 'error');
            resultDiv.classList.remove('hidden');
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-red-50 text-red-800 border border-red-200 mt-2";
            resultDiv.textContent = "Hiba: Érvénytelen jelszó a felhő reseteléshez!";
            return;
        }

        // Jelszó helyes, indítsuk el a törlést!
        resultDiv.classList.remove('hidden');
        resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-amber-50 text-amber-800 border border-amber-200 mt-2";
        resultDiv.textContent = "Felhő törlése folyamatban...";
        app.hmiNotif.showToast('Felhő adatbázis törlése indítva...', 'info');

        try {
            if (!app.syncService?.cloud) {
                throw new Error('Felhő szinkronizációs modul nem érhető el!');
            }
            await app.syncService.cloud.wipeCloudDatabase();

            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 mt-2";
            resultDiv.textContent = `🟢 SIKERES FELHŐ RESET!\nA Supabase felhő adatbázisból minden adat sikeresen törlésre került (mind a 8 tábla kiürítve).`;
            app.hmiNotif.showToast('🟢 Felhő adatbázis sikeresen törölve!', 'success');
        } catch (err) {
            resultDiv.className = "p-3 rounded-lg text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200 mt-2";
            resultDiv.textContent = `🔴 RESET HIBA!\nHiba történt a felhő törlése közben.\n\nRészletek: ${err.message || err}`;
            app.hmiNotif.showToast('🔴 Felhő törlési hiba!', 'error');
        }
    });

    // Értesítés kérése gomb
    const btnReqNotif = document.getElementById('btnRequestNotificationPerm');
    btnReqNotif?.addEventListener('click', async () => {
        try {
            if (!window.app?.pwa?.pushManager) throw new Error("Push Manager nem elérhető");

            const btnOriginalText = btnReqNotif.innerHTML;
            btnReqNotif.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Regisztráció...';
            btnReqNotif.disabled = true;

            await window.app.pwa.pushManager.subscribe();
            updateNotificationPermissionStatus();
            window.app.hmiNotif.showToast('Sikeres feliratkozás a Web Push értesítésekre!', 'success');

            btnReqNotif.innerHTML = btnOriginalText;
            btnReqNotif.disabled = false;
        } catch (err) {
            console.error('[PUSH] Regisztráció hiba:', err);
            window.app?.hmiNotif?.showToast(`Hiba: ${err.message}`, 'error');
            btnReqNotif.disabled = false;
            btnReqNotif.innerHTML = '<i class="fas fa-key"></i> Engedély Kérése';
        }
    });

    // Értesítés teszt
    const btnTestNotif = document.getElementById('btnTriggerTestNotification');
    btnTestNotif?.addEventListener('click', async () => {
        const title = 'Költségnyilvántartó Diagnosztika';
        const body = 'Sikeresen tesztelted az értesítéseket! A határidők emlékeztetői is így fognak megjelenni.';
        const icon = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

        // 1. Mindig futtatjuk a csodás belső szimulált Push Notification-t!
        window.app?.hmiNotif?.showSimulatedPushNotification(title, body);

        // 2. Ha van aktív push subscription, szerveren keresztül teszteljük!
        if (window.app?.pwa?.pushManager?.isSubscribed) {
            try {
                await window.app.pwa.pushManager.triggerPushFromServer({ title, body, icon });
            } catch (e) {
                console.warn('[NOTIF] Szerver oldali push sikertelen:', e);
            }
        } else if ('Notification' in window && Notification.permission === 'granted') {
            // 3. Fallback helyi natív értesítésre
            try {
                new Notification(title, { body, icon });
            } catch (e) {
                console.warn('[NOTIF] Natív értesítés sikertelen:', e);
            }
        }
    });

    // Időzítők
    setInterval(() => {
        if (!panel.classList.contains('hidden')) updateDebugStatus();
    }, 5000);

    setInterval(() => {
        if (!panel.classList.contains('hidden')) updateDebugLogs();
    }, 3000);

    console.log('[DEBUG] Fejlesztői debug panel inicializálva (5x kattintás a verzió feliratra)');
}

async function handleDebugAction(action) {
    const app = window.app;
    if (!app) throw new Error('App nem elérhető!');

    switch(action) {
        case 'loadData':
            await app.generateTestData(30);
            app.hmiNotif?.showToast('30 teszt bejegyzés generálva!', 'success');
            await app.reload();
            break;
        case 'loadReminders':
            await app.generateTestReminders(10);
            app.hmiNotif?.showToast('10 teszt határidő generálva!', 'success');
            await app.reload();
            break;
        case 'refreshAll':
            await app.reload();
            app.hmiNotif?.showToast('Minden adat sikeresen frissítve!', 'success');
            break;
        case 'showData':
            const items = app.items?.items?.length || 0;
            const months = app.months?.months?.length || 0;
            const entries = app.entries?.entries?.length || 0;
            const reminders = app.reminderManager?.reminders?.length || 0;
            const incomings = app.incomingManager?.incomings?.length || 0;
            app.hmiNotif?.showConfirm({
                title: '📊 Adatbázis statisztikák',
                message: `Adatok az IndexedDB-ben:\n\n📦 Kategóriák: ${items} db\n📅 Hónapok: ${months} db\n📝 Bejegyzések: ${entries} db\n⏰ Határidők: ${reminders} db\n📥 Bejövő tételek: ${incomings} db`,
                type: 'info',
                confirmText: 'Rendben',
                showCancel: false
            });
            break;
        case 'clearAll':
            const confirmed = await app.hmiNotif?.showConfirm({
                title: '⚠️ Összes adat törlése?',
                message: 'Biztosan törölni szeretnéd a Költségnyilvántartó összes helyi bejegyzését, kategóriáját és határidejét? Ez a művelet nem vonható vissza!',
                type: 'danger',
                confirmText: 'Igen, mindent törölj',
                cancelText: 'Mégse'
            });
            if (confirmed) {
                await app.clearAllData();
                app.hmiNotif?.showToast('Összes helyi adat törölve!', 'success');
                await app.reload();
            }
            break;
    }
}

function updateDebugStatus() {
    const el = document.getElementById('debugStatus');
    if (!el) return;
    const app = window.app;
    if (!app) {
        el.innerHTML = '❌ App nem található!';
        return;
    }

    const items = app.items?.items?.length || 0;
    const months = app.months?.months?.length || 0;
    const entries = app.entries?.entries?.length || 0;
    const reminders = app.reminderManager?.reminders?.length || 0;
    const incomings = app.incomingManager?.incomings?.length || 0;
    const isOnline = navigator.onLine;

    el.innerHTML = `
        <div class="grid grid-cols-2 gap-2 text-xs">
            <div>📦 Kategóriák: <strong class="text-blue-600">${items} db</strong></div>
            <div>📅 Hónapok: <strong class="text-purple-600">${months} db</strong></div>
            <div>📝 Bejegyzések: <strong class="text-rose-600">${entries} db</strong></div>
            <div>⏰ Határidők: <strong class="text-amber-600">${reminders} db</strong></div>
            <div>📥 Bejövő: <strong class="text-emerald-600">${incomings} db</strong></div>
            <div>📶 Hálózat: <span class="${isOnline ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}">${isOnline ? '🟢 Online (Van net)' : '🔴 Offline (Nincs net)'}</span></div>
            <div class="col-span-2 text-gray-400 text-[10px] mt-1 border-t pt-2 flex justify-between">
                <span>Rendszer verzió: ${app.version?.toString() || 'v5.2.0'}</span>
                <span>Időbélyeg: ${new Date().toLocaleTimeString('hu-HU')}</span>
            </div>
        </div>
    `;
}


// === GOOGLE DRIVE DEBUG ===
function updateGDriveDebugInfo() {
    const container = document.getElementById('debugGDriveContainer');
    if (!container) return;

    const backupService = window.app?.gdriveBackup;
    if (!backupService) {
        container.innerHTML = '<div class="text-rose-500 font-bold p-4 bg-rose-50 rounded-xl text-xs">Google Drive modul nem elérhető.</div>';
        return;
    }

    const status = backupService.getStatus();

    let html = '<div class="bg-gray-50 p-4 rounded-xl space-y-3">';

    html += '<div class="grid grid-cols-2 gap-y-2 text-[10px] sm:text-xs font-mono">';
    html += '<div>Konfigurálva (ID):</div>';
    html += `<div class="font-bold ${status.isConfigured ? 'text-emerald-600' : 'text-amber-500 text-right'}">${status.isConfigured ? 'Igen' : 'Nem'}</div>`;
    html += '<div>Hitelesítve:</div>';
    html += `<div class="font-bold ${status.isAuthorized ? 'text-emerald-600' : 'text-amber-500 text-right'}">${status.isAuthorized ? 'Igen' : 'Nem'}</div>`;
    if (status.tokenExpiry) {
        html += '<div>Token lejár:</div>';
        html += `<div class="text-gray-600 text-right">${status.tokenExpiry}</div>`;
    }
    if (status.folderId) {
        html += '<div>Mappa azonosító:</div>';
        html += `<div class="text-gray-600 truncate text-right">${status.folderId}</div>`;
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
        resDiv.innerHTML = 'Diagnosztika indítása...\n';

        try {
            const results = await backupService.runDiagnostic();

            let logHtml = `Eredmény: <strong class="${results.overallSuccess ? 'text-green-500' : 'text-red-500'}">${results.overallSuccess ? 'SIKERES' : 'HIBÁS'}</strong>\n\n`;

            results.steps.forEach(step => {
                const icon = step.success ? '✅' : '❌';
                logHtml += `${icon} ${step.name}\n`;
                if (step.detail) logHtml += `   > ${step.detail}\n`;
            });

            resDiv.innerHTML = logHtml;
            if (!results.overallSuccess) {
                resDiv.classList.replace('text-green-400', 'text-amber-400');
            }
        } catch (e) {
            resDiv.innerHTML += `\nKivétel történt: ${e.message}`;
            resDiv.classList.replace('text-green-400', 'text-red-400');
        } finally {
            btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Átfogó Diagnosztika Futtatása';
            btn.disabled = false;
        }
    });
}

function updateSupabaseDebugInfo() {
    const app = window.app;
    if (!app) return;

    const config = app.config;
    const url = config?.supabaseConfig?.url;
    const key = config?.supabaseConfig?.key;
    const hasSupa = config?.useSupabase === true;

    const urlSpan = document.getElementById('debugSupaUrlStatus');
    const keySpan = document.getElementById('debugSupaKeyStatus');

    if (urlSpan) {
        if (url) {
            urlSpan.className = "text-emerald-600 font-bold";
            urlSpan.textContent = "Kitöltve";
        } else {
            urlSpan.className = "text-amber-500 font-bold";
            urlSpan.textContent = "Nincs megadva";
        }
    }

    if (keySpan) {
        if (key) {
            keySpan.className = "text-emerald-600 font-bold";
            keySpan.textContent = "Kitöltve";
        } else {
            keySpan.className = "text-amber-500 font-bold";
            keySpan.textContent = "Nincs megadva";
        }
    }
}

function updateNotificationPermissionStatus() {
    const permSpan = document.getElementById('debugNotificationPermission');
    if (!permSpan) return;

    if (!('Notification' in window)) {
        permSpan.className = "text-rose-600 font-black uppercase";
        permSpan.textContent = "NEM TÁMOGATOTT";
        return;
    }

    const perm = Notification.permission;
    if (perm === 'granted') {
        permSpan.className = "text-emerald-600 font-black uppercase";
        permSpan.textContent = "ENGEDÉLYEZVE";
    } else if (perm === 'denied') {
        permSpan.className = "text-rose-600 font-black uppercase";
        permSpan.textContent = "ELUTASÍTVA";
    } else {
        permSpan.className = "text-amber-500 font-black uppercase";
        permSpan.textContent = "ALAPÉRTELMEZETT";
    }
}

function updateDebugLogs() {
    const el = document.getElementById('debugLogs');
    if (!el) return;
    try {
        const logs = localStorage.getItem('debug_logs');
        el.textContent = logs ? JSON.parse(logs).slice(-50).join('\n') : 'Nincs mentett log';
    } catch(e) {
        el.textContent = 'Hiba a logok betöltésekor';
    }
}

function getSupabaseSQLScript() {
    return `-- Költségnyilvántartó v4.1 - Teljes Supabase SQL Táblaséma
-- Futtasd le ezt a szkriptet a Supabase SQL Editor-jában!

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ITEMS (Kategóriák)
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON items;
CREATE POLICY "Mindenki elérheti" ON items FOR ALL USING (true) WITH CHECK (true);

-- 2. MONTHS (Aktív Hónapok)
CREATE TABLE IF NOT EXISTS months (
    month TEXT PRIMARY KEY,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON months;
CREATE POLICY "Mindenki elérheti" ON months FOR ALL USING (true) WITH CHECK (true);

-- 3. ENTRIES (Bejegyzések / Rész-tételek)
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    "cellKey" TEXT NOT NULL,
    "itemId" TEXT,
    month TEXT,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'HUF',
    "paymentMethod" TEXT DEFAULT 'Kártya',
    note TEXT,
    color TEXT,
    "isStorno" BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON entries;
CREATE POLICY "Mindenki elérheti" ON entries FOR ALL USING (true) WITH CHECK (true);

-- 4. TEMPLATES (Sablonok)
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount NUMERIC,
    currency TEXT DEFAULT 'HUF',
    comment TEXT,
    category TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON templates;
CREATE POLICY "Mindenki elérheti" ON templates FOR ALL USING (true) WITH CHECK (true);

-- 5. REMINDERS (Határidők)
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'HUF',
    due_date TEXT NOT NULL,
    frequency TEXT DEFAULT 'once',
    completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON reminders;
CREATE POLICY "Mindenki elérheti" ON reminders FOR ALL USING (true) WITH CHECK (true);

-- 6. INCOMINGS (Bejövő utalások)
CREATE TABLE IF NOT EXISTS incomings (
    id TEXT PRIMARY KEY,
    sender TEXT NOT NULL,
    date TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    comment TEXT,
    "isStorno" BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incomings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON incomings;
CREATE POLICY "Mindenki elérheti" ON incomings FOR ALL USING (true) WITH CHECK (true);

-- 7. INCOMING_SENDERS (Bejövő küldők)
CREATE TABLE IF NOT EXISTS incoming_senders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incoming_senders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON incoming_senders;
CREATE POLICY "Mindenki elérheti" ON incoming_senders FOR ALL USING (true) WITH CHECK (true);

-- 8. DELETED_RECORDS (Törölt rekordok követése - Tombstone)
CREATE TABLE IF NOT EXISTS deleted_records (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deleted_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON deleted_records;
CREATE POLICY "Mindenki elérheti" ON deleted_records FOR ALL USING (true) WITH CHECK (true);

-- 9. WORKS (Munka nyilvántartás)
CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    date TEXT NOT NULL,
    duration NUMERIC DEFAULT 1,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON works;
CREATE POLICY "Mindenki elérheti" ON works FOR ALL USING (true) WITH CHECK (true);

-- 10. APP_SETTINGS (Beállítások)
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    settings_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON app_settings;
CREATE POLICY "Mindenki elérheti" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- 11. PLUGIN_FUEL_LOGS (Tankolási napló modul)
CREATE TABLE IF NOT EXISTS plugin_fuel_logs (
    id TEXT PRIMARY KEY,
    odo NUMERIC NOT NULL,
    liters NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    totalCost NUMERIC NOT NULL,
    "paymentMethod" TEXT DEFAULT 'Kártya',
    station TEXT,
    note TEXT,
    date TEXT,
    timestamp BIGINT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE plugin_fuel_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON plugin_fuel_logs;
CREATE POLICY "Mindenki elérheti" ON plugin_fuel_logs FOR ALL USING (true) WITH CHECK (true);

-- 12. CASCADE DELETE TRIGGER FOR ENTRIES
CREATE OR REPLACE FUNCTION delete_item_cascade()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM entries WHERE "cellKey" LIKE OLD.id || '\\_%' OR "cellKey" LIKE '%\\_' || OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delete_item_cascade ON items;
CREATE TRIGGER trigger_delete_item_cascade
AFTER DELETE ON items
FOR EACH ROW
EXECUTE FUNCTION delete_item_cascade();`;
}
