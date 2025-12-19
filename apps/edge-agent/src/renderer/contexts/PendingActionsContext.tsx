import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { actionClient } from '../../services/api';

export interface PendingAction {
    id: string;
    type: 'email' | 'task' | 'browser' | 'desktop' | 'generic';
    title: string;
    description: string;
    preview?: string;
    status: 'pending_approval' | 'approved' | 'rejected';
    created_at: string;
    plan?: any[];
    metadata?: {
        to?: Array<{ email: string; name?: string }>;
        subject?: string;
        threadId?: string;
        [key: string]: any;
    };
}

interface PendingActionsContextType {
    actions: PendingAction[];
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    approveAction: (actionId: string) => Promise<boolean>;
    discardAction: (actionId: string) => Promise<boolean>;
}

const PendingActionsContext = createContext<PendingActionsContextType | undefined>(undefined);

export function PendingActionsProvider({ children }: { children: React.ReactNode }) {
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
            console.error('[PendingActionsContext] Failed to fetch actions:', err);
            setError(err instanceof Error ? err : new Error('Failed to fetch actions'));
            setActions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchActions();

        // Optional: Poll every 30s to keep in sync if backend adds new items
        const timer = setInterval(fetchActions, 30000);
        return () => clearInterval(timer);
    }, [fetchActions]);

    const discardAction = useCallback(async (actionId: string): Promise<boolean> => {
        try {
            const action = actions.find(a => a.id === actionId);
            if (!action) return false;

            if (action.type === 'email') {
                await actionClient.deleteDraft(actionId);
                // Optimistically update state
                setActions(prev => prev.filter(a => a.id !== actionId));
                return true;
            }
            return false;
        } catch (err) {
            console.error('Failed to discard action:', err);
            // Revert or re-fetch on error could be added here
            fetchActions();
            return false;
        }
    }, [actions, fetchActions]);

    const approveAction = useCallback(async (actionId: string): Promise<boolean> => {
        try {
            const action = actions.find(a => a.id === actionId);
            if (!action) return false;

            let success = false;

            if (action.type === 'email') {
                const response = await actionClient.sendEmail({
                    id: actionId,
                    to: action.metadata?.to?.map((t: any) => t.email || t) || [],
                    subject: action.metadata?.subject || 'No Subject',
                    body: action.preview || ' ',
                });
                success = response.success;
            } else if (action.plan) {
                const response = await actionClient.executeAction({
                    plan: action.plan,
                    agent_id: 'edge-agent',
                    provenance: {
                        source: 'user_approval',
                        timestamp: new Date().toISOString(),
                        user_id: 'user',
                    }
                });
                success = (response.status === 'completed' || response.status === 'success');
            }

            if (success) {
                setActions(prev => prev.filter(a => a.id !== actionId));
                return true;
            }

            return false;
        } catch (err) {
            console.error('Failed to approve action:', err);
            return false;
        }
    }, [actions]);

    return (
        <PendingActionsContext.Provider value={{
            actions,
            loading,
            error,
            refetch: fetchActions,
            approveAction,
            discardAction
        }}>
            {children}
        </PendingActionsContext.Provider>
    );
}

export function usePendingActions() {
    const context = useContext(PendingActionsContext);
    if (context === undefined) {
        throw new Error('usePendingActions must be used within a PendingActionsProvider');
    }
    return context;
}
