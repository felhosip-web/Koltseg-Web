// js/db.js - Dexie based database for modules like Time Tracker

const db = new window.Dexie('TimeTrackerDB');

db.version(2).stores({
    projects: '++id, name',
    timeEntries: '++id, projectId, date, createdAt'
});

// Expose db globally for React components
window.db = db;

export { db };
