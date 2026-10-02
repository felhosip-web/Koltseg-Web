// js/work-log.js - v5.2.0 - Munka nyilvántartó modul (UUID)
import { generateUUID } from './uuid-utils.js';

export class WorkLogManager {
    constructor(db, syncService) {
        this.db = db;
        this.syncService = syncService;
        this.works = [];
    }

    /**
     * Load all works from database
     */
    async load() {
        const loadedWorks = await this.db.getAll('works') || [];
        // Sort works by created_at timestamp (newer first for display, but keep stable order)
        loadedWorks.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        this.works = loadedWorks;
        return this.works;
    }

    /**
     * Save a work log entry
     */
    async save(work) {
        if (!work.id) {
            // New entry - generate UUID
            work.id = generateUUID();
            work.created_at = new Date().toISOString();
        }
        work.updated_at = new Date().toISOString();
        
        await this.db.save('works', work);
        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', work);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a felhőbe szinkronizálni:', err);
            }
        }
        return work;
    }

    /**
     * Delete a work log entry
     */
    async delete(id) {
        await this.db.delete('works', id);
        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', id, true);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a törlést felhőbe szinkronizálni:', err);
            }
        }
    }
}
