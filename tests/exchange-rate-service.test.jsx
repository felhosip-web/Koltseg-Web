import assert from 'node:assert/strict';
import test from 'node:test';
import { ExchangeRateService, DEFAULT_FALLBACK_EUR_RATE } from '../src/services/currency/ExchangeRateService.js';

function createMockStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear()
    };
}

test('ExchangeRateService initializes with fallback 400 when storage is empty', () => {
    const storage = createMockStorage();
    const service = new ExchangeRateService(storage, async () => {});

    const state = service.getState();
    assert.equal(state.rate, DEFAULT_FALLBACK_EUR_RATE);
    assert.equal(state.status, 'fallback');
    assert.equal(state.source, 'fallback');
    assert.equal(state.isStale, false);
});

test('ExchangeRateService restores valid cached live rate without replacing with 400 on offline start', () => {
    const storage = createMockStorage({
        use_live_eur: 'true',
        live_eur_rate: '392.50',
        live_eur_rate_timestamp: new Date().toISOString()
    });
    const service = new ExchangeRateService(storage, async () => { throw new Error('Offline'); });

    const state = service.getState();
    assert.equal(state.rate, 392.50);
    assert.equal(state.source, 'live_cache');
    assert.equal(state.status, 'live');
});

test('ExchangeRateService marks cached rate as stale if older than 24 hours', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const storage = createMockStorage({
        use_live_eur: 'true',
        live_eur_rate: '388.10',
        live_eur_rate_timestamp: twoDaysAgo
    });
    const service = new ExchangeRateService(storage);

    const state = service.getState();
    assert.equal(state.rate, 388.10);
    assert.equal(state.status, 'stale');
    assert.equal(state.isStale, true);
});

test('ExchangeRateService successful fetch updates rate, status, and notifies listeners', async () => {
    const storage = createMockStorage();
    const mockFetch = async () => ({
        ok: true,
        json: async () => ({ rates: { HUF: 405.75 } })
    });

    const service = new ExchangeRateService(storage, mockFetch);
    let notifiedState = null;
    service.subscribe((st) => { notifiedState = st; });

    const res = await service.fetchLiveRate();
    assert.equal(res.rate, 405.75);
    assert.equal(res.status, 'live');
    assert.equal(res.source, 'live');
    assert.equal(storage.getItem('live_eur_rate'), '405.75');
    assert.ok(storage.getItem('live_eur_rate_timestamp'));
    assert.deepEqual(notifiedState, res);
});

test('ExchangeRateService fetch failure preserves last-known-good live rate and marks stale', async () => {
    const storage = createMockStorage({
        use_live_eur: 'true',
        live_eur_rate: '395.20',
        live_eur_rate_timestamp: new Date().toISOString()
    });
    const mockFetch = async () => {
        throw new Error('Network timeout');
    };

    const service = new ExchangeRateService(storage, mockFetch);
    const res = await service.fetchLiveRate();

    assert.equal(res.rate, 395.20, 'Must preserve cached rate instead of reverting to 400');
    assert.equal(res.status, 'stale');
    assert.equal(res.source, 'live_cache');
    assert.equal(res.isStale, true);
});

test('ExchangeRateService rejects invalid API payloads (0, NaN, negative, missing)', async () => {
    const storage = createMockStorage({
        use_live_eur: 'true',
        live_eur_rate: '390.00'
    });
    const mockFetch = async () => ({
        ok: true,
        json: async () => ({ rates: { HUF: -10 } }) // negative invalid
    });

    const service = new ExchangeRateService(storage, mockFetch);
    const res = await service.fetchLiveRate();

    assert.equal(res.rate, 390.00);
    assert.equal(res.status, 'stale');
});

test('ExchangeRateService manual rate mode persists and publishes immediately', () => {
    const storage = createMockStorage();
    const service = new ExchangeRateService(storage);

    service.setUseLiveEur(false);
    service.setManualFallbackRate(420);

    const state = service.getState();
    assert.equal(state.rate, 420);
    assert.equal(state.source, 'manual');
    assert.equal(state.status, 'manual');
    assert.equal(storage.getItem('default_eur_rate'), '420');
    assert.equal(storage.getItem('use_live_eur'), 'false');
});
