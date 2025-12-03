import { ActionPlan, ExecutionResult, Action, StepResult, Provenance } from '../schemas/action.schema';
import { IActionProvider, ExecutionContext, ValidationResult } from './ActionProvider.interface';
import { ActionRegistry } from './ActionRegistry';
import { SafetyValidator } from './SafetyValidator';

/**
 * ActionExecutor orchestrates action execution across multiple providers
 * - Routes actions to appropriate providers
 * - Enforces safety policies
 * - Handles multi-step execution
 * - Aggregates results
 */
export class ActionExecutor {
    constructor(
        private registry: ActionRegistry,
        private safetyValidator: SafetyValidator
    ) { }

    /**
     * Execute an action plan
     */
    async execute(plan: ActionPlan, context: Partial<ExecutionContext> = {}): Promise<ExecutionResult> {
        const actionId = this.generateActionId();
        const startedAt = new Date();
        const executionContext: ExecutionContext = {
            userId: plan.provenance?.user_id,
            timestamp: startedAt,
            headless: context.headless ?? true,
            continueOnError: context.continueOnError ?? false,
            timeout: context.timeout ?? 30000,
            metadata: context.metadata,
        };

        console.log(`[ActionExecutor] Starting execution: ${actionId}`);
        console.log(`[ActionExecutor] Plan contains ${plan.plan.length} steps`);

        // Safety validation
        const safetyCheck = await this.safetyValidator.validate(plan);
        if (!safetyCheck.allowed) {
            console.error(`[ActionExecutor] Safety check failed: ${safetyCheck.reason}`);
            return {
                action_id: actionId,
                status: 'failed',
                steps: [],
                provenance: plan.provenance,
                started_at: startedAt.toISOString(),
                completed_at: new Date().toISOString(),
                metadata: {
                    error: safetyCheck.reason,
                },
            };
        }

        if (safetyCheck.requiresApproval) {
            console.log(`[ActionExecutor] Action requires approval: ${safetyCheck.reason}`);
            return {
                action_id: actionId,
                status: 'pending_approval',
                steps: [],
                provenance: plan.provenance,
                started_at: startedAt.toISOString(),
                metadata: {
                    requiresApproval: true,
                    approvalReason: safetyCheck.reason,
                },
            };
        }

        // Group actions by provider for efficient execution
        const providerGroups = this.groupActionsByProvider(plan.plan);
        const allResults: StepResult[] = [];
        let overallStatus: 'completed' | 'failed' | 'partial' = 'completed';

        // Execute each provider group
        for (const [provider, actions] of providerGroups) {
            console.log(`[ActionExecutor] Executing ${actions.length} actions with provider: ${provider.name}`);

            try {
                const result = await provider.execute(actions, executionContext);
                allResults.push(...result.results);

                // Check if any step failed
                const hasFailed = result.results.some((r) => r.status === 'failed');
                if (hasFailed) {
                    overallStatus = overallStatus === 'completed' ? 'partial' : 'failed';

                    if (!executionContext.continueOnError) {
                        console.log(`[ActionExecutor] Stopping execution due to failure`);
                        break;
                    }
                }
            } catch (error) {
                console.error(`[ActionExecutor] Provider ${provider.name} error:`, error);

                // Mark all actions in this group as failed
                for (const action of actions) {
                    allResults.push({
                        op: action.op,
                        status: 'failed',
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }

                overallStatus = 'failed';

                if (!executionContext.continueOnError) {
                    break;
                }
            }
        }

        const completedAt = new Date();
        const totalDuration = completedAt.getTime() - startedAt.getTime();

        console.log(`[ActionExecutor] Execution ${actionId} completed in ${totalDuration}ms with status: ${overallStatus}`);

        return {
            action_id: actionId,
            status: overallStatus,
            steps: allResults,
            provenance: plan.provenance,
            started_at: startedAt.toISOString(),
            completed_at: completedAt.toISOString(),
            total_duration_ms: totalDuration,
        };
    }

    /**
     * Validate an action plan without executing
     */
    async validatePlan(plan: ActionPlan): Promise<ValidationResult> {
        // Safety validation
        const safetyCheck = await this.safetyValidator.validate(plan);
        if (!safetyCheck.allowed) {
            return safetyCheck;
        }

        // Check that all actions have providers
        for (const action of plan.plan) {
            const provider = this.registry.getProviderForAction(action);
            if (!provider) {
                return {
                    allowed: false,
                    reason: `No provider found for action: ${action.op}`,
                };
            }

            // Validate with provider
            const providerValidation = provider.validate(action);
            if (!providerValidation.allowed) {
                return providerValidation;
            }
        }

        return safetyCheck;
    }

    /**
     * Get available actions
     */
    getAvailableActions() {
        return this.registry.getAvailableActions();
    }

    /**
     * Group actions by their providers
     * Tries to batch actions for the same provider together
     */
    private groupActionsByProvider(actions: Action[]): Map<IActionProvider, Action[]> {
        const groups = new Map<IActionProvider, Action[]>();

        for (const action of actions) {
            const provider = this.registry.getProviderForAction(action);
            if (!provider) {
                console.warn(`No provider found for action: ${action.op}`);
                continue;
            }

            if (!groups.has(provider)) {
                groups.set(provider, []);
            }
            groups.get(provider)!.push(action);
        }

        return groups;
    }

    /**
     * Generate unique action ID
     */
    private generateActionId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `act_${timestamp}_${random}`;
    }
}
