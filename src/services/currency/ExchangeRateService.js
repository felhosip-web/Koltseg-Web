// src/services/currency/ExchangeRateService.js
/**
 * Central ExchangeRateService
 *
 * Responsibilities:
 * - Owns exchange-rate state: rate, source, lastAttemptAt, lastSuccessfulFetchAt, status, isStale
 * - Restores last-known-good live rate and timestamp from localStorage on boot
 * - Never replaces a valid live rate with a hardcoded fallback solely because of offline start or API failure
 * - Restores manual fallback rate from localStorage
 * - Validates live API responses (numbers, finite, positive, non-zero)
 * - Persists successful fetches and timestamps
 * - Prevents overlapping fetches and manages AbortController timeouts cleanly
 * - Notifies subscribers on rate or status transitions
 */

export const DEFAULT_FALLBACK_EUR_RATE = 400;
export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export class ExchangeRateService {
    /**
     * @param {Object} [storage] Storage implementation (defaults to localStorage if available)
     * @param {Function} [fetchFn] Fetch function (defaults to globalThis.fetch)
     */
    constructor(storage = null, fetchFn = null) {
        this._storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        this._fetch = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);

        this._subscribers = new Set();
        this._activeFetchPromise = null;
        this._timeoutMs = 3000;

        // Restore saved settings & cached rates
        this._useLiveEur = this._storage ? this._storage.getItem('use_live_eur') !== 'false' : true;

        const savedFallback = this._storage ? parseFloat(this._storage.getItem('default_eur_rate')) : NaN;
        this._manualFallbackRate = Number.isFinite(savedFallback) && savedFallback > 0 ? savedFallback : DEFAULT_FALLBACK_EUR_RATE;

        const savedLive = this._storage ? parseFloat(this._storage.getItem('live_eur_rate')) : NaN;
        const validLive = Number.isFinite(savedLive) && savedLive > 0 ? savedLive : null;

        const savedFetchTime = this._storage ? this._storage.getItem('live_eur_rate_timestamp') : null;
        this._lastSuccessfulFetchAt = savedFetchTime ? new Date(savedFetchTime).toISOString() : null;
        this._lastAttemptAt = null;

        if (this._useLiveEur) {
            if (validLive !== null) {
                this._rate = validLive;
                this._source = 'live_cache';
                this._status = this._isExpired(this._lastSuccessfulFetchAt) ? 'stale' : 'live';
            } else {
                this._rate = this._manualFallbackRate;
                this._source = 'fallback';
                this._status = 'fallback';
            }
        } else {
            this._rate = this._manualFallbackRate;
            this._source = 'manual';
            this._status = 'manual';
        }
    }

    _isExpired(timestamp) {
        if (!timestamp) return true;
        const diff = Date.now() - new Date(timestamp).getTime();
        return diff > STALE_THRESHOLD_MS;
    }

    /**
     * Snapshot of the current state
     */
    getState() {
        return Object.freeze({
            rate: this._rate,
            source: this._source, // 'live' | 'live_cache' | 'fallback' | 'manual'
            status: this._status, // 'live' | 'stale' | 'fallback' | 'manual' | 'error'
            isStale: this._status === 'stale',
            useLiveEur: this._useLiveEur,
            manualFallbackRate: this._manualFallbackRate,
            lastAttemptAt: this._lastAttemptAt,
            lastSuccessfulFetchAt: this._lastSuccessfulFetchAt
        });
    }

    getRate() {
        return this._rate;
    }

    getStatus() {
        return this._status;
    }

    isLiveActive() {
        return this._useLiveEur;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this._subscribers.add(listener);
        return () => this._subscribers.delete(listener);
    }

    _notify() {
        const state = this.getState();
        for (const listener of this._subscribers) {
            try {
                listener(state);
            } catch (err) {
                console.warn('[ExchangeRateService] Listener error:', err);
            }
        }
    }

    /**
     * Set manual rate / fallback rate
     * @param {number} rate
     */
    setManualFallbackRate(rate) {
        const parsed = Number(rate);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('Érvénytelen árfolyam: pozitív számnak kell lennie');
        }
        this._manualFallbackRate = parsed;
        if (this._storage) {
            this._storage.setItem('default_eur_rate', String(parsed));
        }

        if (!this._useLiveEur) {
            this._rate = parsed;
            this._source = 'manual';
            this._status = 'manual';
            this._notify();
        }
    }

    /**
     * Enable or disable live rate usage
     * @param {boolean} enabled
     */
    setUseLiveEur(enabled) {
        this._useLiveEur = Boolean(enabled);
        if (this._storage) {
            this._storage.setItem('use_live_eur', this._useLiveEur ? 'true' : 'false');
        }

        if (!this._useLiveEur) {
            this._rate = this._manualFallbackRate;
            this._source = 'manual';
            this._status = 'manual';
            this._notify();
        } else {
            const savedLive = this._storage ? parseFloat(this._storage.getItem('live_eur_rate')) : NaN;
            if (Number.isFinite(savedLive) && savedLive > 0) {
                this._rate = savedLive;
                this._source = 'live_cache';
                this._status = this._isExpired(this._lastSuccessfulFetchAt) ? 'stale' : 'live';
            } else {
                this._rate = this._manualFallbackRate;
                this._source = 'fallback';
                this._status = 'fallback';
            }
            this._notify();
        }
    }

    /**
     * Fetch live rate from remote API
     * Handles network timeouts and failures without wiping last-known-good live rate
     */
    async fetchLiveRate() {
        if (!this._useLiveEur) {
            this._rate = this._manualFallbackRate;
            this._source = 'manual';
            this._status = 'manual';
            this._notify();
            return this.getState();
        }

        if (this._activeFetchPromise) {
            return this._activeFetchPromise;
        }

        this._lastAttemptAt = new Date().toISOString();

        this._activeFetchPromise = (async () => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            let timeoutId = null;

            if (controller) {
                timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);
            }

            try {
                if (!this._fetch) {
                    throw new Error('Fetch API nem elérhető');
                }

                const response = await this._fetch('https://open.er-api.com/v6/latest/EUR', {
                    signal: controller?.signal
                });

                if (!response.ok) {
                    throw new Error(`HTTP hiba: ${response.status}`);
                }

                const data = await response.json();
                const rawHuf = data?.rates?.HUF;
                const parsedRate = typeof rawHuf === 'number' ? rawHuf : parseFloat(rawHuf);

                if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
                    throw new Error('Érvénytelen vagy hiányzó HUF árfolyam a szerver válaszban');
                }

                // Success
                this._rate = parsedRate;
                this._source = 'live';
                this._status = 'live';
                this._lastSuccessfulFetchAt = new Date().toISOString();

                if (this._storage) {
                    this._storage.setItem('live_eur_rate', parsedRate.toFixed(2));
                    this._storage.setItem('live_eur_rate_timestamp', this._lastSuccessfulFetchAt);
                }

                this._notify();
                return this.getState();

            } catch (err) {
                console.warn('[ExchangeRateService] Élő árfolyam lekérés sikertelen:', err.message || err);

                // Preserve last-known-good rate if present
                const savedLive = this._storage ? parseFloat(this._storage.getItem('live_eur_rate')) : NaN;
                if (Number.isFinite(savedLive) && savedLive > 0) {
                    this._rate = savedLive;
                    this._source = 'live_cache';
                    this._status = 'stale';
                } else {
                    this._rate = this._manualFallbackRate;
                    this._source = 'fallback';
                    this._status = 'fallback';
                }

                this._notify();
                return this.getState();

            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                this._activeFetchPromise = null;
            }
        })();

        return this._activeFetchPromise;
    }
}

export const exchangeRateService = new ExchangeRateService();
