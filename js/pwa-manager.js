// js/pwa-manager.js
//PWA és Service Worker
export class PwaManager {
    constructor(app) {
        this.app = app;
        this.deferredInstallPrompt = null;
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Service Worker nem támogatott');
            return;
        }
        
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                console.log('[PWA] Service Worker regisztrálva:', reg.scope);
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