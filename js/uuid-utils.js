// js/uuid-utils.js - UUID generátor modul
// Biztonságos UUID v4 generálás crypto.randomUUID()-vel, fallback polyfill-lel

/**
 * UUID v4 generálása.
 * Elsődlegesen a natív crypto.randomUUID()-t használja (modern böngészők),
 * fallback-ként crypto.getRandomValues() alapú polyfill-t alkalmaz.
 * @returns {string} UUID v4 formátumú string (pl. "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUUID() {
    // Natív API (Chrome 92+, Firefox 95+, Safari 15.4+)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // Fallback: crypto.getRandomValues() alapú polyfill
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        
        // RFC 4122 v4: set version (4) and variant (10xx)
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
        
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20, 32)
        ].join('-');
    }

    // Utolsó fallback: Math.random() alapú (nem kriptográfiailag biztonságos, de működik)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Ellenőrzi, hogy egy string érvényes UUID formátumú-e.
 * @param {string} str - Az ellenőrizendő string
 * @returns {boolean}
 */
export function isValidUUID(str) {
    if (typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
