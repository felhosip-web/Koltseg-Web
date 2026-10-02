// js/db.js - Dexie based database for modules like Time Tracker
import Dexie from 'dexie';

const DexieClass = typeof window !== 'undefined' && window.Dexie ? window.Dexie : Dexie;
const db = new DexieClass('TimeTrackerDB');

db.version(2).stores({
    projects: '++id, name',
    timeEntries: '++id, projectId, date, createdAt'
});

// Expose db globally for React components
if (typeof window !== 'undefined') {
    window.db = db;
}

export { db };
