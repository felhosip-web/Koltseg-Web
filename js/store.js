// js/store.js - Zustand Central Store & Automated IndexedDB persistence
import { createStore } from './libs/zustand.js';

// Központi állapotok
export const useAppStore = createStore((set, get) => ({
    items: [],
    months: [],
    entries: [],
    templates: [],
    reminders: [],
    incomings: [],
    senders: [],
    works: [],

    // Setters
    setItems: (items) => set({ items }),
    setMonths: (months) => set({ months }),
    setEntries: (entries) => set({ entries }),
    setTemplates: (templates) => set({ templates }),
    setReminders: (reminders) => set({ reminders }),
    setIncomings: (incomings) => set({ incomings }),
    setSenders: (senders) => set({ senders }),
    setWorks: (works) => set({ works }),
}));

// Bootstrapping flag a kezdeti betöltés és backup visszaállítás alatti redundáns írások elkerülésére
let isBootstrapping = true;

/**
 * Bootstrapping mód beállítása
 * @param {boolean} val - Bootstrapping állapot
 */
export function setBootstrapping(val) {
    isBootstrapping = !!val;
    console.log(`[STORE] Bootstrapping mód: ${isBootstrapping}`);
}

/**
 * Bootstrapping mód lekérdezése
 * @returns {boolean} Az aktuális bootstrapping állapot
 */
export function getBootstrapping() {
    return isBootstrapping;
}

/**
 * Zustand állapotváltozások szinkronizálása IndexedDB-be
 * @param {string} table - A tábla neve
 * @param {Array} newArray - Az új adatok tömbje
 * @param {Array} oldArray - A régi adatok tömbje
 * @param {string} keyField - A kulcs mező neve (alapértelmezett: 'id')
 * @returns {Promise<void>}
 */
async function syncTableToIndexedDB(table, newArray, oldArray, keyField = 'id') {
    if (isBootstrapping) return;
    const db = window.__globalDb || window.app?.db;
    if (!db) {
        console.warn(`[STORE AUTO-SAVE] Nem sikerült menteni a(z) ${table} táblába: nincs adatbázis kapcsolat.`);
        return;
    }

    try {
        const oldMap = new Map((oldArray || []).map(item => {
            const key = typeof item === 'object' && item !== null ? item[keyField] : item;
            return [key, item];
        }));

        const newMap = new Map((newArray || []).map(item => {
            const key = typeof item === 'object' && item !== null ? item[keyField] : item;
            return [key, item];
        }));

        // 1. Törölt elemek keresése és törlése IndexedDB-ből
        for (const item of (oldArray || [])) {
            const key = typeof item === 'object' && item !== null ? item[keyField] : item;
            if (key !== undefined && key !== null && !newMap.has(key)) {
                console.log(`[STORE AUTO-SAVE] 🗑️ Automatikus törlés IndexedDB-ből: ${table} -> ${key}`);
                await db._directDelete(table, key);
            }
        }

        // 2. Új vagy módosított elemek mentése IndexedDB-be
        for (const item of (newArray || [])) {
            const key = typeof item === 'object' && item !== null ? item[keyField] : item;
            if (key !== undefined && key !== null) {
                const oldItem = oldMap.get(key);

                // Normalizáljuk az összehasonlítandó objektumokat (belső metaadatok nélkül)
                const itemNorm = typeof item === 'object' && item !== null ? item : { [keyField]: item };

                if (!oldItem || JSON.stringify(itemNorm) !== JSON.stringify(oldItem)) {
                    console.log(`[STORE AUTO-SAVE] 💾 Automatikus mentés IndexedDB-be: ${table} -> ${key}`);
                    await db.save(table, itemNorm);
                }
            }
        }
    } catch (err) {
        console.error(`[STORE AUTO-SAVE] Hiba a(z) ${table} tábla szinkronizációja közben:`, err);
    }
}

// Zustand store változások figyelése (subscribe)
useAppStore.subscribe(async (state, prevState) => {
    if (isBootstrapping) return;

    // Items
    if (state.items !== prevState.items) {
        await syncTableToIndexedDB('items', state.items, prevState.items, 'id');
    }
    // Months
    if (state.months !== prevState.months) {
        // Hónapok esetén a lista stringekből áll (pl: ['2026-07']), így objektummá kell alakítani a mentéshez
        const newMonthsObj = (state.months || []).map(m => typeof m === 'object' ? m : { month: m });
        const oldMonthsObj = (prevState.months || []).map(m => typeof m === 'object' ? m : { month: m });
        await syncTableToIndexedDB('months', newMonthsObj, oldMonthsObj, 'month');
    }
    // Entries
    if (state.entries !== prevState.entries) {
        await syncTableToIndexedDB('entries', state.entries, prevState.entries, 'id');
    }
    // Templates
    if (state.templates !== prevState.templates) {
        await syncTableToIndexedDB('templates', state.templates, prevState.templates, 'id');
    }
    // Reminders
    if (state.reminders !== prevState.reminders) {
        await syncTableToIndexedDB('reminders', state.reminders, prevState.reminders, 'id');
    }
    // Incomings
    if (state.incomings !== prevState.incomings) {
        await syncTableToIndexedDB('incomings', state.incomings, prevState.incomings, 'id');
    }
    // Senders (incoming_senders)
    if (state.senders !== prevState.senders) {
        await syncTableToIndexedDB('incoming_senders', state.senders, prevState.senders, 'id');
    }
    // Works
    if (state.works !== prevState.works) {
        await syncTableToIndexedDB('works', state.works, prevState.works, 'id');
    }
});

/**
 * Globális adatbázis példány beállítása
 * @param {Object} db - Az adatbázis példány
 */
export function setGlobalDb(db) {
    window.__globalDb = db;
}
