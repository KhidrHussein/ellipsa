import { Driver as Neo4jDriver, Session } from 'neo4j-driver';
import { IPromptService } from './interfaces/IPromptService';
import { Collection } from 'chromadb';

export class MemoryConsolidator {
    private neo4jDriver: Neo4jDriver;
    private promptService: IPromptService;
    private entitiesCollection: Collection | null = null; // Optional: access to Chroma if needed directly

    constructor(neo4jDriver: Neo4jDriver, promptService: IPromptService) {
        this.neo4jDriver = neo4jDriver;
        this.promptService = promptService;
    }

    /**
     * Consolidates episodic events into semantic facts.
     * Use this in a cron job or triggered periodically.
     */
    async consolidateDailyMemories() {
        console.log('[MemoryConsolidator] Starting daily consolidation...');
        const session = this.neo4jDriver.session();

        try {
            // 1. Fetch conversations from the last 24 hours (or unprocessed ones)
            // Assuming we have a way to query recent events from Neo4j or SQL.
            // For now, let's query mostly 'user_message' and 'assistant_message' types 
            // that are NOT yet marked as consolidated (if we had such a flag).
            // Or just grab all events from last 24h.

            const result = await session.run(`
                MATCH (e:Event)
                WHERE e.start_time > datetime() - duration('P1D')
                AND (e.type = 'user_message' OR e.type = 'meeting')
                RETURN e.id as id, e.description as content, e.type as type, e.start_time as time
                ORDER BY e.start_time ASC
                LIMIT 50
            `);

            const conversations = result.records.map(r => ({
                id: r.get('id'),
                content: r.get('content'),
                time: r.get('time')
            }));

            if (conversations.length === 0) {
                console.log('[MemoryConsolidator] No distinct conversations found to consolidate.');
                return;
            }

            // 2. Aggregate content
            const transcript = conversations.map(c => `[${c.time}] ${c.content}`).join('\n');

            // 3. Extract Facts using LLM
            // We need a specific prompt method for this. 
            // Assuming promptService can generate text or we hack it via generateAssistance/extractStructuredData.
            // Let's try to use extractStructuredData but with a specific instruction if possible, 
            // or just generateText if available. 
            // Since IPromptService might not have generateText exposed in the interface (checked earlier), 
            // we might relying on extractStructuredData returning extraction.entities as facts.

            // Actually, extractStructuredData DOES extract entities and context. 
            // That IS essentially fact extraction.
            // So we re-run extraction on the aggregated text to find high-level patterns.

            console.log('[MemoryConsolidator] Extracting facts from daily transcript...');
            const extraction = await this.promptService.extractStructuredData(transcript);

            if (extraction.entities && extraction.entities.length > 0) {
                await this.storeFacts(extraction.entities);
                console.log(`[MemoryConsolidator] Consolidated ${extraction.entities.length} new facts.`);
            }

        } catch (error) {
            console.error('[MemoryConsolidator] Error during consolidation:', error);
        } finally {
            await session.close();
        }
    }

    private async storeFacts(facts: Array<{ type: string, value: string, context?: string }>) {
        const session = this.neo4jDriver.session();
        try {
            for (const fact of facts) {
                // Merge into Knowledge Graph
                // If the entity exists, add the context as a property or relationship
                // Default: MERGE entity, then add a generic 'HAS_FACT' or update description.

                // Strategy: 
                // Entity: name=value, type=type
                // We add a 'Fact' node or just property?
                // The design says "Update KnowledgeGraph or UserProfile".
                // Let's keep it simple: Ensure Entity exists, append observation to it.

                await session.run(`
                    MERGE (e:Entity {name: $name})
                    ON CREATE SET e.type = $type, e.created_at = datetime(), e.observations = [$context]
                    ON MATCH SET 
                        e.observations = e.observations + $context, 
                        e.updated_at = datetime()
                `, {
                    name: fact.value,
                    type: fact.type,
                    context: fact.context || 'Observed in daily consolidation'
                });
            }
        } catch (error) {
            console.error('[MemoryConsolidator] Failed to store facts', error);
        } finally {
            await session.close();
        }
    }
}
