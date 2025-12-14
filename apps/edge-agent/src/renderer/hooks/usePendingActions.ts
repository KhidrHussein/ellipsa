import { useState, useEffect, useCallback } from 'react';
import { actionClient } from '../../services/api';

export interface PendingAction {
    id: string;
    type: 'email' | 'task' | 'browser' | 'desktop' | 'generic';
    title: string;
    description: string;
    preview?: string;
    status: 'pending_approval' | 'approved' | 'rejected';
    created_at: string;
    plan?: any[]; // Full action plan for generic actions
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
                if (response.success && response.data) {
                    setActions(response.data);
                } else {
                    setActions([]);
                }
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

            // For email actions, send the email (Legacy flow)
            if (action.type === 'email') {
                const response = await actionClient.sendEmail({
                    id: actionId,
                    to: action.metadata?.to?.map(t => t.email || t) || [],
                    subject: action.metadata?.subject || 'No Subject',
                    body: action.preview || ' ',
                });

                if (response.success) {
                    setActions(prev => prev.filter(a => a.id !== actionId));
                    return true;
                }
            } else if (action.plan) {
                // For generic actions with a plan, execute the plan
                console.log(`[usePendingActions] Executing generic action: ${action.title}`);
                const response = await actionClient.executeAction({
                    plan: action.plan,
                    agent_id: 'edge-agent',
                    provenance: {
                        source: 'user_approval',
                        timestamp: new Date().toISOString(),
                        user_id: 'user', // TODO: Get actual user ID
                    }
                });

                if (response.status === 'completed' || response.status === 'success') {
                    setActions(prev => prev.filter(a => a.id !== actionId));
                    return true;
                } else {
                    console.error('[usePendingActions] Action execution failed or incomplete:', response);
                    throw new Error(`Action execution failed: ${response.status}`);
                }
            } else {
                console.warn('[usePendingActions] Action has no plan and is not an email:', action);
                return false;
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
