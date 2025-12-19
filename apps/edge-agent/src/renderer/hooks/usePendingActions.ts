import { usePendingActions as useContextPendingActions, PendingAction } from '../contexts/PendingActionsContext';

export type { PendingAction };

export function usePendingActions() {
    return useContextPendingActions();
}
