import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: "http://localhost" });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, value) { this.store[key] = String(value); },
    removeItem(key) { delete this.store[key]; }
};

// ... we can't easily run the whole app because of ES modules and indexedDB
