import { ExecutionResult, ActionPlan, Provenance } from '../schemas/action.schema.js';
import { MemoryClient } from '@ellipsa/shared';

/**
 * ActionHistoryService logs all action executions with provenance tracking
 * Provides history queries, replay, and retention management
 */
export class ActionHistoryService {
    private history: Map<string, ActionHistoryEntry> = new Map();
    private maxHistorySize = 10000;
    private retentionDays = 30;
    private memoryClient?: MemoryClient;

    constructor(memoryClient?: MemoryClient) {
        this.memoryClient = memoryClient;
    }

    /**
     * Log an action execution
     */
    async logAction(
        actionId: string,
        plan: ActionPlan,
        result: ExecutionResult,
        context: {
            userId?: string;
            originEventId?: string;
            promptId?: string;
            source?: string;
        }
    ): Promise<void> {
        const entry: ActionHistoryEntry = {
            actionId,
            plan,
            result,
            provenance: {
                origin_event_id: context.originEventId,
                prompt_id: context.promptId,
                user_id: context.userId,
                source: context.source || 'manual',
                timestamp: new Date().toISOString(),
            },
            loggedAt: new Date(),
        };

        this.history.set(actionId, entry);

        // Log to console
        console.log(`[ActionHistory] Logged action ${actionId}: ${result.status} (${result.steps.length} steps)`);

        // Persist to Memory Service
        if (this.memoryClient) {
            try {
                await this.persistToMemory(entry);
            } catch (error) {
                console.error(`[ActionHistory] Failed to persist action ${actionId} to memory:`, error);
                // Don't fail the action just because memory logging failed
            }
        }

        // Cleanup old entries if needed
        if (this.history.size > this.maxHistorySize) {
            await this.cleanup();
        }
    }

    /**
     * Persist action entry to Memory Service
     */
    private async persistToMemory(entry: ActionHistoryEntry): Promise<void> {
        if (!this.memoryClient) return;

        const { actionId, plan, result, provenance } = entry;
        const userId = provenance.user_id || 'unknown_user';

        // Extract action title/goal
        let actionTitle = plan.goal;
        if (!actionTitle && plan.plan.length > 0) {
            const firstAction = plan.plan[0];
            // Generate a fallback title like "Open App: Chrome" or "Type Text"
            // Convert snake_case to Title Case
            const opName = firstAction.op.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            if ('app' in firstAction.args) {
                actionTitle = `${opName}: ${firstAction.args.app}`;
            } else if ('url' in firstAction.args) {
                actionTitle = `${opName}: ${firstAction.args.url}`;
            } else {
                actionTitle = opName;
            }
        }

        const finalTitle = actionTitle || 'System Action';

        // Extract providers used
        const providers = new Set(plan.plan.map(a => a.provider));

        // Create participants list (User + Providers)
        const participants = [
            {
                entity_id: userId,
                name: 'User', // In a real app, we'd fetch the user's name
                metadata: { role: 'user' }
            }
        ];

        // Add providers as participants
        for (const provider of providers) {
            if (provider) {
                participants.push({
                    entity_id: `provider:${provider}`,
                    name: provider,
                    metadata: { role: 'provider' }
                });
            }
        }

        // Construct content summary
        const statusEmoji = result.status === 'completed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
        const content = `${statusEmoji} Action Execution: ${finalTitle}
Status: ${result.status}
Duration: ${result.total_duration_ms}ms
Steps: ${result.steps.length}`;

        await this.memoryClient.storeEvent({
            type: 'action_execution',
            title: `Action: ${finalTitle}`,
            content,
            start_time: result.started_at,
            end_time: result.completed_at,
            participants,
            metadata: {
                actionId,
                status: result.status,
                goal: finalTitle,
                total_duration_ms: result.total_duration_ms,
                step_count: result.steps.length,
                provenance,
                // Store full plan and result in metadata for detailed retrieval if needed
                // Be careful with size, maybe truncate if too large
                plan_summary: plan.plan.map(p => p.op),
                error: result.steps.find(s => s.status === 'failed')?.error
            }
        });

        console.log(`[ActionHistory] Persisted action ${actionId} to Memory Service`);
    }

