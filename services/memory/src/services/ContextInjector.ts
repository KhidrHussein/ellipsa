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
    async injectContext(userPrompt: string, userId: string): Promise<string> {
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
            // 1. Extract entities from the prompt using LLM if possible
            if (userPrompt.length > 10) {
                // Use a specialized system prompt for entity extraction if needed, or default
                // We utilize the PromptService's entity extraction capability
                const extraction = await this.promptService.extractStructuredData(
                    userPrompt,
                    undefined,
                    "You are an Entity Extractor. Extract key people, places, and concepts from the text."
                );

                if (extraction.entities) {
                    entities = extraction.entities.map(e => e.value);
                }
            } else {
                // Keep regex for very short prompts to save latency
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

        // 2. Query Memory Graph for immediate neighbors, scoped to USER
        const contextLines = await this.queryGraphForContext(entities, userId);

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

    private async queryGraphForContext(entities: string[], userId: string): Promise<string[]> {
        const session: Session = this.neo4jDriver.session();
        const contextLines: string[] = [];

        try {
            // Query for each entity: find related entities and the nature of the relationship
            // We limit to immediate neighbors (1 hop)
            // CRITICAL: We now match ONLY entities belonging to this user
            const result = await session.run(`
                MATCH (e:Entity {user_id: $userId})-[r]-(related:Entity {user_id: $userId})
                WHERE e.name IN $entities
                RETURN e.name as source, type(r) as rel_type, related.name as target, related.type as target_type, r.context as context
                LIMIT 10
            `, { entities, userId });

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
