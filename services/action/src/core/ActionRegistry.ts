import { Action } from '../schemas/action.schema';
import { ActionDefinition, IActionProvider } from './ActionProvider.interface';

/**
 * Central registry for all available actions
 * Maintains a mapping of action operations to providers
 */
export class ActionRegistry {
    private providers: Map<string, IActionProvider> = new Map();
    private actionToProvider: Map<string, IActionProvider> = new Map();

    /**
     * Register a new provider
     */
    registerProvider(provider: IActionProvider): void {
        if (this.providers.has(provider.name)) {
            throw new Error(`Provider ${provider.name} is already registered`);
        }

        this.providers.set(provider.name, provider);

        // Register all capabilities
        const capabilities = provider.getCapabilities();
        for (const capability of capabilities) {
            if (this.actionToProvider.has(capability.op)) {
                console.warn(
                    `Action ${capability.op} already registered for provider ${this.actionToProvider.get(capability.op)?.name}. Overriding with ${provider.name}`
                );
            }
            this.actionToProvider.set(capability.op, provider);
        }

        console.log(`Registered provider: ${provider.name} with ${capabilities.length} capabilities`);
    }

    /**
     * Unregister a provider
     */
    unregisterProvider(providerName: string): void {
        const provider = this.providers.get(providerName);
        if (!provider) {
            return;
        }

        // Remove action mappings
        const capabilities = provider.getCapabilities();
        for (const capability of capabilities) {
            this.actionToProvider.delete(capability.op);
        }

        this.providers.delete(providerName);
        console.log(`Unregistered provider: ${providerName}`);
    }

    /**
     * Get provider for a specific action
     */
    getProviderForAction(action: Action): IActionProvider | null {
        return this.actionToProvider.get(action.op) || null;
    }

    /**
     * Get all registered providers
     */
    getAllProviders(): IActionProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * Get provider by name
     */
    getProvider(name: string): IActionProvider | null {
        return this.providers.get(name) || null;
    }

    /**
     * Get all available actions across all providers
     */
    getAvailableActions(): ActionDefinition[] {
        const actions: ActionDefinition[] = [];

        for (const provider of this.providers.values()) {
            const capabilities = provider.getCapabilities();
            actions.push(
                ...capabilities.map((cap) => ({
                    op: cap.op,
                    provider: provider.name,
                    description: cap.description,
                    argsSchema: cap.argsSchema,
                    requiresApproval: cap.requiresApproval,
                    destructive: cap.destructive,
                    category: cap.category,
                }))
            );
        }

        return actions;
    }

    /**
     * Check if an action is supported
     */
    isActionSupported(action: Action): boolean {
        const provider = this.getProviderForAction(action);
        return provider !== null && provider.supports(action);
    }

    /**
     * Get actions by category
     */
    getActionsByCategory(category: 'browser' | 'email' | 'desktop' | 'api'): ActionDefinition[] {
        return this.getAvailableActions().filter((action) => action.category === category);
    }

    /**
     * Get statistics about registered providers
     */
    getStats() {
        const stats = {
            totalProviders: this.providers.size,
            totalActions: this.actionToProvider.size,
            byCategory: {
                browser: 0,
                email: 0,
                desktop: 0,
                api: 0,
            },
        };

        for (const action of this.getAvailableActions()) {
            stats.byCategory[action.category]++;
        }

        return stats;
    }
}
