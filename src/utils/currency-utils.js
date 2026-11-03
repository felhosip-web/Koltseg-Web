// src/utils/currency-utils.js
/**
 * Central Currency Utilities
 *
 * Rules:
 * - High-precision calculations during aggregations (no intermediate rounding)
 * - HUF display: integer precision, Hungarian format ('40 000 Ft')
 * - EUR display: two decimal places, Hungarian format ('100,00 EUR')
 * - Dual display format:
 *   - Primary HUF: "40 000 Ft (≈ 100,00 EUR)"
 *   - Primary EUR: "100,00 EUR (≈ 40 000 Ft)"
 */

/**
 * Converts a numeric amount from one currency to another using the provided exchange rate.
 * Keeps full floating-point precision during calculations.
 *
 * @param {number} amount
 * @param {string} fromCurrency 'HUF' | 'EUR'
 * @param {string} toCurrency 'HUF' | 'EUR'
 * @param {number} eurRate HUF/EUR rate
 * @returns {number} Converted amount
 */
export function convertAmount(amount, fromCurrency, toCurrency, eurRate) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return 0;

    const from = String(fromCurrency || 'HUF').toUpperCase();
    const to = String(toCurrency || 'HUF').toUpperCase();

    if (from === to) return num;

    const rate = Number(eurRate);
    if (!Number.isFinite(rate) || rate <= 0) {
        return null;
    }

    if (from === 'EUR' && to === 'HUF') {
        return num * rate;
    }

    if (from === 'HUF' && to === 'EUR') {
        return num / rate;
    }

    return null;
}

/**
 * Returns the opposite secondary currency.
 * @param {string} primaryCurrency 'HUF' | 'EUR'
 * @returns {string} 'EUR' | 'HUF'
 */
export function getSecondaryCurrency(primaryCurrency) {
    return String(primaryCurrency).toUpperCase() === 'EUR' ? 'HUF' : 'EUR';
}

/**
 * Formats a currency amount according to Hungarian locale standards.
 *
 * @param {number} amount
 * @param {string} currency 'HUF' | 'EUR'
 * @param {Object} [options]
 * @param {boolean} [options.includeSymbol=true]
 * @param {number} [options.decimals]
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'HUF', options = {}) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return '—';

    const curr = String(currency || 'HUF').toUpperCase();
    const includeSymbol = options.includeSymbol !== false;

    if (curr === 'EUR') {
        const decimals = options.decimals !== undefined ? options.decimals : 2;
        const formatted = num.toLocaleString('hu-HU', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
        return includeSymbol ? `${formatted} EUR` : formatted;
    }

    // HUF default
    const decimals = options.decimals !== undefined ? options.decimals : 0;
    const rounded = decimals === 0 ? Math.round(num) : num;
    const formatted = rounded.toLocaleString('hu-HU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    return includeSymbol ? `${formatted} Ft` : formatted;
}

/**
 * Formats a dual-currency presentation string for an amount.
 *
 * Example:
 * - Primary HUF, 40000 HUF, rate 400 -> "40 000 Ft (≈ 100,00 EUR)"
 * - Primary EUR, 100 EUR, rate 400 -> "100,00 EUR (≈ 40 000 Ft)"
 *
 * @param {number} amount
 * @param {string} transactionCurrency
 * @param {string} primaryCurrency
 * @param {number} rate
 * @returns {string}
 */
export function formatDualCurrency(amount, transactionCurrency, primaryCurrency, rate) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return '—';

    const pCurr = String(primaryCurrency || 'HUF').toUpperCase();
    const sCurr = getSecondaryCurrency(pCurr);

    const primaryValue = convertAmount(num, transactionCurrency, pCurr, rate);
    if (primaryValue === null) {
        // Cannot convert transaction amount to primary currency
        return formatCurrency(num, transactionCurrency);
    }

    const primaryStr = formatCurrency(primaryValue, pCurr);

    const secondaryValue = convertAmount(num, transactionCurrency, sCurr, rate);
    if (secondaryValue === null) {
        return primaryStr;
    }

    const secondaryStr = formatCurrency(secondaryValue, sCurr);
    return `${primaryStr} (≈ ${secondaryStr})`;
}

/**
 * Checks if a string is a valid supported currency code ('HUF' or 'EUR').
 * @param {any} currency
 * @returns {boolean}
 */
export function isValidCurrency(currency) {
    if (typeof currency !== 'string') return false;
    const upper = currency.trim().toUpperCase();
    return upper === 'HUF' || upper === 'EUR';
}

/**
 * Resolves the default currency for a new or edited transaction.
 *
 * Rules:
 * - If explicitCurrency is provided and is a valid supported currency ('HUF' | 'EUR'), it takes precedence.
 * - Otherwise, resolves from the current persisted primary currency (via config / store / localStorage).
 * - Falls back to 'HUF' if missing or invalid.
 *
 * @param {any} [explicitCurrency] Explicitly selected or existing transaction currency
 * @param {any} [fallbackPrimary] Optional primary currency override
 * @returns {'HUF' | 'EUR'} Resolved currency code
 */
export function resolveDefaultCurrency(explicitCurrency = null, fallbackPrimary = null) {
    if (isValidCurrency(explicitCurrency)) {
        return String(explicitCurrency).trim().toUpperCase();
    }

    if (isValidCurrency(fallbackPrimary)) {
        return String(fallbackPrimary).trim().toUpperCase();
    }

    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('app_primary_currency');
        if (isValidCurrency(stored)) {
            return String(stored).trim().toUpperCase();
        }
    }

    return 'HUF';
}
