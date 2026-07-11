// js/local-storage-sandbox.js
// Elszigeteli a LocalStorage-ot ha az alkalmazás nem a gyökérben fut (pl. GitHub Pages vagy más megosztott origin)

(function() {
    // Különleges védelem: ha a localStorage nem érhető el (pl. blokkolt cookie-k, beágyazott iframe, biztonsági korlátozások),
    // akkor létrehozunk egy memóriabeli helyettesítőt, hogy az alkalmazás ne fagyjon le és ne dobjon SecurityError-t.
    let storageAvailable = false;
    try {
        if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
            // Egy egyszerű írás/olvasás teszt
            const testKey = '__storage_test__';
            window.localStorage.setItem(testKey, testKey);
            window.localStorage.removeItem(testKey);
            storageAvailable = true;
        }
    } catch (e) {
        console.warn('[SANDBOX] A böngésző blokkolja vagy nem támogatja a valódi LocalStorage-ot. Memóriabeli fallback aktiválása:', e);
    }

    if (!storageAvailable && typeof window !== 'undefined') {
        try {
            let storageMock = {};
            const mock = {
                getItem: function(key) {
                    return key in storageMock ? storageMock[key] : null;
                },
                setItem: function(key, value) {
                    storageMock[key] = String(value);
                },
                removeItem: function(key) {
                    delete storageMock[key];
                },
                clear: function() {
                    storageMock = {};
                },
                key: function(index) {
                    const keys = Object.keys(storageMock);
                    return keys[index] || null;
                },
                get length() {
                    return Object.keys(storageMock).length;
                }
            };
            Object.defineProperty(window, 'localStorage', {
                value: mock,
                writable: true,
                configurable: true
            });
            console.log('[SANDBOX] ✅ Memóriabeli LocalStorage fallback sikeresen beállítva.');
        } catch (err) {
            console.error('[SANDBOX] Nem sikerült létrehozni a memóriabeli LocalStorage-ot:', err);
        }
    }

    try {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

        const path = window.location.pathname;
        const cleanPath = path.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // Csak akkor aktiváljuk, ha valódi alútvonalon/mappában vagyunk (pl. /repository-name/)
        if (!cleanPath || cleanPath === 'index.html' || cleanPath === 'src') {
            return; 
        }

        const prefix = `kny_${cleanPath}_`;
        console.log(`[SANDBOX] 🛡️ GitHub Pages / alútvonal észlelve (${path}). LocalStorage elszigetelés bekapcsolva. Előtag: ${prefix}`);

        const originalGetItem = localStorage.getItem;
        const originalSetItem = localStorage.setItem;
        const originalRemoveItem = localStorage.removeItem;
        const originalKey = localStorage.key;
        const originalClear = localStorage.clear;

        // Szabványos módszer a localStorage valódi hosszának lekérésére a prototype segítségével
        const getOriginalLength = () => {
            try {
                const desc = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
                if (desc && desc.get) {
                    return desc.get.call(localStorage);
                }
            } catch (e) {}
            // Fallback, ha a fenti nem támogatott
            let count = 0;
            try {
                while (originalKey.call(localStorage, count) !== null) {
                    count++;
                }
            } catch (err) {}
            return count;
        };

        // Migráció: Ha léteznek régi, nem elszigetelt kulcsok, másoljuk át őket az elszigetelt kulcsok alá,
        // így a felhasználó nem veszít adatot frissítés után.
        const migrationDoneKey = `${prefix}_migration_done`;
        if (!originalGetItem.call(localStorage, migrationDoneKey)) {
            const keysToMigrate = [
                'default_eur_rate', 'supabase_use', 'supabase_url', 'supabase_key',
                'live_eur_rate', 'hmi_pendingChanges', 'hmi_event_logs', 'hmi_syncQueue',
                'offlineMode', 'googleUser', 'last_eur_rate', 'debug_logs', 'backgroundTaskSettings'
            ];
            
            for (const k of keysToMigrate) {
                const oldVal = originalGetItem.call(localStorage, k);
                const oldHmiVal = originalGetItem.call(localStorage, `hmi_${k}`);
                if (oldVal !== null) {
                    originalSetItem.call(localStorage, `${prefix}${k}`, oldVal);
                }
                if (oldHmiVal !== null) {
                    originalSetItem.call(localStorage, `${prefix}hmi_${k}`, oldHmiVal);
                }
            }

            // Minden hmi_ kezdetű egyedi mentést is átmásolunk
            try {
                const len = getOriginalLength();
                for (let i = 0; i < len; i++) {
                    const k = originalKey.call(localStorage, i);
                    if (k && k.startsWith('hmi_') && !k.startsWith(prefix)) {
                        const val = originalGetItem.call(localStorage, k);
                        originalSetItem.call(localStorage, `${prefix}${k}`, val);
                    }
                }
            } catch (err) {
                console.warn('[SANDBOX] Kulcs migráció részben sikertelen:', err);
            }

            originalSetItem.call(localStorage, migrationDoneKey, 'true');
            console.log('[SANDBOX] ✅ Korábbi adatok sikeresen átmigrálva az elszigetelt tárhelybe.');
        }

        // Interceptáló függvények a localStorage-on
        localStorage.getItem = function(key) {
            return originalGetItem.call(localStorage, `${prefix}${key}`);
        };

        localStorage.setItem = function(key, value) {
            originalSetItem.call(localStorage, `${prefix}${key}`, value);
        };

        localStorage.removeItem = function(key) {
            originalRemoveItem.call(localStorage, `${prefix}${key}`);
        };

        localStorage.clear = function() {
            // Csak a saját előtagos kulcsokat töröljük, nehogy más projekt adatait töröljük a megosztott origin-en!
            const keysToRemove = [];
            const len = getOriginalLength();
            for (let i = 0; i < len; i++) {
                const k = originalKey.call(localStorage, i);
                if (k && k.startsWith(prefix)) {
                    keysToRemove.push(k);
                }
            }
            for (const k of keysToRemove) {
                originalRemoveItem.call(localStorage, k);
            }
        };

        // length tulajdonság felülbírálása, hogy csak a saját kulcsok számát adja vissza
        try {
            Object.defineProperty(localStorage, 'length', {
                configurable: true,
                get: function() {
                    let count = 0;
                    const len = getOriginalLength();
                    for (let i = 0; i < len; i++) {
                        const k = originalKey.call(localStorage, i);
                        if (k && k.startsWith(prefix)) {
                            count++;
                        }
                    }
                    return count;
                }
            });
        } catch (e) {
            console.warn('[SANDBOX] length property override failed:', e);
        }

        localStorage.key = function(index) {
            const keys = [];
            const len = getOriginalLength();
            for (let i = 0; i < len; i++) {
                const k = originalKey.call(localStorage, i);
                if (k && k.startsWith(prefix)) {
                    keys.push(k.substring(prefix.length));
                }
            }
            return keys[index] || null;
        };

    } catch (e) {
        console.error('[SANDBOX] Nem sikerült elszigetelni a LocalStorage-ot:', e);
    }
})();
