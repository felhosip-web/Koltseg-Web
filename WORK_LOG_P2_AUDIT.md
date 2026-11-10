# Munka Nyilvántartás (Work Log) Module — P2 Technical Audit Report

## 1. Executive Summary

This report delivers a comprehensive, strictly read-only technical audit of the **Munka Nyilvántartás (Work Log)** module in the `felhosip-web/Koltseg-Web` repository following the merged baseline of **PR #200** (`dc901bb8cb5284293ff72b88f758ff5a18be75d3`).

The audit evaluated five core architectural dimensions:
1. **Duration validation** across UI input forms, controller logic, persistence adapters, and backup/import pipelines.
2. **Date validation, boundary checks, and timezone / calendar consistency**.
3. **Import validation, idempotency, and data integrity safeguards** (validating the durability of PR #200 improvements).
4. **Sorting, ordering, filtering, and cross-channel consistency** (UI card/table views, exports, and sync).
5. **State management, persistence reliability, atomic transaction execution, and offline/cloud synchronization**.

### Summary of Findings
- **Overall Quality Post-PR #200:** High. The baseline established by PR #200 successfully decoupled the Work Log from the financial ledger (`incomings`), introduced atomic IndexedDB readwrite transaction updates preserving immutable `created_at` timestamps, hardened JSON export/import pipelines with recursive canonical SHA-256 fingerprinting, and implemented dual in-flight submission locks preventing duplicate creation.
- **P0 Defects:** **0**. No critical data corruption, cross-ledger leakage, or catastrophic failure modes were detected.
- **P1 Defects:** **0**. The P1 issues resolved in PR #200 remain fully intact and verified by regression test suites.
- **P2 Defects (Medium Severity):** **3 confirmed defects**.
  1. *Unvalidated Work Log Ingestion in Full Database Backup Restore (`DataExportController.restoreBackupData`)*: Restores arbitrary `data.works` directly into IndexedDB without field, date, or duration validation.
  2. *Sorting Inversion & Inconsistency Between In-Memory Cache and UI Display*: `WorkLogManager.load()` sorts records ascending (`oldest first`), but documentation and typical UI expectation is descending (`newest first`), with zero tie-breaking on missing `created_at` or equal timestamps.
  3. *Duration Form Parsing and Fallback Masking*: `App.prototype.submitWorkForm` uses `Number(durInput ? durInput.value : 1) || 1`, masking zero, negative numbers, or invalid strings as `1` without raising a user-facing validation warning, while `WorkLogManager.save()` performs no domain-level validation on duration or dates.
- **P3 Issues / Technical Debt:** **4 non-breaking findings**.
  1. *Lack of Centralized Work Log Domain Validator Function*: Validation rules are split inconsistently between `submitWorkForm`, `importWorkJson`, and HTML5 form constraints.
  2. *Default Date Calculation Uses UTC instead of Local Calendar Date*: `dateInput.value = new Date().toISOString().split('T')[0]` causes date shifts between 23:00 and 00:00 UTC+1/UTC+2 (Hungary timezone).
  3. *Unconstrained Free-Text `status` Ingestion in Core Manager*: `WorkLogManager.save` accepts any string as `status`, whereas UI only recognizes `'folyamatban'`, `'elvégzett'`, and `'meghiúsult'`.
  4. *Unsanitized HTML/Text Rendering in Export Utilities*: Excel and PDF exports do not strip or sanitize carriage returns uniformly in notes/locations.

---

## 2. Repository and Baseline Verification

The repository identity and commit baseline were verified prior to beginning the audit:
- **Repository Remote:** `origin https://github.com/felhosip-web/Koltseg-Web`
- **Working Branch:** `jules-17929547439846937066-77b84e4f`
- **Latest Merged PR #200 Commit:** `dc901bb8cb5284293ff72b88f758ff5a18be75d3` (`Merge pull request #200 from felhosip-web/fix/work-log-p1-fixes-1966088513059357450`)
- **Current `origin/main` HEAD Commit:** `f939d41cf0863375811ee27df6742860e559266d` (`chore: update version.json to 7.3.0`)
- **Current Working Branch HEAD Commit:** `f939d41cf0863375811ee27df6742860e559266d`
- **Branch Relationship:** The working branch is directly even with `origin/main` at commit `f939d41cf0863375811ee27df6742860e559266d`.
- **Working Tree Status:** Clean (no uncommitted modifications, no untracked files prior to this report).

---

## 3. Audit Scope and Methodology

The audit inspected all production source files, components, and controllers participating in the Work Log lifecycle:
- `js/work-log.js` (Core domain manager: `WorkLogManager`)
- `js/app.js` (`App.prototype.openWorkModal`, `closeWorkModal`, `submitWorkForm`, `deleteWorkLog`, `generateTestWorks`, `clearAllData`)
- `src/components/WorkEditorModal.jsx` (Modal UI component, refs, state, in-flight locks)
- `src/WorkAppList.jsx` (List container, KPI calculations, search filters, card/table views)
- `src/WorkAppHeader.jsx` (Module navigation, export/import action triggers)
- `js/data-export-controller.js` (`exportWorkExcel`, `exportWorkPdf`, `exportWorkJson`, `importWorkJson`, `_buildBackupData`, `restoreBackupData`)
- `js/sync-service.js` (Table registry, queue management, push/pull, `_reloadAndRender`)
- `supabase/migrations/20260712222340_init_schema.sql` (Supabase schema and constraints for `works`)
- Existing test suites: `tests/work-log-p1-fixes.test.jsx`, `tests/app-submit-work-form.test.jsx`, `tests/work-editor-modal.test.jsx`

Audit methods:
- Static code analysis across validation call chains.
- Data-flow tracing from UI input events to IndexedDB transactions and Supabase sync payloads.
- Timezone shift verification across UTC and local Hungarian time (`Europe/Budapest`).
- Verification of test suite execution and test assertions.

---

## 4. Duration Validation Findings

### 4.1 UI Input Form Constraints
- **File:** `src/components/WorkEditorModal.jsx`
- **Observed Behavior:** The input element is declared as `<input type="number" id="workDurationInput" min="1" required placeholder="1" />`.
- **Evaluation:** HTML5 form validation requires `min="1"`. When the form is submitted natively via `<button type="submit">`, browser validation prevents negative numbers or zero if triggered via native browser submission.
- **Vulnerability / Gap:** Browser HTML5 validation does not enforce integers (step defaults to any integer if not specified, but fractional values like `1.5` trigger invalid step warnings only in compliant browsers without programmatic JavaScript enforcement). Furthermore, programmatic submission (e.g. tests, scripts, or non-native dispatch) bypasses HTML5 validation.

### 4.2 Application Controller Ingestion (`submitWorkForm`)
- **File:** `js/app.js` (lines 494–498)
- **Observed Code:**
  ```javascript
  const workData = {
      name: nameValue,
      description: (descInput ? descInput.value : '').trim(),
      location: (locInput ? locInput.value : '').trim(),
      date: dateInput.value,
      duration: Number(durInput ? durInput.value : 1) || 1,
      status: statusInput ? statusInput.value : 'folyamatban'
  };
  ```
- **Observed Behavior:** If the user enters `0`, `-5`, `NaN`, `abc`, or an empty string, `Number(...) || 1` silently defaults the duration to `1`.
- **Expected Behavior:** An explicit validation error toast (`⚠️ Az időtartamnak pozitív egész számnak kell lennie (min. 1 nap)!`) should be displayed, and form submission should be rejected. Silently mutating user input from `0` or invalid values to `1` conceals user errors.
- **Severity:** P2 (Usability & Validation Strictness).

### 4.3 Domain Model / Storage Validation (`WorkLogManager.save`)
- **File:** `js/work-log.js` (lines 24–65)
- **Observed Behavior:** `WorkLogManager.save` verifies `if (!work || typeof work !== 'object')` and strictly validates `created_at` (ISO-8601 regex and calendar limits), but **completely lacks duration validation**.
- **Impact:** Any internal service, test script, or plugin calling `workLogManager.save({ name: 'Task', date: '2026-11-10', duration: -100 })` persists negative, zero, or non-numeric durations directly into IndexedDB without error.
- **Expected Behavior:** `WorkLogManager.save` should validate `work.duration`: must be a finite integer `>= 1`. If invalid or missing, throw a descriptive validation error or enforce a safe integer default `>= 1`.
- **Severity:** P2.

### 4.4 Import Pipeline Duration Validation
- **File:** `js/data-export-controller.js` (lines 600–609)
- **Observed Behavior:**
  ```javascript
  let dur = item.duration;
  if (dur !== undefined && dur !== null) {
      if (typeof dur === 'string' && dur.trim() !== '') {
          dur = Number(dur);
      }
      if (typeof dur !== 'number' || !Number.isInteger(dur) || dur < 1) {
          continue;
      }
  } else {
      dur = 1;
  }
  ```
- **Evaluation:** Strict and correct. Fractional numbers, zero, negative numbers, `NaN`, and `Infinity` are rejected individually in `importWorkJson`.
- **Finding:** No defect in `importWorkJson`. However, see Section 6 regarding `restoreBackupData`.

---

## 5. Date Validation and Timezone Findings

### 5.1 Calendar Boundary and Format Validation
- **JSON Import (`importWorkJson`):** Validated using `isValidCalendarDate(item.date)` which enforces `/^(\d{4})-(\d{2})-(\d{2})$/` and checks `Date(year, month - 1, day)` calendar bounds (rejects leap year errors like `2026-02-29` and invalid months like `2026-13-01`).
- **Form Submission (`submitWorkForm`):** Relies on `dateInput.value`. An `<input type="date">` produces valid `YYYY-MM-DD` strings in modern browsers.
- **Manager Validation (`WorkLogManager.save`):** Does not validate `work.date`. If an invalid date string is passed directly to `save()`, it is saved without error.
- **Recommendation:** Add calendar date verification in `WorkLogManager.save` matching `isValidCalendarDate`.

### 5.2 Timezone Shift on Default Date Generation
- **File:** `js/app.js` (line 437)
- **Observed Code:**
  ```javascript
  if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
  }
  ```
- **Observed Behavior:** `new Date().toISOString().split('T')[0]` extracts the **UTC** date, not the user's local date.
- **Impact:** In Hungary (`Europe/Budapest`, UTC+1 standard time, UTC+2 daylight saving time), between 00:00 and 01:00 (or 02:00 in summer), UTC time is still the previous day. For example, opening the modal at 00:30 on November 10 produces `2026-11-09` instead of `2026-11-10`.
- **Expected Behavior:** Derive the default date from the local calendar date:
  ```javascript
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  dateInput.value = `${year}-${month}-${day}`;
  ```
- **Severity:** P3 (Minor Timezone Inconsistency).

### 5.3 Export / Import Date Formatting
- In `exportWorkExcel`, `exportWorkPdf`, and `exportWorkJson`, dates are serialized as plain strings (`w.date || ''`), preventing timezone conversion shifts during export/import cycles.

---

## 6. Import Validation and Data Integrity Findings

### 6.1 Work Log Dedicated Import (`importWorkJson`)
- **Inspection of PR #200 Baseline:**
  - Prototype pollution protection: `dangerousKeys = new Set(['__proto__', 'constructor', 'prototype'])` is strictly applied.
  - Deterministic ID generation: Uses Web Crypto SHA-256 over recursive canonical payload JSON (`imp-<sha256>`), incorporating occurrence indices for identical duplicates in the same file.
  - Partial failure reporting: Catches individual `save()` errors, accumulates failures, and presents a diagnostic summary modal.
  - Ledger isolation: Tested and confirmed that `incomings` is never accessed or mutated.
- **Verdict:** Fully compliant, reliable, and verified.

### 6.2 Full Backup Restore Pipeline (`restoreBackupData`)
- **File:** `js/data-export-controller.js` (lines 250–295)
- **Observed Code:**
  ```javascript
  const tx = dbRaw.transaction([
      'items', 'months', 'entries', 'templates', 'reminders', 'incomings', 'incoming_senders', 'works'
  ], 'readwrite');
  ...
  tx.objectStore('works').clear();
  ...
  data.works?.forEach(work => tx.objectStore('works').put(work));
  ```
- **Observed Behavior:** Unlike `importWorkJson`, `restoreBackupData` does not perform item-level validation on `data.works`. If a corrupted backup JSON containing malformed work items (missing `name`, invalid `date`, negative `duration`, or prototype pollution keys) is restored, it writes those records directly into the `works` object store.
- **Expected Behavior:** Validate each work entry before writing or sanitize records in `restoreBackupData` using the same domain rules as `importWorkJson`.
- **Severity:** P2 (Backup Restore Data Integrity).

---

## 7. Sorting and Consistency Findings

### 7.1 Sorting in `WorkLogManager.load()`
- **File:** `js/work-log.js` (lines 14–20)
- **Observed Code:**
  ```javascript
  async load() {
      const loadedWorks = await this.db.getAll('works') || [];
      // Sort works by created_at timestamp (newer first for display, but keep stable order)
      loadedWorks.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      this.works = loadedWorks;
      return this.works;
  }
  ```
- **Observed Behavior:**
  - The comment states: `(newer first for display, but keep stable order)`.
  - However, `(a.created_at || '').localeCompare(b.created_at || '')` sorts **ascending** (`older first`), which is the exact opposite of "newer first".
  - If `created_at` is missing (legacy records from before v5.2 UUID migration), empty strings result in tie comparisons with no secondary tie-breaking (e.g. by `date` or `id`).
- **Severity:** P2 (Sorting Inversion and Inconsistency).

### 7.2 UI Card and Table View Display
- **File:** `src/WorkAppList.jsx`
- **Observed Behavior:**
  - `WorkAppList` iterates over `filteredWorks` in the order provided by `snapshot?.works`.
  - In Table View, the index column displays `index + 1`. Because the underlying array is sorted oldest-first, record #1 is the oldest recorded entry rather than the most recent work.
  - Search filtering by date (`dateSearch`) uses substring matching: `(w.date || '').includes(dateSearch)`. This functions as expected for `YYYY-MM-DD` inputs.

### 7.3 Export Ordering
- `exportWorkExcel`, `exportWorkPdf`, and `exportWorkJson` use `this.app.workLogManager?.works || []` directly. Their export order directly mirrors the in-memory array. Fixing the sorting in `load()` will automatically correct export ordering.

---

## 8. State Management and Persistence Findings

### 8.1 Atomic Readwrite Transactions in `WorkLogManager.save()`
- **Inspection of PR #200 Baseline:**
  - `WorkLogManager.save()` uses `this.db.runTransaction(['works'], 'readwrite', ...)`.
  - For existing records, it issues `store.get(id)`, preserves the genuine persisted `created_at`, updates `updated_at`, and calls `store.put(recordToPut)`.
  - The transaction aborts cleanly on IDB error.
- **Verdict:** Fully verified.

### 8.2 React Store Synchronization
- **File:** `js/app.js` (lines 510, 542)
- **Observed Behavior:**
  - After `await this.workLogManager.save(...)`, `this.updateReactStore()` is invoked.
  - In `getAppSnapshot()`:
    ```javascript
    works: this.workLogManager?.works || []
    ```
  - `updateReactStore()` publishes a new snapshot to Zustand, triggering immediate re-render of `WorkAppList`.
- **Verdict:** Consistent and reactive.

### 8.3 Deletion Handling
- **File:** `js/app.js` (`deleteWorkLog`) & `js/work-log.js` (`delete`)
- **Observed Behavior:**
  - `deleteWorkLog()` displays a confirmation dialog via `hmiNotif.showConfirm()`.
  - Calls `workLogManager.delete(id)`.
  - `WorkLogManager.delete()` deletes the record from IndexedDB via `this.db.delete('works', id)`, reloads the list via `this.load()`, and calls `this.syncService.push('works', id, true)`.
  - `App` then updates the React store and closes the modal.
- **Verdict:** Consistent and verified.

---

## 9. IndexedDB / Supabase / Offline Findings

### 9.1 IndexedDB Schema
- **File:** `js/oop-core.js` (lines 332–336)
  ```javascript
  if (!db.objectStoreNames.contains('works')) {
      db.createObjectStore('works', { keyPath: 'id' });
  }
  ```
- Uses keyPath `'id'`, matching UUID keys.

### 9.2 Supabase Cloud Schema and Triggers
- **File:** `supabase/migrations/20260712222340_init_schema.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      date TEXT NOT NULL,
      duration NUMERIC DEFAULT 1,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- **Stale Write & Tombstone Protection:** `supabase/migrations/20261028000000_add_stale_write_and_tombstone_protection.sql` binds advisory locks and tombstone triggers to `works`.
- **Finding:** Server-side constraints require `name`, `date`, and `status` to be non-null. If client code sends `null` or missing `status`, Supabase will reject the upsert.

### 9.3 Offline Queue and Reconciliation
- **File:** `js/sync-service.js`
  - In offline mode, `push('works', data, isDelete)` queues operations in `_syncQueue`.
  - On network reconnect or manual sync, `_reloadAndRender()` reloads `workLogManager.load()`.
- **Verdict:** Standardized and robust.

---

## 10. Confirmed Bugs and Reproduction Paths

### Bug 1: Duration Input Fallback Masks Invalid and Zero Durations (P2)
- **Component / File:** `js/app.js` (`submitWorkForm`, line 497)
- **Reproduction:**
  1. Open Work Log module.
  2. Click "Új munka felvitele".
  3. Enter Name: "Tetőszerkezet", Date: "2026-11-10".
  4. Enter Duration: `0` or `-3` (or bypass HTML5 validation via script/dispatch).
  5. Click "Mentés".
- **Observed Result:** The record is saved with `duration: 1` without warning the user that their input was invalid.
- **Expected Result:** Form submission should be blocked and an alert/toast displayed: "Az időtartamnak pozitív egész számnak kell lennie (min. 1 nap)!".

### Bug 2: Inverted Sorting Order in `WorkLogManager.load()` (P2)
- **Component / File:** `js/work-log.js` (`load`, line 17)
- **Reproduction:**
  1. Create Work A with `created_at = "2026-11-01T10:00:00Z"`.
  2. Create Work B with `created_at = "2026-11-05T10:00:00Z"`.
  3. Call `await workLogManager.load()`.
- **Observed Result:** Array order is `[Work A, Work B]`. In `WorkAppList`, Work A (the older work) is displayed at the top and numbered 1.
- **Expected Result:** As stated in the method comment ("newer first for display"), order should be descending by `created_at` (or `date`), placing recent tasks at the top.

### Bug 3: Unvalidated Work Record Ingestion in `restoreBackupData` (P2)
- **Component / File:** `js/data-export-controller.js` (`restoreBackupData`, lines 282–283)
- **Reproduction:**
  1. Prepare a backup JSON with `data.works` containing `{ id: "bad-1", name: "", duration: -50, date: "invalid-date" }`.
  2. Restore backup via "Teljes visszaállítás".
- **Observed Result:** Corrupted work records are written directly to IndexedDB without validation.
- **Expected Result:** Each work item in the backup should be validated against the Work Log schema before insertion.

### Bug 4: UTC Date Shift in Work Modal Default Date (P3)
- **Component / File:** `js/app.js` (`openWorkModal`, line 437)
- **Reproduction:**
  1. Set system local time to 00:30 UTC+1.
  2. Open the "Új munka felvitele" modal.
- **Observed Result:** The date input is prefilled with yesterday's date because `toISOString()` converts to UTC.
- **Expected Result:** Prefilled with the local calendar date.

---

## 11. Risk and Severity Classification (P0/P1/P2/P3)

| Severity | Count | Description |
| :--- | :--- | :--- |
| **P0** | **0** | No system-breaking or financial data corruption defects found. |
| **P1** | **0** | PR #200 fixes remain healthy and verified. |
| **P2** | **3** | Duration fallback masking, inverted load sorting, unvalidated backup restore. |
| **P3** | **4** | UTC date shift on modal init, lack of centralized validator, free-text status vulnerability, unescaped newlines in exports. |

---

## 12. Recommended P2 Fix Plan — Ordered by Priority

When authorized to implement fixes in this session, execute in this order:

1. **Step 1: Create Centralized Work Log Validator Helper (`js/utils/work-validation.js` or within `js/work-log.js`)**
   - Implement `isValidWorkRecord(record, options)` verifying:
     - `name`: non-empty string.
     - `date`: valid `YYYY-MM-DD` calendar date matching `isValidCalendarDate`.
     - `duration`: finite integer `>= 1`.
     - `status`: strictly one of `'folyamatban'`, `'elvégzett'`, `'meghiúsult'`.
     - `created_at`: optional, but if present must be strict ISO-8601 string.
2. **Step 2: Harden `WorkLogManager.save` and `App.prototype.submitWorkForm`**
   - In `submitWorkForm`: Parse duration strictly; if `isNaN(dur) || !Number.isInteger(dur) || dur < 1`, display toast warning and halt submission.
   - In `WorkLogManager.save`: Enforce duration and date validation before persisting.
3. **Step 3: Correct Sorting in `WorkLogManager.load`**
   - Update sort comparator to sort descending (`(b.created_at || '').localeCompare(a.created_at || '')`).
   - Add deterministic secondary tie-breaking by `date` descending, then `id` ascending.
4. **Step 4: Harden Full Backup Restore in `DataExportController.restoreBackupData`**
   - Sanitize and validate `data.works` entries using the validator before calling `tx.objectStore('works').put()`.
5. **Step 5: Fix UTC Date Shift in `App.prototype.openWorkModal`**
   - Format local date using `getFullYear()`, `getMonth()`, `getDate()`.
6. **Step 6: Add Comprehensive Regression Tests in `tests/work-log-p2-fixes.test.jsx`**
   - Test duration validation rejection (0, negative, fractional, NaN, overflow).
   - Test sorting order (newest first, tie-breaking).
   - Test backup restore validation and sanitization.
   - Test local calendar date prefilling.

---

## 13. Regression Test Requirements

The following regression test suites must be maintained and run after any fixes:
1. `tests/work-log-p1-fixes.test.jsx`: Must pass all 7 subtests without modification.
2. `tests/app-submit-work-form.test.jsx`: Must pass all subtests.
3. `tests/work-editor-modal.test.jsx`: Must pass all subtests.
4. New tests to be created in P2 fix phase:
   - Rejection of invalid durations in form submission without silent mutation to 1.
   - Rejection of invalid durations in `WorkLogManager.save`.
   - Reverse chronological sorting in `WorkLogManager.load`.
   - Backup restore filtering of malformed work records.

---

## 14. Out-of-Scope Items

In accordance with mandatory constraints:
- **Time Tracker Integration:** Time Tracker (`js/modules/time-tracker/time-tracker.js`, `TimeTrackerDB`, `TimeTrackerTab.jsx`) is completely isolated and was not modified or linked.
- **Financial Ledger / Incomings:** No modifications or cross-dependencies to `incomings`, `items`, or `entries`.
- **Plugin Architecture:** No changes to plugin subsystems or `plugin_records`.
- **Exchange Rate / Multi-currency:** No currency conversions or currency attributes added to Work Log (Work Log durations are denominated strictly in days).

---

## 15. Final Audit Conclusion

The Work Log module is in a sound state following PR #200. The remaining defects identified in this P2 audit are bounded and actionable:
1. Form submission silently defaulting invalid durations to 1 instead of rejecting.
2. Inverted sorting comparator in `WorkLogManager.load()`.
3. Absence of validation on work records during full backup restore.
4. Minor UTC timezone shift on modal date prefill.

All 4 defects can be resolved cleanly with minimal risk using the recommended fix plan above.
