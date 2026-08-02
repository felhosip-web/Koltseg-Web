import fs from 'fs';

const oopCore = fs.readFileSync('js/oop-core.js', 'utf8');
const syncService = fs.readFileSync('js/sync-service.js', 'utf8');

// We just want to know where syncService.push is called in loops, or if there's any other push
console.log("Checking push calls...");
