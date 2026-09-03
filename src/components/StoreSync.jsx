import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore.js';

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
        const syncData = () => {
            if (window.app && typeof window.app.getAppSnapshot === 'function') {
                const snapshot = window.app.getAppSnapshot();
                setSnapshot(snapshot);
            }
        };

        // Initial sync on mount if app is already loaded
        if (window.app && window.app.isBooted) {
            syncData();
        }

        // Handle custom subscribe method if implemented in Vanilla, else fallback to DOM event
        let unsubscribe = null;
        if (window.app && typeof window.app.subscribeAppData === 'function') {
            unsubscribe = window.app.subscribeAppData(syncData);
        } else {
            window.addEventListener('app-data-updated', syncData);
            unsubscribe = () => window.removeEventListener('app-data-updated', syncData);
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [setSnapshot]);

    return null; // This is a headless component, it renders nothing.
}
