import { chromium } from 'playwright-core';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[PAGE ${msg.type()}] ${text}`);
  });
  page.on('pageerror', err => console.error(`[PAGEERROR] ${err.message}`));
  page.on('requestfailed', req => console.warn(`[REQFAILED] ${req.url()} ${req.failure()?.errorText || 'failed'}`));

  try {
    const port = process.env.PLAYWRIGHT_TEST_PORT || 8000;
    const url = `http://127.0.0.1:${port}/index.html`;
    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    await page.waitForSelector('.version-text, #mainTableContainegitr, .tab-btn', { timeout: 15000 });
    await page.waitForFunction(() => window.app?.isBooted === true, { timeout: 20000 });

    const booted = await page.evaluate(() => ({
      isBooted: window.app?.isBooted || false,
      activeTab: window.app?.activeTab || null,
      items: window.app?.items?.items?.length || 0,
      months: window.app?.months?.months?.length || 0,
      entries: window.app?.entries?.entries?.length || 0,
      config: {
        useSupabase: window.app?.config?.useSupabase,
        eurRate: window.app?.config?.eurRate
      }
    }));

    console.log('APP STATE:', JSON.stringify(booted, null, 2));

    const backgroundTasksCheck = await page.evaluate(async () => {
      const backgroundTasks = window.app?.backgroundTasks;
      if (!backgroundTasks) return { exists: false };
      const initialActive = Boolean(backgroundTasks.isActive);
      backgroundTasks.pause?.();
      const paused = backgroundTasks.isActive === false;
      backgroundTasks.resume?.();
      const resumed = backgroundTasks.isActive === true;
      return { exists: true, initialActive, paused, resumed };
    });
    console.log('Background tasks status:', JSON.stringify(backgroundTasksCheck, null, 2));

    const settingsOpened = await page.evaluate(() => {
      const btn = document.getElementById('btnSettings');
      if (!btn) return false;
      btn.click();
      return true;
    });

    if (settingsOpened) {
      await page.waitForSelector('#supabaseUrlInput', { state: 'attached', timeout: 10000 });
      const panelVisible = await page.evaluate(() => {
        const panel = document.getElementById('settingsPanel');
        return panel ? !panel.classList.contains('hidden') : false;
      });
      console.log('Settings panel opened:', panelVisible);
      const saveButton = await page.$('#btnSaveSettings');
      console.log('Settings save button present:', Boolean(saveButton));
    } else {
      console.warn('Settings button not found');
    }

    const tableVisible = await page.evaluate(() => {
      const pane = document.getElementById('tab-table');
      return pane ? !pane.classList.contains('hidden') : false;
    });
    console.log('Table tab visible:', tableVisible);

    if (!tableVisible) {
      await page.evaluate(() => {
        document.querySelector('[data-tab="table"]')?.click();
      });
      await page.waitForFunction(() => window.app?.activeTab === 'table', { timeout: 10000 });
    }

    const timestamp = Date.now();
    const newItemName = `AUTOTEST item ${timestamp}`;

    // 1) Open item modal and save a new category
    await page.click('#btnNewItem');
    await page.waitForSelector('#hmiInputModal:not(.hidden)', { timeout: 10000 });
    await page.fill('#hmiInputValue', newItemName);
    await page.click('button.hmi-color-option[data-color="#d1fae5"]');
    await page.click('#hmiInputSaveBtn');
    await page.waitForFunction(() => document.getElementById('hmiInputModal')?.classList.contains('hidden'), { timeout: 10000 });
    const itemModalClosed = await page.evaluate(() => document.getElementById('hmiInputModal')?.classList.contains('hidden'));
    console.log('Item modal saved and closed:', itemModalClosed);

    // 2) Open month modal and save current month
    await page.click('#btnNewMonth');
    await page.waitForSelector('#hmiInputModal:not(.hidden)', { timeout: 10000 });
    await page.click('#hmiInputSaveBtn');
    await page.waitForFunction(() => document.getElementById('hmiInputModal')?.classList.contains('hidden'), { timeout: 10000 });
    const monthModalClosed = await page.evaluate(() => document.getElementById('hmiInputModal')?.classList.contains('hidden'));
    console.log('Month modal saved and closed:', monthModalClosed);

    // 3) Open a table cell modal, add a sub-entry, then delete it via confirm
    const tableClickResult = await page.evaluate(() => {
      const btn = document.querySelector('[data-tab="table"]');
      if (!btn) return { found: false };
      btn.click();
      const pane = document.getElementById('tab-table');
      return { found: true, activeTab: window.app?.activeTab, tabClass: pane?.className };
    });
    console.log('Table tab click result:', JSON.stringify(tableClickResult));
    await page.waitForFunction(() => {
      const pane = document.getElementById('tab-table');
      return pane && !pane.classList.contains('hidden');
    }, { timeout: 10000 });
    const cellClicked = await page.evaluate(() => {
      const cell = document.querySelector('[data-cellbasekey]');
      if (!cell) return false;
      cell.click();
      return true;
    });
    if (!cellClicked) {
      throw new Error('No table cell with data-cellbasekey found');
    }
    await page.waitForSelector('#cellEditorModal:not(.hidden)', { timeout: 10000 });
    await page.fill('#cellAmountInput', '1234');
    await page.fill('#cellNoteInput', 'autotest note');
    await page.selectOption('#cellCurrencyInput', 'HUF');
    await page.selectOption('#cellMethodInput', 'Kártya');
    await page.click('#btnSaveCellModal');
    await page.waitForFunction(() => document.querySelectorAll('#subEntriesContainer .btn-edit-sub-entry').length > 0, { timeout: 10000 });
    const subEntryCount = await page.evaluate(() => document.querySelectorAll('#subEntriesContainer .btn-edit-sub-entry').length);
    console.log('Sub-entry count after save:', subEntryCount);
    if (subEntryCount === 0) throw new Error('No sub-entry found after save');

    // delete the created sub-entry and confirm
    await page.click('#subEntriesContainer .btn-delete-sub-entry');
    await page.waitForSelector('#globalConfirmModal:not(.hidden)', { timeout: 10000 });
    await page.click('#globalConfirmOkBtn');
    await page.waitForFunction(() => document.getElementById('globalConfirmModal')?.classList.contains('hidden'), { timeout: 10000 });
    await page.click('#btnCancelCellModal');
    await page.waitForFunction(() => document.getElementById('cellEditorModal')?.classList.contains('hidden'), { timeout: 10000 });

    // 4) Open DB Audit modal and rebuild indexes
    await page.click('#btnDbAudit');
    await page.waitForSelector('#dbAuditModal:not(.hidden)', { timeout: 10000 });
    await page.waitForFunction(() => {
      const container = document.getElementById('auditReportContainer');
      return container && container.innerText.trim().length > 0;
    }, { timeout: 15000 });
    console.log('DB Audit report rendered');
    await page.click('#btnRebuildIndexes');
    await page.waitForTimeout(1500);
    const auditModalVisible = await page.evaluate(() => !document.getElementById('dbAuditModal')?.classList.contains('hidden'));
    console.log('DB Audit modal still visible after rebuild click:', auditModalVisible);

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err);
    await browser.close();
    process.exit(1);
  }
})();
