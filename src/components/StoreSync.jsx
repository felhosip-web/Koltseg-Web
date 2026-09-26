import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { appService } from '../services/appService.js';

/**
 * Headless component that acts as a bridge between the old Vanilla JS OOP-Core
 * and the new React Zustand store.
 * 
 * It listens to the 'app-data-updated' event dispatched by Vanilla JS,
 * retrieves the data snapshot, and injects it into the Zustand store.
 * By mounting this component once at the root level, all other React components
 * can simply read from the Zustand store without worrying about Vanilla JS.
 */
export default function StoreSync() {
    const setSnapshot = useAppStore(state => state.setSnapshot);

    useEffect(() => {
        // Initial sync on mount if app is already loaded
        const snapshot = appService.getInitialSnapshot();
        if (snapshot) {
            setSnapshot(snapshot);
        }
    }, [setSnapshot]);

    return null; // This is a headless component, it renders nothing.
}
