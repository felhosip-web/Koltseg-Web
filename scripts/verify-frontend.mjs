import { chromium } from 'playwright-core';
import fs from 'fs';

(async () => {
  // Create directories
  fs.mkdirSync('/home/jules/verification/videos', { recursive: true });
  fs.mkdirSync('/home/jules/verification/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    recordVideo: {
      dir: '/home/jules/verification/videos'
    }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[PAGE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error(`[PAGEERROR] ${err.message}`));

  try {
    const url = `http://127.0.0.1:3000/index.html`;
    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);

    // Wait for app boot
    await page.waitForFunction(() => window.app?.isBooted === true, { timeout: 20000 });
    await page.waitForTimeout(1000);

    // Click launch button if landing screen is visible
    try {
      const launchBtn = page.locator('#btnLaunchCostApp');
      if (await launchBtn.isVisible()) {
        console.log('Landing screen detected, clicking launch cost app...');
        await launchBtn.click();
      }
    } catch (e) {
      console.log('No landing screen launch button clicked or needed:', e.message);
    }
    await page.waitForTimeout(1000);

    // Switch to table tab
    await page.click('[data-tab="table"]');
    await page.waitForTimeout(1000);

    // Create a new category
    console.log('Creating a new category...');
    await page.click('#btnNewItem');
    await page.waitForTimeout(1000);
    await page.fill('#hmiInputValue', 'Zustand Test');
    await page.click('button.hmi-color-option[data-color="#d1fae5"]');
    await page.waitForTimeout(500);
    await page.click('#hmiInputSaveBtn');
    await page.waitForTimeout(1000);

    // Create a new month
    console.log('Creating a new month...');
    await page.click('#btnNewMonth');
    await page.waitForTimeout(1000);
    await page.click('#hmiInputSaveBtn');
    await page.waitForTimeout(1000);

    // Open first cell
    console.log('Opening cell and adding entry...');
    const cell = page.locator('[data-cellbasekey]').first();
    await cell.click();
    await page.waitForTimeout(1000);

    // Edit cell
    await page.fill('#cellAmountInput', '5500');
    await page.fill('#cellNoteInput', 'Zustand + IndexedDB verified!');
    await page.click('#btnSaveCellModal');
    await page.waitForTimeout(1500);

    // Close cell editor
    await page.click('#btnCancelCellModal');
    await page.waitForTimeout(1000);

    // Take final screenshot
    await page.screenshot({ path: '/home/jules/verification/screenshots/verification.png' });
    console.log('Screenshot taken!');
    await page.waitForTimeout(1000);

  } catch (err) {
    console.error('VERIFICATION ERROR', err);
  } finally {
    await context.close();
    await browser.close();
    console.log('Verification finished.');
  }
})();
