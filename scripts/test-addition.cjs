const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Catch console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('http://127.0.0.1:3000');

    // Launch app
    await page.waitForSelector('#btnLaunchCostApp', { state: 'visible' });
    await page.click('#btnLaunchCostApp');

    // Switch to table tab
    await page.evaluate(() => {
        if (window.app && window.app.tabStateMachine) {
            window.app.activeTab = 'table';
            if (window.app.tabStateMachine.table) window.app.tabStateMachine.table();
        }
    });

    // Check if table is rendered
    try {
        await page.waitForSelector('#vtThead th', { timeout: 3000 });
    } catch(e) {}

    // Get initial column count
    const initialColumns = await page.locator('#vtThead th').count();
    console.log('Initial columns:', initialColumns);

    // Use evaluate to manually call performSave instead of interacting with the modal
    await page.evaluate(async () => {
        const randomMonth = `2099-${Math.floor(Math.random() * 12 + 1).toString().padStart(2, '0')}`;
        await window.app.uiController.inputModal.performSave('item', "TestItem" + Math.random(), "#ff0000");
        await window.app.uiController.inputModal.performSave('month', randomMonth, null);
    });

    await page.waitForTimeout(2000); // Wait for UI update

    // Check column count again
    const finalColumns = await page.locator('#vtThead th').count();
    console.log('Final columns:', finalColumns);

    if (finalColumns > initialColumns) {
        console.log('SUCCESS: UI updated automatically after adding a month and an item!');
    } else {
        console.log('FAILURE: UI did not update.');
    }

    await browser.close();
})();
