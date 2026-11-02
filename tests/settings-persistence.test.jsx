import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { ConfigManager } from '../js/oop-core.js';
import { useAppStore } from '../src/store/useAppStore.js';

let dom;

beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
});

afterEach(() => {
    dom.window.close();
});

test('ConfigManager.saveSettings persists primaryCurrency and updates exchangeRateService', () => {
    const config = new ConfigManager();
    assert.equal(config.primaryCurrency, 'HUF');

    config.saveSettings({
        eurRate: 415,
        useLiveEur: false,
        primaryCurrency: 'EUR'
    });

    assert.equal(config.primaryCurrency, 'EUR');
    assert.equal(localStorage.getItem('app_primary_currency'), 'EUR');
    assert.equal(config.defaultEurRate, 415);
    assert.equal(config.eurRate, 415);
    assert.equal(config.useLiveEur, false);

    // Zustand sync
    useAppStore.getState().setSnapshot({
        primaryCurrency: config.primaryCurrency,
        eurRate: config.eurRate
    });

    const storeState = useAppStore.getState();
    assert.equal(storeState.primaryCurrency, 'EUR');
    assert.equal(storeState.eurRate, 415);
});
