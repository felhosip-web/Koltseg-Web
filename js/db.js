// js/db.js - Dexie based database for modules like Time Tracker

const db = new window.Dexie('TimeTrackerDB');

db.version(1).stores({
    projects: 'id, name, client, hourlyRate, color, created',
    timeEntries: 'id, projectId, task, date, start, end, durationMin, hourlyRateUsed, earnings, billable, created'
});

export { db };
