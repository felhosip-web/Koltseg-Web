import assert from 'node:assert/strict';
import test from 'node:test';
import { fuelLogModuleScript } from '../js/modules/fuel-log.js';

test('Fuel log module generates expense entries strictly in HUF', () => {
    // Execute module definition function
    const createModule = new Function(fuelLogModuleScript);
    const mod = createModule();

    assert.equal(mod.id, 'plugin_fuel_log');
    assert.equal(typeof mod.tabConfig.render, 'function');

    // Verify module script source guarantees HUF currency for generated expense entries
    assert.ok(fuelLogModuleScript.includes("currency: 'HUF'"));
    // Ensure primaryCurrency is not used to tag HUF totalCost as EUR
    assert.ok(!fuelLogModuleScript.includes("currency: primaryCurrency"));
});
