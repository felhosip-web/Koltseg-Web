// js/sync-report.js - Szinkronizáció eredményét prezentáló réteg (UI-független)

export class SyncReport {
    /**
     * @param {Object} options
     */
    constructor(options = {}) {
        this.status = options.status || 'success'; // 'success' | 'partial' | 'critical'
        this.startTime = options.startTime || new Date().toISOString();
        this.endTime = options.endTime || new Date().toISOString();
        this.duration = options.duration || '0 s';
        this.tables = options.tables || {};
        this.queue = options.queue || { processed: 0, success: 0, failed: 0, pending: 0 };
        this.conflictsCount = options.conflictsCount ?? 0;
        this.deletionsCount = options.deletionsCount ?? 0;
        this.errors = options.errors || [];
        this.failedTables = options.failedTables || [];
        this.checkpointStatus = options.checkpointStatus || (this.status === 'success' ? 'updated' : 'unchanged');
        this.lastSuccessfulSync = options.lastSuccessfulSync || null;
        this.rawResults = options.rawResults || null;
    }

    /**
     * Factory metódus normál/részleges sync eredményből
     * @param {Object} results SyncService.sync() results objektum
     * @param {Object} syncService SyncService referencia (opcionális, kontextushoz)
     */
    static fromResults(results, syncService = null) {
        if (!results) {
            return new SyncReport({ status: 'critical', errors: [{ error: 'Nincs elérhető eredmény' }] });
        }

        const errors = results.errors || [];
        const status = errors.length === 0 ? 'success' : 'partial';

        // Táblák statisztikáinak előkészítése
        const tables = {};
        const failedTablesSet = new Set();
        let totalPushed = 0;
        let totalPulledTables = 0;

        const rawTables = results.tables || {};
        for (const [table, data] of Object.entries(rawTables)) {
            const pulled = data.pulled ?? 0;
            const merged = data.merged ?? 0;
            const pushed = data.pushed ?? 0;
            const error = data.error || null;

            if (error) {
                failedTablesSet.add(table);
            } else if (data.pulled !== undefined) {
                totalPulledTables++;
            }

            totalPushed += pushed;

            tables[table] = {
                pulled,
                merged,
                pushed,
                error
            };
        }

        // Egyéb hibákból is gyűjtünk failedTable-t
        for (const errItem of errors) {
            if (errItem.table) {
                failedTablesSet.add(errItem.table);
            }
        }

        const failedTables = Array.from(failedTablesSet);

        // Queue adatok
        let queueStatus = { processed: results.queueProcessed || 0, success: results.queueProcessed || 0, failed: 0, pending: 0 };
        if (syncService && typeof syncService.getQueueStatus === 'function') {
            const currentQueue = syncService.getQueueStatus();
            queueStatus = {
                processed: results.queueProcessed || 0,
                success: Math.max(0, (results.queueProcessed || 0) - (currentQueue.failed || 0)),
                failed: currentQueue.failed || 0,
                pending: currentQueue.pending || 0
            };
        }

        // Konfliktusok száma
        let conflictsCount = 0;
        if (syncService) {
            conflictsCount = (syncService.lastSyncConflicts || syncService.currentSyncConflicts || []).length;
        }

        // Törlések száma (deleted_records pull/merged/pushed vagy tombstone feldolgozás)
        let deletionsCount = 0;
        if (rawTables.deleted_records) {
            deletionsCount = rawTables.deleted_records.pulled || rawTables.deleted_records.merged || 0;
        }

        // Checkpoint státusz: sikeres sync esetén 'updated', különben 'unchanged'
        const checkpointStatus = status === 'success' ? 'updated' : 'unchanged';

        // Utolsó sikeres checkpoint időpontja
        let lastSuccessfulSync = null;
        if (syncService?.lastSyncTime) {
            lastSuccessfulSync = syncService.lastSyncTime instanceof Date
                ? syncService.lastSyncTime.toISOString()
                : syncService.lastSyncTime;
        }

        // Duration formázása
        let durationFormatted = results.duration || '0 s';
        if (typeof durationFormatted === 'string' && !durationFormatted.endsWith('s')) {
            durationFormatted += ' s';
        } else if (typeof durationFormatted === 'string') {
            durationFormatted = durationFormatted.replace('s', ' s').trim();
        }

        return new SyncReport({
            status,
            startTime: results.startTime || new Date().toISOString(),
            endTime: results.endTime || new Date().toISOString(),
            duration: durationFormatted,
            tables,
            queue: queueStatus,
            conflictsCount,
            deletionsCount,
            errors,
            failedTables,
            checkpointStatus,
            lastSuccessfulSync,
            rawResults: results
        });
    }

