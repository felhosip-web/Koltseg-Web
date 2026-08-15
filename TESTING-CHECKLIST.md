# Database Audit & Repair Test Checklist

1. **Verify offline entry creation**
   - Disconnect network.
   - Add a new transaction (entry).
   - Check `window.runDbHealthCheck()`. `queueStatus.pending` should be `1`. `storeCounts.entries` should be incremented.

2. **Verify online sync restoration**
   - Reconnect network.
   - Wait for sync or trigger manually.
   - Run `window.runDbHealthCheck()`. Queue pending should drop to `0`. `storeCounts.entries` should be unchanged (unless pulled data exists).

3. **Verify offline delete & tombstone logic**
   - Delete an existing transaction while offline.
   - Run `window.runDbHealthCheck()`. `queueStatus.pending` should increase. `storeCounts.deleted_records` should increase by 1. The entry should be removed from `entries` store.

4. **Verify online delete sync**
   - Reconnect network.
   - Wait for sync. Tombstone `deleted_records` should sync, and queue pending should clear.

5. **Verify item cascade delete**
   - Create a category (item) and add 2 entries to it.
   - Delete the category.
   - Run `window.runDbHealthCheck()`. Both entries should be removed from the `entries` store, and `deleted_records` should reflect their deletions.

6. **Introduce malformed entry data**
   - In console: `const e = { id: crypto.randomUUID(), amount: 500 }; await app.db.save('entries', e);`
   - Run `window.runDbHealthCheck()`. `badCellKeys` and `orphans` should increase by 1.

7. **Introduce orphaned entry**
   - In console: `const id = crypto.randomUUID(); const e = { id, itemId: crypto.randomUUID(), month: '2025-10', amount: 500 }; await app.db.save('entries', e);`
   - Run `window.runDbHealthCheck()`. `orphans` should increase by 1. `missingExplicitFields` shouldn't change for this entry.

8. **Test auto repair behavior**
   - Run `await app.dbAudit.autoRepairDatabase()`.
   - Run `window.runDbHealthCheck()`. A helyreállítható orphan (pl. amihez csak kategória hiányzik, de az id megvan) javításra kerül. A teljesen malformed (itemId + month nélküli) rekord badCellKey/orphan marad, mert helyreállíthatatlan, hacsak nem távolítjuk el külön.

9. **Verify failing API sync does not clear queue**
   - Block network requests or introduce a temporary backend error.
   - Make a change offline.
   - Attempt sync. Wait for 3 retries.
   - Run `window.runDbHealthCheck()`. Item should be moved to `failed` queue status instead of disappearing completely.

10. **Ensure queue status is updated properly**
   - Check `localStorage.getItem('hmi_syncQueue')` and verify JSON is intact and matches the state given by health check.
