1. **Deduplicate tombstone logic in `js/oop-core.js`:**
   - Modify `Database.delete` to handle creating a tombstone via a new helper or directly inside `_directDelete` / `delete`.
   - Update `Database.deleteItemWithEntries` to loop through deleted entries and automatically create `deleted_records` for them, and push them to the `syncService.addToQueue`. Wait, `deleteItemWithEntries` is already doing the local DB deletion. We can add a `syncService` parameter or just rely on a `markAsDeleted` method inside `Database`.
   - Refactor `ItemManager.delete` to simply call `this.db.deleteItemWithEntries` and it will automatically handle tombstones, rather than duplicating the tombstone loop inside `ItemManager.delete`.
2. **Extract dashboard renderer to `js/dashboard-renderer.js`:**
   - Create a new class `DashboardRenderer` in `js/dashboard-renderer.js`.
   - Move `renderDashboard`, `_setElementText`, `_calculateMonthlyAvg`, `_renderDashboardTrend`, `_renderDashboardTop5`, and `_renderDashboardNotifications` from `App` to `DashboardRenderer`.
   - Initialize `this.dashboardRenderer = new DashboardRenderer(this)` in `App` and call `this.dashboardRenderer.renderDashboard()` instead.
3. **Extract stats renderer to `js/stats-renderer.js`:**
   - Create a new class `StatsRenderer` in `js/stats-renderer.js`.
   - Move `renderStats` from `App` to `StatsRenderer`.
   - Initialize `this.statsRenderer = new StatsRenderer(this)` in `App`.
4. **Extract debug panel to `js/debug-panel.js`:**
   - Move `setupDebugConsole` and `initDebugPanel` from `js/app.js` to `js/debug-panel.js`.
   - Export them and import in `js/app.js`.
5. **Reduce `window.app` usage:**
   - In `js/oop-core.js`: Update `Database` methods to accept `syncService` as a parameter instead of relying on `window.app.syncService` when deleting items. Add a setter `db.setSyncService(syncService)` and call it from `App`.
   - In `js/store.js`: Add an `initStore(appDb)` function to configure the IndexedDB instance for auto-saving, instead of using `window.app.db`.
6. **Move obsolete patch files to `patches/`:**
   - Ensure `patches_archive` is correctly placed and rename it to `patches/`. Verify nothing imports these files.
7. **Complete pre commit steps:**
   - Complete pre commit steps to make sure proper testing, verifications, reviews and reflections are done.
8. **Submit changes:**
   - Commit and push to a new branch.