    /**
     * Factory metódus kritikus kivétel / megszakadt sync esetén
     * @param {Error|Object|string} error Kivétel vagy hibaüzenet
     * @param {string} startTime Kezdési időpont ISO
     * @param {Object} syncService SyncService referencia (opcionális)
     */
    static fromCriticalError(error, startTime = new Date().toISOString(), syncService = null) {
        const endTime = new Date().toISOString();
        const startMs = new Date(startTime).getTime();
        const endMs = new Date(endTime).getTime();
        const durationSec = Math.max(0, (endMs - startMs) / 1000).toFixed(1);

        const errorMsg = typeof error === 'string'
            ? error
            : (error?.message || 'Kritikus hiba történt a szinkronizáció során');

        let lastSuccessfulSync = null;
        if (syncService?.lastSyncTime) {
            lastSuccessfulSync = syncService.lastSyncTime instanceof Date
                ? syncService.lastSyncTime.toISOString()
                : syncService.lastSyncTime;
        }

        return new SyncReport({
            status: 'critical',
            startTime,
            endTime,
            duration: `${durationSec} s`,
            tables: {},
            queue: { processed: 0, success: 0, failed: 0, pending: 0 },
            conflictsCount: 0,
            deletionsCount: 0,
            errors: [{ error: errorMsg }],
            failedTables: [],
            checkpointStatus: 'unchanged',
            lastSuccessfulSync
        });
    }

    /**
     * Rövid, ember számára olvasható tömör összefoglaló az Event Log számára
     * @returns {string}
     */
    toEventLogSummary() {
        const lines = ['SYNC'];

        if (this.status === 'success') {
            lines.push(`Szinkronizáció sikeres – ${this.duration}`);

            const tableCount = Object.keys(this.tables).filter(t => t !== 'deleted_records').length;
            lines.push(`Pull: ${tableCount} tábla`);

            const totalPushed = Object.values(this.tables).reduce((sum, t) => sum + (t.pushed || 0), 0);
            lines.push(`Push: ${totalPushed} rekord`);

            lines.push(`Queue: ${this.queue.processed} feldolgozva`);
            lines.push(`Konfliktus: ${this.conflictsCount}`);
            lines.push(`Hiba: ${this.errors.length}`);

        } else if (this.status === 'partial') {
            lines.push(`Részleges szinkronizáció – ${this.duration}`);

            const pullErrors = this.errors.filter(e => e.operation === 'pull').map(e => e.table).filter(Boolean);
            if (pullErrors.length > 0) {
                lines.push(`Pull hiba: ${pullErrors.join(', ')}`);
            }

            const pushErrors = this.errors.filter(e => e.operation === 'push').map(e => e.table).filter(Boolean);
            if (pushErrors.length > 0) {
                lines.push(`Push hiba: ${pushErrors.join(', ')}`);
            }

            const queueTotal = this.queue.processed + this.queue.failed;
            if (queueTotal > 0) {
                lines.push(`Queue: ${this.queue.success}/${queueTotal}`);
            } else {
                lines.push(`Queue: ${this.queue.processed} feldolgozva`);
            }

            lines.push(`Checkpoint: nem frissült`);

        } else { // critical
            lines.push(`Szinkronizáció megszakadt`);
            const firstErr = this.errors[0]?.error || 'Ismeretlen hiba';
            lines.push(`Hiba: ${firstErr}`);
            lines.push(`Checkpoint: nem frissült`);
        }

        return lines.join('\n');
    }

    /**
     * Prezentációs struktúra a Modal UI kirendereléséhez
     */
    toModalData() {
        const formatTime = (iso) => {
            if (!iso) return 'N/A';
            try {
                const d = new Date(iso);
                return d.toLocaleTimeString('hu-HU');
            } catch (e) {
                return iso;
            }
        };

        const formatDateTime = (iso) => {
            if (!iso) return 'N/A';
            try {
                const d = new Date(iso);
                return d.toLocaleDateString('hu-HU') + ' ' + d.toLocaleTimeString('hu-HU');
            } catch (e) {
                return iso;
            }
        };

        return {
            status: this.status,
            statusBadgeText: this.status === 'success'
                ? '✓ Sikeres'
                : (this.status === 'partial' ? '⚠ RÉSZLEGES SZINKRONIZÁCIÓ' : '✕ SZINKRONIZÁCIÓ MEGSZAKADT'),
            startTimeFormatted: formatTime(this.startTime),
            endTimeFormatted: formatTime(this.endTime),
            durationFormatted: this.duration,
            tables: this.tables,
            queue: this.queue,
            conflictsCount: this.conflictsCount,
            deletionsCount: this.deletionsCount,
            errors: this.errors,
            failedTables: this.failedTables,
            checkpointStatus: this.checkpointStatus,
            lastSuccessfulSyncFormatted: formatDateTime(this.lastSuccessfulSync)
        };
    }
}
