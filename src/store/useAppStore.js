import { create } from 'zustand';
import { appService } from '../services/appService.js';

export const useAppStore = create((set) => ({
    // Kezdeti üres állapot (amíg a Vanilla JS be nem tölti az adatokat)
    entries: [],
    items: [],
    months: [],
    incomings: [],
    reminders: [],
    notes: [],
    calendarEvents: [],
    shoppingItems: [],
    fuelLogs: [],
    dayjs: null,
    eurRate: 400,
    lastSyncTime: null,
    isLoaded: false, // Segít a React-nek tudni, hogy megérkeztek-e az első adatok

    // UI Állapotok
    activeTab: 'dashboard',

    // Akció az egész snapshot frissítésére
    setSnapshot: (snapshot) => set({
        ...snapshot,
        isLoaded: true
    }),

    // UI Akciók
    setActiveTab: (tab) => set({ activeTab: tab }),
    setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
    generateTestData: async (count = 30) => {
        await appService.generateTestData(count);
    }
}));
