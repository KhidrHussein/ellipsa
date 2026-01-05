import { useState, useEffect } from 'react';

export function useObserveMode() {
    const [isObserving, setIsObserving] = useState(false);

    useEffect(() => {
        // Initial status check
        const checkStatus = async () => {
            // @ts-ignore
            if (window.ellipsa?.getObserveStatus) {
                try {
                    // @ts-ignore
                    const status = await window.ellipsa.getObserveStatus();
                    setIsObserving(status.observing);
                } catch (e) {
                    console.error('Failed to get observe status', e);
                }
            }
        };
        checkStatus();

        // Listener
        // @ts-ignore
        if (window.ellipsa?.onObserveStatus) {
            // @ts-ignore
            window.ellipsa.onObserveStatus((observing: boolean) => {
                setIsObserving(observing);
            });
        }
    }, []);

    const toggleObserveMode = async () => {
        // Optimistic update
        const newState = !isObserving;
        setIsObserving(newState);

        // @ts-ignore
        if (window.ellipsa?.setObserveStatus) {
            try {
                // @ts-ignore
                await window.ellipsa.setObserveStatus(newState);
                // The listener will confirm the state, but we handled the immediate feedback
            } catch (e) {
                console.error('Failed to set observe status', e);
                // Revert on error
                setIsObserving(!newState);
                // @ts-ignore
                if (window.ellipsa?.onObserveStatus) {
                    // Force re-sync
                    // @ts-ignore
                    const status = await window.ellipsa.getObserveStatus();
                    setIsObserving(status.observing);
                }
            }
        } else {
            // Fallback or dev mode
            console.warn('IPC bridge not available');
            // State already set optimistically
        }
    };

    return { isObserving, toggleObserveMode };
}
