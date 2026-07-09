// service-worker.js - Workbox-alapú verzió
// Költség Nyilvántartó v4.2.0

importScripts(
    'https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js'
);

workbox.setConfig({
    debug: false,
    modulePathPrefix: 'https://storage.googleapis.com/workbox-cdn/releases/7.0.0/'
});

const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate, NetworkFirst, NetworkOnly } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

const CACHE_VERSION = 'v4.2.0';
const BUILD_DATE = '2026-07-07';
const CACHE_NAME = `kny-${CACHE_VERSION}-cache`;

// ===== FALLBACK OFFLINE HTML (beépítve) =====
const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="hu">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Offline</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f3f4f6;text-align:center;}
.card{background:white;padding:2.5rem;border-radius:32px;box-shadow:0 20px 60px rgba(0,0,0,0.1);max-width:400px;}
h1{color:#1e293b;margin-bottom:0.5rem;}
p{color:#64748b;margin-bottom:1.5rem;}
button{background:#3b82f6;color:white;border:none;padding:0.75rem 2rem;border-radius:12px;font-size:1rem;cursor:pointer;}
button:hover{background:#2563eb;}
</style>
</head>
<body>
<div class="card">
    <h1>📡 Nincs kapcsolat</h1>
    <p>Kérlek, csatlakozz az internethez az alkalmazás használatához.</p>
    <button onclick="location.reload()">Újrapróbálkozás</button>
</div>
</body></html>`;

// =============================================
// OFFLINE OLDAL - KÜLÖN FÁJL BETÖLTÉS
// =============================================
// Az offline.html-t külön fájlként kell elérhetővé tenni
// A Service Worker ezt fogja betölteni, ha nincs hálózat

// CDN-ek (CacheFirst)
registerRoute(
    ({url}) => 
        url.origin === 'https://cdn.tailwindcss.com' ||
        url.origin === 'https://cdnjs.cloudflare.com' ||
        url.origin === 'https://cdn.jsdelivr.net' ||
        url.hostname.includes('cdn') ||
        url.hostname.includes('cloudflare'),
    new CacheFirst({
        cacheName: 'cdn-cache',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
            new CacheableResponsePlugin({
                statuses: [0, 200],
            }),
        ]
    })
);

// Saját JS/CSS (StaleWhileRevalidate)
registerRoute(
    ({url}) => 
        url.pathname.startsWith('/js/') ||
        url.pathname.startsWith('/css/') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css'),
    new StaleWhileRevalidate({
        cacheName: 'static-assets',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 60,
                maxAgeSeconds: 7 * 24 * 60 * 60,
            }),
        ]
    })
);

// Képek (CacheFirst)
registerRoute(
    ({request}) => request.destination === 'image',
    new CacheFirst({
        cacheName: 'images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
            new CacheableResponsePlugin({
                statuses: [0, 200],
            }),
        ]
    })
);

// HTML oldalak (NetworkFirst + offline fallback)
registerRoute(
    ({request}) => request.mode === 'navigate',
    new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 20,
                maxAgeSeconds: 7 * 24 * 60 * 60,
            }),
            {
                handlerDidError: async ({ request }) => {
                    try {
                        const url = new URL(request.url);
                        // Ha offline indítást kért a felhasználó, vagy a főoldalt/alapértelmezett útvonalat töltené be,
                        // akkor az index.html-t kell visszaadnunk a gyorsítótárból, hogy betöltődjön az offline-first alkalmazás!
                        if (url.searchParams.get('offline') === 'true' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('/index.html')) {
                            const cache = await caches.open(CACHE_NAME);
                            const cachedIndex = await cache.match('/index.html') || await cache.match('/');
                            if (cachedIndex) {
                                return cachedIndex;
                            }
                        }
                    } catch (e) {
                        console.error('[SW] Hiba az offline navigáció kezelése közben:', e);
                    }

                    // Különben (vagy ha nincs meg az index.html), az offline.html-t adjuk vissza
                    const cache = await caches.open(CACHE_NAME);
                    const offlineResponse = await cache.match('/offline.html');
                    if (offlineResponse) {
                        return offlineResponse;
                    }
                    // Fallback: beépített offline HTML
                    return new Response(FALLBACK_HTML, {
                        headers: { 'Content-Type': 'text/html' }
                    });
                }
            }
        ]
    })
);

// Supabase API (NetworkOnly)
registerRoute(
    ({url}) => url.hostname.includes('supabase.co'),
    new NetworkOnly({
        networkTimeoutSeconds: 5,
    })
);

// Egyéb API-k (NetworkFirst)
registerRoute(
    ({url}) => 
        url.pathname.startsWith('/api/') ||
        url.pathname.includes('/api'),
    new NetworkFirst({
        cacheName: 'api-cache',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 5 * 60,
            }),
        ]
    })
);

// Ikonok és manifest (CacheFirst)
registerRoute(
    ({url}) => 
        url.pathname.includes('/icons/') ||
        url.pathname === '/manifest.json' ||
        url.pathname === '/icons/icon-192.png',
    new CacheFirst({
        cacheName: 'icons',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 30,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
        ]
    })
);

// Font Awesome (CacheFirst)
registerRoute(
    ({url}) => 
        url.hostname.includes('fontawesome.com') ||
        url.pathname.includes('font-awesome'),
    new CacheFirst({
        cacheName: 'font-awesome',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 20,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
        ]
    })
);

// Default (StaleWhileRevalidate)
registerRoute(
    ({request}) => true,
    new StaleWhileRevalidate({
        cacheName: 'default-cache',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60,
            }),
        ]
    })
);

// ===== INSTALL: offline.html és egyéb fájlok cache-elése =====
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                // 1. Lokális alapvető fájlok (ha ezek nem sikerülnek, a SW nem települ, ami helyes)
                const localFiles = [
                    '/',
                    '/index.html',
                    '/offline.html',
                    '/manifest.json',
                    '/css/style.css',
                    '/js/app.js',
                    '/js/oop-core.js',
                    '/js/sync-service.js',
                    '/js/ui-modal-controller.js',
                    '/js/ui-controller.js',
                    '/js/oop-charts.js',
                    '/js/oop-reminders.js',
                    '/js/storage-manager.js',
                    '/js/boot-manager.js',
                    '/js/backup-manager.js',
                    '/js/pwa-manager.js',
                    '/js/remote-config-manager.js',
                    '/js/offline-handler.js',
                    '/js/version-manager.js',
                    '/js/virtual-table-renderer.js',
                    '/js/db-audit.js',
                    '/js/singleton-lock.js',
                    '/js/data-sync-controller.js',
                    '/js/data-export-controller.js',
                    '/js/data-maintenance-controller.js',
                    '/js/service-dev-manager.js',
                    '/js/incoming-renderer.js',
                    '/js/help-data.js',
                    '/js/background-tasks.js',
                    '/js/cell-modal-controller.js',
                    '/js/input-modal-controller.js',
                    '/js/sync-manager.js',
                    '/icons/icon-192.png'
                ];
                
                try {
                    await cache.addAll(localFiles);
                    console.log('[SW] Lokális fájlok sikeresen gyorsítótárazva');
                } catch (err) {
                    console.error('[SW] Kritikus lokális fájlok gyorsítótárazása SIKERTELEN:', err);
                }

                // 2. Külső CDN fájlok (ha ezek közül valamelyik hibás, ne hiúsuljon meg a SW telepítés)
                const cdnFiles = [
                    'https://cdn.tailwindcss.com',
                    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                    'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css',
                    'https://cdn.jsdelivr.net/@supabase/supabase-js@2',
                    'https://cdn.jsdelivr.net/npm/chart.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/webfonts/fa-solid-900.woff2',
                    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/webfonts/fa-regular-400.woff2'
                ];

                for (const url of cdnFiles) {
                    try {
                        await cache.add(url);
                    } catch (err) {
                        console.warn(`[SW] CDN fájl nem cache-elhető telepítéskor: ${url}`, err);
                    }
                }
            })
            .then(() => self.skipWaiting())
    );
});


// Régi cache törlés
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME && !key.startsWith('workbox-'))
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

// Üzenetek kezelése
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data === 'refreshCache') {
        caches.keys()
            .then(keys => {
                keys.forEach(key => {
                    if (key.startsWith('workbox-')) {
                        caches.delete(key);
                    }
                });
            });
    }
    
    if (event.data === 'getVersion') {
        if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
                version: CACHE_VERSION,
                buildDate: BUILD_DATE,
                cacheName: CACHE_NAME
            });
        } else {
            // Ha nem kaptunk külön portot, elküldjük az összes csatlakoztatott kliensnek (ablaknak)
            self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'VERSION_INFO',
                        version: CACHE_VERSION,
                        buildDate: BUILD_DATE,
                        cacheName: CACHE_NAME
                    });
                });
            });
        }
    }
});

console.log('[SW] Workbox Service Worker betöltve!');
console.log(`[SW] Verzió: ${CACHE_VERSION}, Építve: ${BUILD_DATE}`);