    /**
     * Get action by ID
     */
    async getAction(actionId: string): Promise<ActionHistoryEntry | null> {
        const entry = this.history.get(actionId);
        return entry || null;
    }

    /**
     * Query action history with filters
     */
    async queryHistory(filters: {
        userId?: string;
        startDate?: Date;
        endDate?: Date;
        status?: 'completed' | 'failed' | 'partial';
        actionType?: string;
        limit?: number;
    }): Promise<ActionHistoryEntry[]> {
        let results = Array.from(this.history.values());

        // Apply filters
        if (filters.userId) {
            results = results.filter(e => e.provenance?.user_id === filters.userId);
        }

        if (filters.startDate) {
            results = results.filter(e => e.loggedAt >= filters.startDate!);
        }

        if (filters.endDate) {
            results = results.filter(e => e.loggedAt <= filters.endDate!);
        }

        if (filters.status) {
            results = results.filter(e => e.result.status === filters.status);
        }

        if (filters.actionType) {
            results = results.filter(e =>
                e.plan.plan.some(action => action.op === filters.actionType)
            );
        }

        // Sort by newest first
        results.sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());

        // Apply limit
        if (filters.limit) {
            results = results.slice(0, filters.limit);
        }

        return results;
    }

    /**
     * Get recent actions for a user
     */
    async getRecentActions(userId: string, limit: number = 10): Promise<ActionHistoryEntry[]> {
        return this.queryHistory({ userId, limit });
    }

    /**
     * Get action statistics
     */
    async getStats(userId?: string): Promise<ActionHistoryStats> {
        const entries = userId
            ? Array.from(this.history.values()).filter(e => e.provenance?.user_id === userId)
            : Array.from(this.history.values());

        const stats: ActionHistoryStats = {
            total: entries.length,
            byStatus: {
                completed: entries.filter(e => e.result.status === 'completed').length,
                failed: entries.filter(e => e.result.status === 'failed').length,
                partial: entries.filter(e => e.result.status === 'partial').length,
            },
            byProvider: {},
            recentActions: entries
                .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())
                .slice(0, 5)
                .map(e => ({
                    actionId: e.actionId,
                    status: e.result.status,
                    timestamp: e.loggedAt.toISOString(),
                    actionTypes: e.plan.plan.map(a => a.op),
                })),
        };

        // Count by action type
        for (const entry of entries) {
            for (const action of entry.plan.plan) {
                stats.byProvider[action.op] = (stats.byProvider[action.op] || 0) + 1;
            }
        }

        return stats;
    }

    /**
     * Delete action from history
     */
    async deleteAction(actionId: string): Promise<boolean> {
        return this.history.delete(actionId);
    }

    /**
     * Cleanup old entries based on retention policy
     */
    async cleanup(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

        let deletedCount = 0;

        for (const [actionId, entry] of this.history.entries()) {
            if (entry.loggedAt < cutoffDate) {
                this.history.delete(actionId);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`[ActionHistory] Cleaned up ${deletedCount} old entries`);
        }

        return deletedCount;
    }

    /**
     * Clear all history (for testing)
     */
    async clear(): Promise<void> {
        this.history.clear();
        console.log('[ActionHistory] History cleared');
    }

    /**
     * Get total history count
     */
    getCount(): number {
        return this.history.size;
    }

    /**
     * Configure retention policy
     */
    setRetentionPolicy(days: number, maxSize: number): void {
        this.retentionDays = days;
        this.maxHistorySize = maxSize;
        console.log(`[ActionHistory] Retention: ${days} days, max ${maxSize} entries`);
    }
}

// Types

export interface ActionHistoryEntry {
    actionId: string;
    plan: ActionPlan;
    result: ExecutionResult;
    provenance: Provenance;
    loggedAt: Date;
}

export interface ActionHistoryStats {
    total: number;
    byStatus: {
        completed: number;
        failed: number;
        partial: number;
    };
    byProvider: Record<string, number>;
    recentActions: Array<{
        actionId: string;
        status: string;
        timestamp: string;
        actionTypes: string[];
    }>;
}
