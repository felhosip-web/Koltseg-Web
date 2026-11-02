import assert from 'node:assert/strict';
import test from 'node:test';
import { convertAmount, formatCurrency, formatDualCurrency, getSecondaryCurrency } from '../src/utils/currency-utils.js';

test('getSecondaryCurrency toggles correctly between HUF and EUR', () => {
    assert.equal(getSecondaryCurrency('HUF'), 'EUR');
    assert.equal(getSecondaryCurrency('EUR'), 'HUF');
    assert.equal(getSecondaryCurrency('huf'), 'EUR');
    assert.equal(getSecondaryCurrency('eur'), 'HUF');
});

test('convertAmount calculates EUR to HUF and HUF to EUR with full precision', () => {
    // 100 EUR @ 400 = 40000 HUF
    assert.equal(convertAmount(100, 'EUR', 'HUF', 400), 40000);

    // 40000 HUF @ 400 = 100 EUR
    assert.equal(convertAmount(40000, 'HUF', 'EUR', 400), 100);

    // Same currency preserved
    assert.equal(convertAmount(1234.56, 'HUF', 'HUF', 400), 1234.56);
    assert.equal(convertAmount(50.25, 'EUR', 'EUR', 400), 50.25);

    // High precision preservation (no premature rounding)
    const result = convertAmount(1000, 'HUF', 'EUR', 395.25);
    assert.equal(result, 1000 / 395.25);
    assert.ok(result > 2.5299 && result < 2.5301);
});

test('convertAmount handles invalid or missing rates and zero/negative amounts safely', () => {
    // Cross-currency conversion with invalid rates must return null
    assert.equal(convertAmount(100, 'EUR', 'HUF', 0), null);
    assert.equal(convertAmount(100, 'EUR', 'HUF', -400), null);
    assert.equal(convertAmount(100, 'EUR', 'HUF', null), null);
    assert.equal(convertAmount(100, 'EUR', 'HUF', undefined), null);
    assert.equal(convertAmount(100, 'EUR', 'HUF', NaN), null);
    assert.equal(convertAmount(100, 'EUR', 'HUF', Infinity), null);
    assert.equal(convertAmount(100, 'EUR', 'HUF', -Infinity), null);

    // Same-currency conversion succeeds without a rate
    assert.equal(convertAmount(100, 'HUF', 'HUF', 0), 100);
    assert.equal(convertAmount(100, 'EUR', 'EUR', null), 100);
    assert.equal(convertAmount(100, 'HUF', 'HUF', NaN), 100);

    // Valid rates with zero / negative amounts
    assert.equal(convertAmount(0, 'EUR', 'HUF', 400), 0);
    assert.equal(convertAmount(-50, 'EUR', 'HUF', 400), -20000);
});

test('formatCurrency produces proper Hungarian locale strings', () => {
    // HUF: integer rounded with 'Ft'
    const hufStr = formatCurrency(40000.75, 'HUF');
    assert.ok(hufStr.includes('40') && hufStr.includes('001') && hufStr.endsWith('Ft'));

    // EUR: 2 decimal places with 'EUR'
    const eurStr = formatCurrency(100, 'EUR');
    assert.ok(eurStr.includes('100') && eurStr.endsWith('EUR'));

    // Decimals option override
    const customEur = formatCurrency(100.5, 'EUR', { decimals: 1 });
    assert.ok(customEur.includes('100,5') || customEur.includes('100.5'));
});

test('formatDualCurrency formats primary and secondary values consistently', () => {
    // Primary HUF: "40 000 Ft (≈ 100,00 EUR)"
    const dualHuf = formatDualCurrency(40000, 'HUF', 'HUF', 400);
    assert.ok(dualHuf.includes('Ft'));
    assert.ok(dualHuf.includes('≈'));
    assert.ok(dualHuf.includes('EUR'));

    // Primary EUR: "100,00 EUR (≈ 40 000 Ft)"
    const dualEur = formatDualCurrency(100, 'EUR', 'EUR', 400);
    assert.ok(dualEur.includes('EUR'));
    assert.ok(dualEur.includes('≈'));
    assert.ok(dualEur.includes('Ft'));
});
