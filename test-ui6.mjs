import { chromium, devices } from 'playwright';
(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(devices['iPhone 13']);
    const page = await context.newPage();
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    const btn = await page.evaluate(() => {
        const el = document.querySelector('.btn-modules-toggle');
        if (!el) return null;
        let c = el, path = [];
        while(c && c.nodeType === 1) {
            path.push({tag: c.tagName, id: c.id, display: window.getComputedStyle(c).display});
            c = c.parentNode;
        }
        return path;
    });
    console.log(btn);
    await browser.close();
})();
