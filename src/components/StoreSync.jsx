import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { appService } from '../services/appService.js';

/**
 * Headless component that provides initial React Zustand store hydration
 * upon component mount if the application is already booted.
 * 
 * Subsequent application state updates are driven deterministically by
 * domain mutations calling App.prototype.updateReactStore().
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
