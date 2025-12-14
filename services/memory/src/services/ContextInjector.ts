import { Driver as Neo4jDriver, Session } from 'neo4j-driver';
import { IPromptService } from './interfaces/IPromptService';

export class ContextInjector {
    private neo4jDriver: Neo4jDriver;
    private promptService: IPromptService;

    constructor(neo4jDriver: Neo4jDriver, promptService: IPromptService) {
        this.neo4jDriver = neo4jDriver;
        this.promptService = promptService;
    }

    /**
     * Injects "Ghost Context" into the interaction by identifying entities in the user prompt
     * and retrieving their immediate relationships from the Knowledge Graph.
     */
    async injectContext(userPrompt: string): Promise<string> {
        // 1. Extract entities from the prompt
        // We use the prompt service's entity extraction capability
        // If not available on interface, we might need to cast or rely on a simpler regex extraction first
        // But let's assume we can get entities.
        let entities: string[] = [];

        // Try to assume promptService has extractStructuredData or similar
        // For now, let's use a regex fallback for immediate speed, 
        // or better, if the promptService has a method exposed.
        // Checking PromptService interface... it usually returns ExtractionResult.

        try {
            // We use a simplified extraction or just look for capitalized words to be fast
            // Ideally we'd call an LLM, but for every message that adds latency. 
            // The "Poke" protocol implies we should be smart.
            // Let's call the LLM if the prompt is long enough, otherwise simple regex.
            if (userPrompt.length > 20) {
                const extraction = await this.promptService.extractStructuredData(userPrompt);
                if (extraction.entities) {
                    entities = extraction.entities.map(e => e.value);
                }
            }

            if (entities.length === 0) {
                // Fallback: simple capitalized words extraction
                const matches = userPrompt.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
                if (matches) {
                    entities = Array.from(new Set(matches));
                }
            }
        } catch (e) {
            console.warn('[ContextInjector] Entity extraction failed', e);
        }

        if (entities.length === 0) {
            return '';
        }

        // 2. Query Memory Graph for immediate neighbors
        const contextLines = await this.queryGraphForContext(entities);

        if (contextLines.length === 0) {
            return '';
        }

        // 3. Format output
        return `
<active_context>
${contextLines.join('\n')}
</active_context>
`.trim();
    }

    private async queryGraphForContext(entities: string[]): Promise<string[]> {
        const session: Session = this.neo4jDriver.session();
        const contextLines: string[] = [];

        try {
            // Query for each entity: find related entities and the nature of the relationship
            // We limit to immediate neighbors (1 hop)
            const result = await session.run(`
                MATCH (e:Entity)-[r]-(related:Entity)
                WHERE e.name IN $entities
                RETURN e.name as source, type(r) as rel_type, related.name as target, related.type as target_type, r.context as context
                LIMIT 10
            `, { entities });

            result.records.forEach(record => {
                const source = record.get('source');
                const relType = record.get('rel_type');
                const target = record.get('target');
                const context = record.get('context') || '';

                // Format: "- Sarah (Relationship: Sister, Context: Lives in Tokyo)"
                // Or more natural: "- [Source] is [Rel] to [Target] ("context")"

                // Clean up relationship type (e.g. RELATED_TO -> Related To)
                const readableRel = relType.replace(/_/g, ' ').toLowerCase();

                let line = `- ${source} ${readableRel} ${target}`;
                if (context) {
                    line += ` (${context})`;
                }
                contextLines.push(line);
            });

        } catch (error) {
            console.error('[ContextInjector] Graph query failed', error);
        } finally {
            await session.close();
        }

        return contextLines;
    }
}
