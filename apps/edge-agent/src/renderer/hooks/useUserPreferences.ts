import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:4001/api/v1';

export interface UserPreferences {
    briefingFormat?: 'audio' | 'text';
    primaryFocus?: string;
    lastCalibrated?: string;
}

export function useUserPreferences() {
    const [preferences, setPreferences] = useState<UserPreferences>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPreferences() {
            try {
                setLoading(true);
                const response = await fetch(`${API_URL}/user/preferences`);
                const data = await response.json();

                if (data?.success && data?.data?.preferences) {
                    setPreferences(data.data.preferences);
                }
            } catch (err) {
                console.error('Failed to fetch user preferences:', err);
                setError('Failed to load preferences');
            } finally {
                setLoading(false);
            }
        }

        fetchPreferences();
    }, []);

    return { preferences, loading, error };
}
