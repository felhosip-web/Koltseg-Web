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
        return num; // Safe fallback when no rate is available
    }

    if (from === 'EUR' && to === 'HUF') {
        return num * rate;
    }

    if (from === 'HUF' && to === 'EUR') {
        return num / rate;
    }

    return num;
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
    const secondaryValue = convertAmount(num, transactionCurrency, sCurr, rate);

    const primaryStr = formatCurrency(primaryValue, pCurr);

    const validRate = Number.isFinite(Number(rate)) && Number(rate) > 0;
    if (!validRate) {
        return primaryStr;
    }

    const secondaryStr = formatCurrency(secondaryValue, sCurr);
    return `${primaryStr} (≈ ${secondaryStr})`;
}
