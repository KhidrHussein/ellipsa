import { useState, useEffect, useCallback } from 'react';
import { actionClient } from '../../services/api';

export interface PendingAction {
    id: string;
    type: 'email' | 'task' | 'other';
    title: string;
    description: string;
    preview?: string;
    status: 'pending_approval' | 'approved' | 'rejected';
    created_at: string;
    metadata?: {
        to?: Array<{ email: string; name?: string }>;
        subject?: string;
        threadId?: string;
        [key: string]: any;
    };
}

interface UsePendingActionsResult {
    actions: PendingAction[];
    loading: boolean;
    error: Error | null;
    refetch: () => void;
    approveAction: (actionId: string) => Promise<boolean>;
}

export function usePendingActions(): UsePendingActionsResult {
    const [actions, setActions] = useState<PendingAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchActions = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await actionClient.getPendingActions();

            if (response.success && response.data) {
                setActions(response.data);
            } else {
                setActions([]);
            }
        } catch (err) {
            console.error('[usePendingActions] Failed to fetch pending actions:', err);
            setError(err instanceof Error ? err : new Error('Failed to fetch pending actions'));
            setActions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const approveAction = useCallback(async (actionId: string): Promise<boolean> => {
        try {
            const action = actions.find(a => a.id === actionId);
            if (!action) return false;

            // For email actions, send the email
            if (action.type === 'email') {
                const response = await actionClient.sendEmail({
                    id: actionId,
                    to: action.metadata?.to || [],
                    subject: action.metadata?.subject || '',
                    body: action.preview || '',
                });

                if (response.success) {
                    // Remove from list on success
                    setActions(prev => prev.filter(a => a.id !== actionId));
                    return true;
                }
            }

            return false;
        } catch (err) {
            console.error('Failed to approve action:', err);
            return false;
        }
    }, [actions]);

    useEffect(() => {
        fetchActions();
    }, [fetchActions]);

    return { actions, loading, error, refetch: fetchActions, approveAction };
}
