import { Driver as Neo4jDriver, Session } from 'neo4j-driver';
import { IPromptService } from './interfaces/IPromptService';
import { Collection } from 'chromadb';
import { FACT_EXTRACTION_PROMPT } from '../../../../packages/shared/src/prompts.js';

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
            // We pass the specialized FACT_EXTRACTION_PROMPT as the system prompt (or context) to guide the extraction
            // Since we updated PromptService to accept a systemPrompt, we can now pass it.
            // But wait, FACT_EXTRACTION_PROMPT is exported from assistantPrompts.ts in prompt package.
            // We need to import it or define it. 
            // In a real monorepo we'd import { FACT_EXTRACTION_PROMPT } from '@ellipsa/prompt';
            // Assuming promptService interface allows passing the prompt string if we changed the interface.

            // NOTE: The IPromptService interface in this file's imports needs to be updated or we cast it.
            // Since we are editing the implementation, let's assume we can pass it if we update the call.
            // Ideally we should import FACT_EXTRACTION_PROMPT.
            // For now, let's pass the instruction string directly or rely on the updated service signature.

            const extraction = await this.promptService.extractStructuredData(transcript, undefined, FACT_EXTRACTION_PROMPT);

            if (extraction.entities && extraction.entities.length > 0) {
                await this.storeFacts(extraction.entities);
                console.log(`[MemoryConsolidator] Consolidated ${extraction.entities.length} new facts.`);

                // 4. Create Memory Summary
                await this.createMemorySummary({
                    scope_id: 'user', // Default to global user for now
                    period_start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    period_end: new Date().toISOString(),
                    summary_text: extraction.summary || `Daily consolidation of ${conversations.length} events.`,
                    facts_count: extraction.entities.length
                });
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

    private async createMemorySummary(data: {
        scope_id: string,
        period_start: string,
        period_end: string,
        summary_text: string,
        facts_count: number
    }) {
        const session = this.neo4jDriver.session();
        try {
            await session.run(`
                CREATE (s:MemorySummary {
                    id: randomUUID(),
                    scope_id: $scope_id,
                    period_start: datetime($period_start),
                    period_end: datetime($period_end),
                    summary_text: $summary_text,
                    facts_count: $facts_count,
                    created_at: datetime()
                })
                WITH s
                MATCH (u:User {id: $scope_id}) // Assuming User node exists with this ID, or we link to global
                // If we don't have a rigid User node, we might skip linking or link to a generic 'User' node
                // For now, let's just create the summary node which is queryable by time.
                RETURN s
            `, data);
            console.log('[MemoryConsolidator] MemorySummary node created.');
        } catch (error) {
            console.error('[MemoryConsolidator] Failed to create MemorySummary:', error);
        } finally {
            await session.close();
        }
    }
}
