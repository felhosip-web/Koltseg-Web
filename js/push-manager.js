// js/push-manager.js - Web Push API háttérértesítés kezelő
// VAPID-alapú push subscription + szerver kommunikáció

export class PushNotificationManager {
    constructor(app) {
        this.app = app;
        this.subscription = null;
        this.isSubscribed = false;
        this.swRegistration = null;
    }

    // ================================================================
    // === INICIALIZÁCIÓ ===
    // ================================================================

    /**
     * Push rendszer inicializálása a Service Worker regisztrációval
     * @param {ServiceWorkerRegistration} swRegistration
     */
    async init(swRegistration) {
        if (!swRegistration) {
            console.warn('[PUSH] Nincs ServiceWorker regisztráció');
            return;
        }

        this.swRegistration = swRegistration;

        // Meglévő subscription ellenőrzése
        try {
            const existingSubscription = await swRegistration.pushManager.getSubscription();
            if (existingSubscription) {
                this.subscription = existingSubscription;
                this.isSubscribed = true;
                console.log('[PUSH] ✅ Meglévő push subscription aktív');
            }
        } catch (e) {
            console.warn('[PUSH] Subscription ellenőrzés hiba:', e);
        }
    }

    // ================================================================
    // === ENGEDÉLYKEZELÉS ===
    // ================================================================

    /**
     * Notification engedély kérése
     * @returns {Promise<string>} 'granted' | 'denied' | 'default'
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('[PUSH] A böngésző nem támogatja az értesítéseket');
            return 'denied';
        }

        const permission = await Notification.requestPermission();
        console.log(`[PUSH] Értesítés engedély: ${permission}`);
        return permission;
    }

    /**
     * Aktuális engedélyszint
     */
    getPermissionStatus() {
        if (!('Notification' in window)) return 'not-supported';
        return Notification.permission;
    }

    // ================================================================
    // === SUBSCRIPTION KEZELÉS ===
    // ================================================================

    /**
     * Feliratkozás push értesítésekre
     * @returns {Promise<PushSubscription|null>}
     */
    async subscribe() {
        if (!this.swRegistration) {
            throw new Error('ServiceWorker regisztráció szükséges!');
        }

        // Először kérjünk engedélyt
        const permission = await this.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Az értesítési engedély megtagadva.');
        }

        try {
            // VAPID public key lekérése a szerverről
            const vapidPublicKey = await this._getVapidPublicKey();
            if (!vapidPublicKey) {
                throw new Error('VAPID public key nem elérhető a szerverről');
            }

            const applicationServerKey = this._urlBase64ToUint8Array(vapidPublicKey);

            this.subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

            this.isSubscribed = true;
            console.log('[PUSH] ✅ Feliratkozás sikeres');

            // Subscription küldése a szerverre
            await this._sendSubscriptionToServer(this.subscription);

            return this.subscription;
        } catch (err) {
            console.error('[PUSH] Feliratkozás hiba:', err);
            this.isSubscribed = false;
            throw err;
        }
    }

    /**
     * Leiratkozás push értesítésekről
     */
    async unsubscribe() {
        if (!this.subscription) {
            console.log('[PUSH] Nincs aktív subscription');
            return;
        }

        try {
            await this.subscription.unsubscribe();
            
            // Szerver értesítése a leiratkozásról
            try {
                await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: this.subscription.endpoint })
                });
            } catch (e) {
                console.warn('[PUSH] Szerver leiratkozás hiba:', e);
            }

            this.subscription = null;
            this.isSubscribed = false;
            console.log('[PUSH] ✅ Leiratkozás sikeres');
        } catch (err) {
            console.error('[PUSH] Leiratkozás hiba:', err);
            throw err;
        }
    }

    // ================================================================
    // === SZERVER KOMMUNIKÁCIÓ ===
    // ================================================================

    /**
     * VAPID public key lekérése a szerverről
     */
    async _getVapidPublicKey() {
        try {
            const response = await fetch('/api/push/vapid-public');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.publicKey;
        } catch (err) {
            console.warn('[PUSH] VAPID public key lekérés hiba:', err);
            return null;
        }
    }

    /**
     * Subscription küldése a szerverre
     */
    async _sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription.toJSON())
            });

            if (!response.ok) {
                throw new Error(`Szerver válasz: ${response.status}`);
            }

            console.log('[PUSH] ✅ Subscription elküldve a szerverre');
        } catch (err) {
            console.warn('[PUSH] Subscription küldés hiba:', err);
        }
    }

    /**
     * Push értesítés küldésének kérése a szerveren keresztül (pl. lejárt emlékeztetők)
     * @param {Object} payload - { title, body, icon, data, actions }
     */
    async triggerPushFromServer(payload) {
        try {
            const response = await fetch('/api/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Szerver válasz: ${response.status}`);
            }

            console.log('[PUSH] ✅ Push trigger elküldve');
        } catch (err) {
            console.warn('[PUSH] Push trigger hiba:', err);
        }
    }

    // ================================================================
    // === HELYI ÉRTESÍTÉS (foreground) ===
    // ================================================================

    /**
     * Helyi notification megjelenítése (ServiceWorker-en keresztül)
     * @param {string} title
     * @param {Object} options
     */
    async showLocalNotification(title, options = {}) {
        if (!this.swRegistration) return;
        if (Notification.permission !== 'granted') return;

        const defaultOptions = {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-96.png',
            vibrate: [200, 100, 200],
            tag: 'koltseg-local',
            requireInteraction: false,
            ...options
        };

        await this.swRegistration.showNotification(title, defaultOptions);
    }

    // ================================================================
    // === SEGÉDFÜGGVÉNYEK ===
    // ================================================================

    /**
     * URL-safe Base64 → Uint8Array konverzió (VAPID key-hez)
     */
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    /**
     * Állapot lekérdezés
     */
    getStatus() {
        return {
            supported: 'PushManager' in window,
            permission: this.getPermissionStatus(),
            isSubscribed: this.isSubscribed,
            endpoint: this.subscription?.endpoint ? `${this.subscription.endpoint.substring(0, 60)}...` : null,
            hasSwRegistration: !!this.swRegistration
        };
    }

    /**
     * Teszt értesítés küldése
     */
    async sendTestNotification() {
        await this.showLocalNotification('🔔 Teszt értesítés', {
            body: 'A push értesítések működnek!',
            tag: 'koltseg-test',
            data: { action: 'test' }
        });
    }
}
