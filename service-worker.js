// service-worker.js - Költség Nyilvántartó v4.0 Dinamikus verzió
const CACHE_VERSION = 'v4';
const BUILD_DATE = '2026-06-24';

// VAGY: betöltés a version.json-ból (de SW nem tud async)
// Ezért a cache nevet a verzióból generáljuk:
const CACHE_NAME = `kny-${CACHE_VERSION}-cache`;
const OFFLINE_PAGE = 'offline.html';

// Offline oldal tartalma (beépítve, hogy ne kelljen külön fájl)
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="hu">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline - Költség Nyilvántartó</title>
    <style>
        body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f3f4f6; }
        .card { background: white; padding: 2rem; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { color: #1e293b; margin-bottom: 0.5rem; }
        p { color: #64748b; margin-bottom: 1.5rem; }
        .retry-btn { background: #3b82f6; color: white; border: none; padding: 0.75rem 2rem; border-radius: 12px; font-size: 1rem; cursor: pointer; }
        .retry-btn:hover { background: #2563eb; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">📡</div>
        <h1>Nincs internetkapcsolat</h1>
        <p>Az alkalmazás offline módban van. Kérlek, csatlakozz az internethez a friss adatok eléréséhez.</p>
        <button class="retry-btn" onclick="location.reload()">Újrapróbálkozás</button>
    </div>
</body>
<footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-600 flex items-center justify-between z-40">
    <div class="flex items-center gap-2">
        <span id="saveLed" class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm transition-all duration-300"></span>
        <span id="saveStatusText" class="font-mono uppercase tracking-wider text-[10px] text-gray-500">Rendszer Online</span>
    </div>
    <div class="font-mono text-[10px] text-gray-400 flex items-center gap-2">
        <span id="lastSaveTime">Soha</span>
        <span class="text-gray-300">|</span>
        <span id="versionDisplay" class="version-text cursor-pointer hover:text-blue-600 transition" onclick="window.app?.checkVersion?.()">v4.0.0</span>
    </div>
    <div class="text-gray-400">Költségnyilvántartó</div>
</footer>
</html>`;

// Cache-elendő fájlok
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './manifest.json',
    './favicon.ico',
    './icons/icon-48.png',
    './icons/icon-72.png',
    './icons/icon-96.png',
    './icons/icon-128.png',
    './icons/icon-144.png',
    './icons/icon-192.png',
    './icons/icon-192-maskable.png',
    './icons/icon-256.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './icons/icon.svg'
];

// JS modulok (az összes fontos fájl)
const JS_MODULES = [
    './js/app.js',
    './js/oop-core.js',
    './js/sync-service.js',
    './js/sync-manager.js',
    './js/storage-manager.js',
    './js/boot-manager.js',
    './js/backup-manager.js',
    './js/pwa-manager.js',
    './js/remote-config-manager.js',
    './js/offline-handler.js',
    './js/ui-modal-controller.js',
    './js/ui-renderer.js',
    './js/ui-controller.js',
    './js/data-operation-controller.js',
    './js/cell-modal-controller.js',
    './js/input-modal-controller.js',
    './js/oop-charts.js',
    './js/oop-reminders.js'
];

// Külső CDN-ek (opcionális cache)
const CDN_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js'
];

// Összesített cache lista
const ALL_ASSETS = [
    ...ASSETS_TO_CACHE,
    ...JS_MODULES
];

// Install esemény
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cache építése...');
                // Offline oldal hozzáadása
                cache.put(OFFLINE_PAGE, new Response(OFFLINE_HTML, {
                    headers: { 'Content-Type': 'text/html' }
                }));
                return cache.addAll(ALL_ASSETS);
            })
            .then(() => {
                console.log('[SW] Cache kész!');
                return self.skipWaiting();
            })
            .catch(err => {
                console.warn('[SW] Cache hiba:', err);
            })
    );
});

// Activate esemény – régi cache-ek törlése
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME)
                        .map(key => {
                            console.log('[SW] Régi cache törlése:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Aktiválva, régi cache-ek törölve');
                return self.clients.claim();
            })
    );
});

// Fetch esemény – offline támogatás
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // CDN kérések kihagyása a cache-ből (gyorsabb, mint cache-elni)
    if (url.hostname.includes('cdn') || url.hostname.includes('cloudflare')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Supabase API kérések kihagyása
    if (url.hostname.includes('supabase.co')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // HTML oldalak esetén: cache + network stratégia
    if (event.request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            caches.match(event.request)
                .then(cached => {
                    if (cached) {
                        // Háttérben frissítjük a cache-t
                        fetch(event.request)
                            .then(response => {
                                if (response.ok) {
                                    caches.open(CACHE_NAME)
                                        .then(cache => cache.put(event.request, response));
                                }
                            })
                            .catch(() => {});
                        return cached;
                    }
                    return fetch(event.request)
                        .then(response => {
                            if (response.ok) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, clone));
                            }
                            return response;
                        })
                        .catch(() => {
                            return caches.match(OFFLINE_PAGE);
                        });
                })
        );
        return;
    }

    // Egyéb fájlok: cache-first stratégia
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;
                
                return fetch(event.request)
                    .then(response => {
                        if (response && response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    try {
                                        cache.put(event.request, clone);
                                    } catch (e) {}
                                });
                        }
                        return response;
                    })
                    .catch(() => {
                        // Ha a kérés kép vagy más média, visszaadhatunk egy placeholder-t
                        if (event.request.url.match(/\.(png|jpg|jpeg|svg|gif|webp)$/)) {
                            return caches.match('./icons/icon-192.png');
                        }
                        return new Response('Hálózati hiba', { status: 404 });
                    });
            })
    );
});

// Üzenetek kezelése a fő alkalmazástól
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    // Cache frissítés kérése
    if (event.data === 'refreshCache') {
        caches.open(CACHE_NAME)
            .then(cache => {
                ALL_ASSETS.forEach(url => {
                    fetch(url, { cache: 'reload' })
                        .then(response => {
                            if (response.ok) {
                                cache.put(url, response);
                            }
                        })
                        .catch(() => {});
                });
            });
    }
});