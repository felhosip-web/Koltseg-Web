import assert from 'node:assert/strict';
import test from 'node:test';
import { convertAmount, formatCurrency } from '../src/utils/currency-utils.js';

test('Incoming aggregation correctly converts mixed HUF and EUR entries', () => {
    const rate = 400;

    const incomings = [
        { id: 'inc_1', sender: 'Cég A', amount: 40000, currency: 'HUF', date: '2026-11-01' },
        { id: 'inc_2', sender: 'Cég A', amount: 100, currency: 'EUR', date: '2026-11-02' },
        { id: 'inc_3', sender: 'Cég B', amount: 80000, currency: 'HUF', date: '2026-11-01' },
        // Legacy entry without currency field
        { id: 'inc_4', sender: 'Cég B', amount: 20000, date: '2026-11-02' },
        // Storno entry (should be excluded)
        { id: 'inc_5', sender: 'Cég A', amount: 50, currency: 'EUR', date: '2026-11-03', isStorno: true }
    ];

    // Primary Currency: HUF
    const primaryHUF = 'HUF';
    const totalHUF = incomings
        .filter(e => !e.isStorno)
        .reduce((sum, e) => {
            const converted = convertAmount(e.amount, e.currency || 'HUF', primaryHUF, rate);
            return sum + (converted !== null ? converted : 0);
        }, 0);

    // inc_1: 40000 HUF
    // inc_2: 100 EUR = 40000 HUF
    // inc_3: 80000 HUF
    // inc_4: 20000 HUF (legacy default)
    // total = 180000 HUF
    assert.equal(totalHUF, 180000);

    // Primary Currency: EUR
    const primaryEUR = 'EUR';
    const totalEUR = incomings
        .filter(e => !e.isStorno)
        .reduce((sum, e) => {
            const converted = convertAmount(e.amount, e.currency || 'HUF', primaryEUR, rate);
            return sum + (converted !== null ? converted : 0);
        }, 0);

    // 180000 HUF / 400 = 450 EUR
    assert.equal(totalEUR, 450);

    // Sender Cég A in EUR: (40000 HUF -> 100 EUR) + 100 EUR = 200 EUR
    const cegATotalEUR = incomings
        .filter(e => e.sender === 'Cég A' && !e.isStorno)
        .reduce((sum, e) => {
            const converted = convertAmount(e.amount, e.currency || 'HUF', primaryEUR, rate);
            return sum + (converted !== null ? converted : 0);
        }, 0);
    assert.equal(cegATotalEUR, 200);

    // Verify stored records remain unmodified
    assert.equal(incomings[0].amount, 40000);
    assert.equal(incomings[0].currency, 'HUF');
    assert.equal(incomings[1].amount, 100);
    assert.equal(incomings[1].currency, 'EUR');
    assert.equal(incomings[3].amount, 20000);
    assert.equal(incomings[3].currency, undefined);
});
