// service-worker.js - Workbox-alapú verzió
// Költség Nyilvántartó v4.0

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

const CACHE_VERSION = 'v4';
const BUILD_DATE = '2026-06-28';
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
                handlerDidError: async () => {
                    // Ha nincs hálózat, az offline.html-t adjuk vissza
                    const cache = await caches.open(CACHE_NAME);
                    const offlineResponse = await cache.match('/offline.html');
                    if (offlineResponse) {
                        return offlineResponse;
                    }
                    // Fallback: beépített offline HTML
                    return new Response(OFFLINE_FALLBACK, {
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
        url.pathname === '/favicon.ico',
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

// ===== INSTALL: offline.html cache-elése =====
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll([
                    '/',
                    '/index.html',
                    '/offline.html',   // ← EZ FONTOS!
                    '/manifest.json',
                    '/favicon.ico'
                ]).catch(err => {
                    console.warn('[SW] Néhány fájl nem cache-elhető:', err);
                });
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
        event.ports[0].postMessage({
            version: CACHE_VERSION,
            buildDate: BUILD_DATE,
            cacheName: CACHE_NAME
        });
    }
});

console.log('[SW] Workbox Service Worker betöltve!');
console.log(`[SW] Verzió: ${CACHE_VERSION}, Építve: ${BUILD_DATE}`);