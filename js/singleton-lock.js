// js/singleton-lock.js
export class SingletonLock {
    constructor(app) {
        this.app = app;
        this.channel = null;
        this.isMaster = false;
        this.lockKey = 'koltseg-nyilvantarto-master';
    }

    async init() {
        if (!('BroadcastChannel' in window)) {
            console.warn('[LOCK] BroadcastChannel nem támogatott ebben a böngészőben.');
            return true; // folytatjuk fallback-ként
        }

        this.channel = new BroadcastChannel(this.lockKey);

        // Üzenetek figyelése
        this.channel.onmessage = (event) => {
            if (event.data.type === 'MASTER_CLAIM') {
                if (!this.isMaster) {
                    this._handleAnotherInstance();
                }
            } else if (event.data.type === 'MASTER_PING') {
                // Válaszolunk, hogy élünk
                if (this.isMaster) {
                    this.channel.postMessage({ type: 'MASTER_PONG' });
                }
            }
        };

        // Próbáljuk megszerezni a lock-ot
        const success = await this._tryAcquireLock();
        
        if (success) {
            this._startHeartbeat();
        }

        return success;
    }

    async _tryAcquireLock() {
        // Küldünk claim requestet
        this.channel.postMessage({ type: 'MASTER_CLAIM' });

        // Várunk egy kicsit, hátha van válasz
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.isMaster = true;
                console.log('[LOCK] ✅ Ez az ablak lett a Master');
                resolve(true);
            }, 180);

            // Ha valaki válaszol, akkor már van master
            const handler = (e) => {
                if (e.data.type === 'MASTER_PONG') {
                    clearTimeout(timeout);
                    this.isMaster = false;
                    console.log('[LOCK] ❌ Már fut egy másik példány');
                    resolve(false);
                }
            };

            this.channel.addEventListener('message', handler, { once: true });
        });
    }

    _startHeartbeat() {
        setInterval(() => {
            if (this.isMaster && this.channel) {
                this.channel.postMessage({ type: 'MASTER_PING' });
            }
        }, 8000);
    }

    _handleAnotherInstance() {
        this.app.hmiNotif?.showCritical(
            '⚠️ Az alkalmazás már fut!',
            'Az alkalmazás már nyitva van egy másik böngészőablakban vagy fülön.\n\n' +
            'Két párhuzamos példány használata adatvesztéshez vagy szinkronizációs hibákhoz vezethet.\n\n' +
            'Kérjük, zárja be ezt az ablakot és használja csak az aktív példányt.'
        ).then(() => {
            // Opcionális: redirect vagy disable
            document.body.innerHTML = `
                <div class="flex items-center justify-center min-h-screen bg-gray-50">
                    <div class="text-center max-w-md p-8">
                        <div class="text-6xl mb-6">🚫</div>
                        <h1 class="text-2xl font-bold mb-4">Alkalmazás már fut máshol</h1>
                        <p class="text-gray-600">Zárja be ezt az ablakot.</p>
                    </div>
                </div>`;
        });
    }

    destroy() {
        if (this.channel) {
            this.channel.postMessage({ type: 'MASTER_RELEASE' });
            this.channel.close();
        }
    }
}