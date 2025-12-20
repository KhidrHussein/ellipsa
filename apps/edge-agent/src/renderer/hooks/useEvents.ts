import { useState, useEffect, useCallback } from 'react';
import { memoryClient } from '../../services/api';

export interface TimelineEvent {
    id: string;
    type: string;
    title: string;
    summary?: string;
    start_time: string;
    end_time?: string;
    participants?: Array<{
        entity_id: string;
        name: string;
        role?: string;
    }>;
    metadata?: {
        tone?: { label: string; confidence: number };
        action_items?: Array<{
            id: string;
            text: string;
            owner: string;
            status: string;
            due?: string;
        }>;
    };
}

interface UseEventsOptions {
    type?: 'meeting' | 'email' | 'task' | 'all';
    limit?: number;
}

interface UseEventsResult {
    events: TimelineEvent[];
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

import { realtimeService } from '../../services/RealtimeService';

export function useEvents(options: UseEventsOptions = {}): UseEventsResult {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let response;
            if (options.type === 'task') {
                response = await memoryClient.getTasks({
                    limit: options.limit || 50,
                });
            } else {
                response = await memoryClient.getEvents({
                    type: options.type !== 'all' ? options.type : undefined,
                    limit: options.limit || 50,
                });
            }

            if (response.success && response.data) {
                // Transform backend data to frontend format
                const transformedEvents = response.data.map((event: any) => ({
                    id: event.id,
                    type: event.type || (options.type === 'task' ? 'task' : 'meeting'),
                    title: event.title || event.summary?.slice(0, 50) || 'Untitled Event',
                    summary: event.summary,
                    start_time: event.start_time || event.due_date || event.created_at || new Date().toISOString(),
                    end_time: event.end_time,
                    participants: event.participants || [],
                    metadata: {
                        tone: event.metadata?.tone,
                        action_items: event.metadata?.action_items || [],
                    },
                }));
                setEvents(transformedEvents);
            } else {
                setEvents([]);
            }
        } catch (err) {
            console.error('[useEvents] Failed to fetch events:', err);
            setError(err instanceof Error ? err : new Error('Failed to fetch events'));
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, [options.type, options.limit]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // specific effect for realtime updates
    useEffect(() => {
        const handleNewEvent = (data: any) => {
            // We can optimize by appending if logic allows, but refetch is safer for order/filtering
            console.log('[useEvents] New event received, refreshing...');
            fetchEvents();
        };

        realtimeService.on('event_created', handleNewEvent);
        return () => {
            realtimeService.off('event_created', handleNewEvent);
        };
    }, [fetchEvents]);

    return { events, loading, error, refetch: fetchEvents };
}
