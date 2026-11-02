import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { CellModalController } from '../js/cell-modal-controller.js';

let dom;

beforeEach(() => {
    dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
            <body>
                <input type="number" id="cellAmountInput" />
                <input type="text" id="cellNoteInput" />
                <select id="cellMethodInput"><option value="Kártya">Kártya</option></select>
                <select id="cellCurrencyInput">
                    <option value="HUF">HUF</option>
                    <option value="EUR">EUR</option>
                </select>
                <input type="checkbox" id="cellIsStorno" />
                <div id="costAppCellEditorRoot"></div>
            </body>
        </html>
    `, { url: 'http://localhost/' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
});

afterEach(() => {
    dom.window.close();
});

test('CellModalController.resetForm defaults new entry to primaryCurrency', () => {
    const fakeApp = {
        config: { primaryCurrency: 'EUR' }
    };

    const controller = new CellModalController(fakeApp);
    controller.resetForm();

    const currInput = document.getElementById('cellCurrencyInput');
    assert.equal(currInput.value, 'EUR');

    fakeApp.config.primaryCurrency = 'HUF';
    controller.resetForm();
    assert.equal(currInput.value, 'HUF');
});

test('CellModalController.editEntry preserves original transaction currency regardless of primary currency', () => {
    const fakeApp = {
        config: { primaryCurrency: 'EUR' },
        entries: {
            entries: [
                { id: 'entry-123', amount: 5000, currency: 'HUF', paymentMethod: 'Kártya', note: 'Eredeti HUF' }
            ]
        }
    };

    const controller = new CellModalController(fakeApp);
    controller.editEntry('entry-123');

    const currInput = document.getElementById('cellCurrencyInput');
    assert.equal(currInput.value, 'HUF', 'Must retain transaction currency HUF even when primary is EUR');
});
