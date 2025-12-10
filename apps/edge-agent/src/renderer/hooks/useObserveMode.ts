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
        // @ts-ignore
        if (window.ellipsa?.setObserveStatus) {
            try {
                // @ts-ignore
                await window.ellipsa.setObserveStatus(!isObserving);
                // The listener will update the state
            } catch (e) {
                console.error('Failed to set observe status', e);
            }
        } else {
            // Fallback or dev mode
            console.warn('IPC bridge not available');
            setIsObserving(!isObserving);
        }
    };

    return { isObserving, toggleObserveMode };
}
