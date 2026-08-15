# Database Audit Report

## 1. Write Paths
- **Entry create/update**: Uses UUIDs. Sometimes missing `itemId`/`month` if using legacy `cellKey`. `SyncService` queues them.
- **Entry delete**: Pushes to `deleted_records` and `syncQueue`.
- **Item delete**: Cascade deletes entries via `deleteItemWithEntries`. This is implemented in `oop-core.js`.
- **Tombstone**: Centralized in `Database.delete` and `Database.deleteItemWithEntries`.
- **Queue**: Items are pushed to `localStorage`. `SyncService` processes them, retries 3 times, then marks as `failed`. Queue is NOT cleared on failure.

## 2. Fragile Points
- Legacy `cellKey` usages instead of `parseCellKey` in some fallback logic.
- `Database._getTempItemId` uses string splits instead of `parseCellKey`.
- Queue logic might duplicate if items are re-added? No, `SyncService` handles state (`pending`, `processing`, `failed`).
- Repair path in `db-audit.js` could throw if an entry is severely malformed, stopping the whole repair.

## 3. Recommended Actions
- The explicit clearing of the sync queue on error (`clearQueue()`) is dangerous in an offline-first app, because it leads to data loss (offline changes are wiped without being synced). Remove `clearQueue()` calls from `catch` blocks in managers/controllers.
- Improve `db-audit.js` so it correctly identifies explicit fields vs fallback parsing, doesn't crash on one broken record, and allows a non-destructive read-only health check.
- Provide `window.runDbHealthCheck()` in the console.
