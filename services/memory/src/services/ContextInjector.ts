import { Driver as Neo4jDriver, Session } from 'neo4j-driver';
import { IPromptService } from './interfaces/IPromptService';
import { MemoryRetrievalService } from './MemoryRetrievalService';

export class ContextInjector {
    private neo4jDriver: Neo4jDriver;
    private promptService: IPromptService;
    private memoryRetrievalService?: MemoryRetrievalService;

    constructor(neo4jDriver: Neo4jDriver, promptService: IPromptService, memoryRetrievalService?: MemoryRetrievalService) {
        this.neo4jDriver = neo4jDriver;
        this.promptService = promptService;
        this.memoryRetrievalService = memoryRetrievalService;
    }

    /**
     * Injects "Ghost Context" into the interaction by identifying entities in the user prompt
     * and retrieving their immediate relationships from the Knowledge Graph.
     */
    async injectContext(userPrompt: string, userId: string): Promise<string> {
        // [OPTIMIZATION: VECTOR SEARCH]
        // 1. Identify relevant entities using Semantic Vector Search (via ChromaDB)
        const distinctEntities: string[] = await this.performVectorSearch(userPrompt, userId);

        // 2. Query Memory Graph for immediate neighbors
        const contextLines = await this.queryGraphWithText(userPrompt, distinctEntities, userId);

        // 3. [IDENTITY FIX] Explicitly fetch "Self" entity context
        const selfContext = await this.getSelfContext(userId);
        if (selfContext) {
            contextLines.unshift(selfContext);
        }

        if (contextLines.length === 0) {
            return '';
        }

        // 4. Format output
        return `
<active_context>
${contextLines.join('\n')}
</active_context>
`.trim();
    }

    private async performVectorSearch(userPrompt: string, userId: string): Promise<string[]> {
        if (!this.memoryRetrievalService) return [];
        try {
            return await this.memoryRetrievalService.searchEntities(userPrompt, userId, 5);
        } catch (err) {
            console.warn('[ContextInjector] Vector search failed', err);
            return [];
        }
    }

    private async queryGraphWithText(text: string, entityNames: string[], userId: string): Promise<string[]> {
        const session: Session = this.neo4jDriver.session();
        const contextLines: string[] = [];

        try {
            // HYBRID QUERY: Vector-guided OR Text-based fallback
            let query = '';
            let params: any = { userId };

            if (entityNames.length > 0) {
                query = `
                    MATCH (e:Entity {user_id: $userId})
                    WHERE e.name IN $entityNames
                    MATCH (e)-[r]-(related:Entity {user_id: $userId})
                    RETURN e.name as source, type(r) as rel_type, related.name as target, related.type as target_type, r.context as context
                    LIMIT 15
                 `;
                params.entityNames = entityNames;
            } else {
                query = `
                    MATCH (e:Entity {user_id: $userId})
                    WHERE toLower($text) CONTAINS toLower(e.name)
                    MATCH (e)-[r]-(related:Entity {user_id: $userId})
                    RETURN e.name as source, type(r) as rel_type, related.name as target, related.type as target_type, r.context as context
                    LIMIT 10
                `;
                params.text = text;
            }

            const result = await session.run(query, params);

            result.records.forEach(record => {
                const source = record.get('source');
                const relType = record.get('rel_type');
                const target = record.get('target');
                const context = record.get('context') || '';
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

    private async getSelfContext(userId: string): Promise<string | null> {
        const session: Session = this.neo4jDriver.session();
        try {
            const query = `
                MATCH (u:Entity {user_id: $userId})
                WHERE u.is_self = true OR u.name = 'User' OR u.name = 'Me'
                RETURN u.name as name, u.description as description, u.email as email
                LIMIT 1
            `;
            const result = await session.run(query, { userId });

            if (result.records.length > 0) {
                const record = result.records[0];
                const name = record.get('name');
                const description = record.get('description');
                const email = record.get('email');

                let info = `- Self Identity: ${name}`;
                if (email) info += ` (Email: ${email})`;
                if (description) info += `. ${description}`;

                return info;
            }
            return null;
        } catch (error) {
            console.error('[ContextInjector] Failed to fetch Self entity:', error);
            return null;
        } finally {
            await session.close();
        }
    }
}
