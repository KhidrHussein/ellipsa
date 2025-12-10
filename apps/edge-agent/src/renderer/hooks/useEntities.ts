import { useState, useEffect, useCallback } from 'react';
import { memoryClient } from '../../services/api';
import { TimelineEvent } from './useEvents';

export interface Entity {
    id: string;
    name: string;
    type: string;
    metadata?: {
        role?: string;
        company?: string;
        email?: string;
        phone?: string;
        relationship_summary?: string;
        last_interaction?: string;
    };
    recent_events?: TimelineEvent[];
}

interface UseEntityResult {
    entity: Entity | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function useEntity(entityId: string | null): UseEntityResult {
    const [entity, setEntity] = useState<Entity | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchEntity = useCallback(async () => {
        if (!entityId) {
            setEntity(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await memoryClient.getEntity(entityId);

            if (response.success && response.data) {
                setEntity(response.data);
            } else {
                setEntity(null);
            }
        } catch (err) {
            console.error('Failed to fetch entity:', err);
            setError(err instanceof Error ? err : new Error('Failed to fetch entity'));
            setEntity(null);
        } finally {
            setLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchEntity();
    }, [fetchEntity]);

    return { entity, loading, error, refetch: fetchEntity };
}
