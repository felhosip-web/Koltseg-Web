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
        let workToSave = { ...work };
        if (!workToSave.id) {
            // New entry - generate UUID
            workToSave.id = generateUUID();
            workToSave.created_at = workToSave.created_at || new Date().toISOString();
        } else {
            // Editing existing entry - retrieve persisted record directly from database adapter
            let existing = null;
            if (this.db) {
                if (typeof this.db.get === 'function') {
                    existing = await this.db.get('works', workToSave.id);
                } else if (typeof this.db.getAll === 'function') {
                    const allPersisted = await this.db.getAll('works');
                    existing = (allPersisted || []).find(w => String(w.id) === String(workToSave.id)) || null;
                }
            }

            if (existing) {
                // The original persisted created_at value must take precedence over any timestamp supplied by an edited object
                const originalCreatedAt = existing.created_at;
                workToSave = {
                    ...existing,
                    ...workToSave
                };
                if (originalCreatedAt !== undefined) {
                    workToSave.created_at = originalCreatedAt;
                } else {
                    delete workToSave.created_at;
                }
            }
        }
        workToSave.updated_at = new Date().toISOString();
        
        await this.db.save('works', workToSave);
        await this.load();
        if (this.syncService && typeof this.syncService.push === 'function') {
            try {
                await this.syncService.push('works', workToSave);
            } catch (err) {
                console.warn('[WorkLogManager] Nem sikerült a felhőbe szinkronizálni:', err);
            }
        }
        return workToSave;
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
