// js/pwa-manager.js
//PWA és Service Worker
import { PushNotificationManager } from './push-manager.js';
import { showUpdateBanner } from './components/update-banner.js';

export class PwaManager {
    constructor(app) {
        this.app = app;
        this.deferredInstallPrompt = null;
        this.pushManager = new PushNotificationManager(app);

        this.setupAutoUpdateCheck();
    }

    setupAutoUpdateCheck() {
        // Ellenőrzés induláskor (kis késleltetéssel, hogy ne terhelje a boot-ot)
        setTimeout(() => this.checkAppVersion(), 5000);

        // Ellenőrzés 5 percenként
        setInterval(() => this.checkAppVersion(), 5 * 60 * 1000);

        // Ellenőrzés, ha az app újra fókuszba kerül
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkAppVersion();
            }
        });
        window.addEventListener('focus', () => this.checkAppVersion());
    }

    async checkAppVersion() {
        try {
            const basePath = window.location.pathname.includes('/Koltseg-Web') ? '/Koltseg-Web' : '';
            const response = await fetch(`${basePath}/version.json?t=` + Date.now(), {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            const fetchedVersion = data.version;

            let currentVersion = localStorage.getItem('app_version');

            if (!currentVersion) {
                // Ha még nincs elmentve, mentsük el a mostanit (pl. első betöltésnél ne jelezzen rögtön)
                // Kivéve ha a window.app-ban már be van töltve (fallback)
                currentVersion = this.app?.versionManager?.version || fetchedVersion;
                localStorage.setItem('app_version', currentVersion);
            }

            if (fetchedVersion && currentVersion && fetchedVersion !== currentVersion) {
                console.log(`[PWA] Új verzió észlelve: ${currentVersion} -> ${fetchedVersion}`);
                showUpdateBanner(fetchedVersion);
            }

        } catch (error) {
            console.warn('[PWA] Auto-update ellenőrzés hiba:', error);
        }
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Service Worker nem támogatott');
            return;
        }

        // Üzenetfogadás a SW-től
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'VERSION_INFO') {
                console.log(`[PWA] Kiszolgáló aktív verziója: ${event.data.version} (Kiadva: ${event.data.buildDate})`);
            }
        });

        navigator.serviceWorker.register('./service-worker.js')
            .then(async reg => {
                console.log('[PWA] Service Worker regisztrálva:', reg.scope);

                // Verzió lekérése a SW-től
                try {
                    if (reg.active) reg.active.postMessage('getVersion');
                } catch (e) {
                    console.warn('[PWA] Verzió lekérése sikertelen:', e);
                }

                // Push Manager inicializálása
                try {
                    await this.pushManager.init(reg);
                    console.log('[PWA] Push Manager inicializálva');
                } catch (e) {
                    console.warn('[PWA] Push Manager init hiba:', e);
                }

                // Update handling: ha új worker települ, meghívjuk a fallback notificationt ha kell,
                // de az aktív verzió ellenőrzés (checkAppVersion) már kezeli a PWA banner-t
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.checkAppVersion(); // Biztosra megyünk
                        }
                    });
                });
            })
            .catch(err => {
                console.warn('[PWA] Service Worker regisztráció sikertelen:', err);
            });
    }

    bindInstallPrompt() {
        const installButton = document.getElementById('btnInstallApp');
        
        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            this.deferredInstallPrompt = event;
            installButton?.classList.remove('hidden');
        });

        window.addEventListener('appinstalled', () => {
            installButton?.classList.add('hidden');
            this.deferredInstallPrompt = null;
            this.app.hmiNotif.showToast('Az alkalmazás telepítése sikeres!', 'success');
        });

        installButton?.addEventListener('click', async () => {
            if (!this.deferredInstallPrompt) return;
            
            this.deferredInstallPrompt.prompt();
            const choiceResult = await this.deferredInstallPrompt.userChoice;
            
            if (choiceResult.outcome === 'accepted') {
                this.app.hmiNotif.showToast('Telepítés elfogadva!', 'success');
            } else {
                this.app.hmiNotif.showToast('Telepítés elutasítva.', 'info');
            }
            
            this.deferredInstallPrompt = null;
            installButton.classList.add('hidden');
        });
    }

    async checkForUpdate() {
        if (!('serviceWorker' in navigator)) return false;
        
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) return false;
            
            await registration.update();
            return true;
        } catch (e) {
            console.warn('[PWA] Frissítés ellenőrzés sikertelen:', e);
            return false;
        }
    }
}