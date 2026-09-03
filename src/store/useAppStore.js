import { create } from 'zustand';

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
    isLoaded: false, // Segít a React-nek tudni, hogy megérkeztek-e az első adatok

    // UI Állapotok
    activeTab: 'dashboard',

    // Akció az egész snapshot frissítésére
    setSnapshot: (snapshot) => set({
        ...snapshot,
        isLoaded: true
    }),

    // UI Akciók
    setActiveTab: (tab) => set({ activeTab: tab })
}));
