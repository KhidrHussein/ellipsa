import { ChromaClient, Collection } from 'chromadb';
import neo4j, { Driver as Neo4jDriver, Session } from 'neo4j-driver';
import { getEmbeddingFunction } from '../db/vector/chroma';

export interface MemoryBullet {
    text: string;
    source: string;
    timestamp: Date;
    confidence: number;
}

interface VectorResult {
    id: string;
    summary: string;
    similarity: number;
    timestamp: number;
    event_id: string;
    metadata?: Record<string, any>;
}

interface GraphResult {
    summary: string;
    graphStrength: number;
    timestamp: number;
    event_id: string;
    similarity: number;
}

export class MemoryRetrievalService {
    private chromaClient: ChromaClient;
    private neo4jDriver: Neo4jDriver;
    private eventsCollection: Collection | null = null;
    private entitiesCollection: Collection | null = null;

    constructor(chromaClient: ChromaClient, neo4jDriver: Neo4jDriver) {
        this.chromaClient = chromaClient;
        this.neo4jDriver = neo4jDriver;
    }

    async initialize() {
        try {
            // Get existing collections
            // Get existing collections with embedding function
            const embeddingFunction = getEmbeddingFunction();
            this.eventsCollection = await this.chromaClient.getCollection({
                name: 'events',
                embeddingFunction
            });
            this.entitiesCollection = await this.chromaClient.getCollection({
                name: 'entities',
                embeddingFunction
            });
            console.log('[MemoryRetrieval] Initialized with ChromaDB collections and embedding function');
        } catch (error) {
            console.error('[MemoryRetrieval] Error initializing collections:', error);
        }
    }

    /**
     * Retrieve relevant context from memory using hybrid search:
     * 1. Vector search (semantic similarity)
     * 2. Graph search (relationship strength)
     * 3. Recency-weighted reranking
     */
    async retrieveRelevantContext(query: string, userId: string, limit: number = 5): Promise<MemoryBullet[]> {

        try {
            // 1. Get Self Identity (User Profile) - Always inject this first!
            const selfIdentity = await this.getSelfEntity(userId);

            // 2. Vector search in ChromaDB
            const vectorResults = await this.vectorSearch(query, userId, limit * 3);


            // 2. Graph search in Neo4j (if entities detected)
            const graphResults = await this.graphSearch(query, userId, limit * 2);


            // 3. Combine and rerank with recency
            const scored = this.rerankWithRecency([...vectorResults, ...graphResults]);

            // 4. Return top K as bullet points
            const results = scored.slice(0, limit).map(r => ({
                text: r.summary,
                source: r.event_id,
                timestamp: new Date(r.timestamp),
                confidence: r.score
            }));

            // Prepend Self Identity if available
            if (selfIdentity) {
                results.unshift(selfIdentity);
            }

            return results;
        } catch (error) {
            console.error('[MemoryRetrieval] Error retrieving context:', error);
            return [];
        }
    }

    /**
     * Vector search using ChromaDB semantic similarity
     */
    private async vectorSearch(query: string, userId: string, limit: number): Promise<VectorResult[]> {

        if (!this.eventsCollection || !this.entitiesCollection) {
            console.warn('[MemoryRetrieval] Collections not initialized');
            return [];
        }

        if (!query || query.trim() === '') {
            return [];
        }

        try {
            const vectorResults: VectorResult[] = [];

            // Query Events
            const eventResults = await this.eventsCollection.query({
                queryTexts: [query],
                nResults: limit,
                where: { user_id: userId } // CRITICAL: Filter by user
            } as any);


            if (eventResults.ids && eventResults.ids[0]) {
                for (let i = 0; i < eventResults.ids[0].length; i++) {
                    const metadata = eventResults.metadatas?.[0]?.[i] as any;
                    const distance = eventResults.distances?.[0]?.[i] || 1;

                    if (metadata) {
                        vectorResults.push({
                            id: eventResults.ids[0][i] as string,
                            summary: metadata.summary || metadata.description || metadata.content || 'No summary',
                            similarity: 1 - distance,
                            timestamp: metadata.timestamp ? new Date(metadata.timestamp).getTime() : 0,
                            event_id: metadata.event_id || eventResults.ids[0][i] as string,
                            metadata: metadata
                        });
                    }
                }
            }

            // Query Entities
            const entityResults = await this.entitiesCollection.query({
                queryTexts: [query],
                nResults: limit,
                where: { user_id: userId } // CRITICAL: Filter by user
            } as any);


            if (entityResults.ids && entityResults.ids[0]) {
                console.log(`[MemoryRetrieval] Raw entity results for query "${query}":`, JSON.stringify(entityResults.metadatas?.[0], null, 2));
                for (let i = 0; i < entityResults.ids[0].length; i++) {
                    const metadata = entityResults.metadatas?.[0]?.[i] as any;
                    const distance = entityResults.distances?.[0]?.[i] || 1;

                    if (metadata) {
                        // Format entity result to look like a memory bullet
                        // We use the entity name and observations as the summary
                        const observations = metadata.observations ?
                            (Array.isArray(metadata.observations) ? metadata.observations.join('. ') : metadata.observations)
                            : '';

                        const summary = `Entity: ${metadata.name} (${metadata.type}). ${observations}`;

                        vectorResults.push({
                            id: entityResults.ids[0][i] as string,
                            summary: summary,
                            similarity: 1 - distance,
                            timestamp: metadata.updated_at ? new Date(metadata.updated_at).getTime() :
                                (metadata.created_at ? new Date(metadata.created_at).getTime() :
                                    (metadata.timestamp ? new Date(metadata.timestamp).getTime() : 0)),
                            event_id: `entity:${entityResults.ids[0][i]}`, // Prefix to distinguish
                            metadata: metadata
                        });
                    }
                }
            }

            console.log(`[MemoryRetrieval] Vector search found ${vectorResults.length} results (Events + Entities)`);
            return vectorResults;
        } catch (error) {
            console.error('[MemoryRetrieval] Vector search error:', error);
            return [];
        }
    }

    /**
     * Graph search using Neo4j to find related entities and events
     */
    private async graphSearch(query: string, userId: string, limit: number): Promise<GraphResult[]> {

        const session: Session = this.neo4jDriver.session();

        try {
            // Extract potential entity names from query (simple approach)
            const entities = this.extractPotentialEntities(query);
            if (entities.length === 0) {
                return [];
            }

            // Query Neo4j for events AND entities related to these entities
            // Use UNION to combine results and avoid nested aggregation errors
            const cypher = `
                MATCH (e:Entity {user_id: $userId})-[r:RELATED_TO|PART_OF]-(evt:Event {user_id: $userId})
                WHERE e.name IN $entities
                RETURN 'event' as type, 
                       evt.id as id, 
                       evt.description as summary, 
                       toString(evt.created_at) as timestamp, 
                       count(r) as strength

                UNION

                MATCH (e:Entity {user_id: $userId})-[r:RELATED_TO|PART_OF]-(related:Entity {user_id: $userId})
                WHERE e.name IN $entities
                RETURN 'entity' as type, 
                       related.id as id, 
                       'Entity: ' + related.name + ' (' + related.type + '). ' + coalesce(r.context, '') as summary, 
                       toString(coalesce(related.updated_at, related.created_at, datetime())) as timestamp, 
                       2 as strength
            `;


            const result = await session.run(cypher, { entities, userId, limit: neo4j.int(limit) });


            // Process rows directly (UNION returns multiple records)
            const graphResults: GraphResult[] = result.records
                .map(record => ({
                    event_id: record.get('type') === 'event' ? record.get('id') : `entity:${record.get('id')}`,
                    summary: record.get('summary') || 'No summary',
                    timestamp: new Date(record.get('timestamp')).getTime(),
                    graphStrength: Number(record.get('strength')),
                    similarity: 0.5 // Neutral similarity for graph results
                }))
                .sort((a, b) => b.graphStrength - a.graphStrength)
                .slice(0, limit);

            console.log(`[MemoryRetrieval] Graph search found ${graphResults.length} results for entities: ${entities.join(', ')} `);
            return graphResults;

        } catch (error) {
            console.error('[MemoryRetrieval] Graph search error:', error);
            return [];
        } finally {
            await session.close();
        }
    }

    /**
     * Retrieve the "Self" entity for the user to ensure identity context is always present
     */
    async getSelfEntity(userId: string): Promise<MemoryBullet | null> {
        const session: Session = this.neo4jDriver.session();
        try {
            const result = await session.run(
                `MATCH (u:Entity {user_id: $userId, is_self: true}) 
                 RETURN u.name as name, u.type as type, u.description as description
                 LIMIT 1`,
                { userId }
            );

            if (result.records.length > 0) {
                const record = result.records[0];
                const name = record.get('name');
                // const type = record.get('type'); 
                const description = record.get('description') || 'This is the user currently interacting with the system.';

                console.log(`[MemoryRetrieval] Found Self Entity: ${name} (${description})`);

                return {
                    text: `Identity: ${name} (Self). ${description}`,
                    source: 'identity',
                    timestamp: new Date(),
                    confidence: 1.0
                };
            }
            return null;
        } catch (error) {
            console.error('[MemoryRetrieval] Failed to fetch self entity:', error);
            return null;
        } finally {
            await session.close();
        }
    }

    /**
     * Search for entities using vector similarity.
     * Returns a list of unique entity names found.
     */
    async searchEntities(query: string, userId: string, limit: number = 5): Promise<string[]> {
        // 1. Perform vector search for entities
        // We use a higher limit to increase recall, then we'll dedupe names
        if (!this.entitiesCollection) return [];

        const results = await this.vectorSearch(query, userId, limit * 2);

        // 2. Filter for only entity results (though vectorSearch currently mixes them, we can check IDs or metadata)
        // In our vectorSearch, we prefix entity IDs with "entity:" in the result event_id
        // or we can infer from metadata if it has a 'type' field that is an entity type.

        const entityNames = new Set<string>();

        results.forEach(res => {
            // Check if it's an entity based on the ID prefix we set in vectorSearch
            // or if the metadata has a name/type structure
            if (res.event_id.startsWith('entity:') || (res.metadata && res.metadata.name && res.metadata.type)) {
                if (res.metadata && res.metadata.name) {
                    entityNames.add(res.metadata.name);
                }
            }
        });

        return Array.from(entityNames).slice(0, limit);
    }

    /**
     * Extract potential entity names from query
     * Simple implementation: look for capitalized words
     */
    private extractPotentialEntities(query: string): string[] {
        // Match capitalized words (potential names)
        const matches = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
        return matches ? Array.from(new Set(matches)) : [];
    }

    /**
     * Rerank results with recency decay
     * Score = 0.6 * semantic_similarity + 0.3 * recency + 0.1 * graph_strength
     */
    private rerankWithRecency(results: Array<VectorResult | GraphResult>): Array<any> {
        const now = Date.now();

        // 1. Group by Unique Key (Name + Type) to find the LATEST version of each entity
        // This ensures that newer updates (e.g. "John is Friend") override older ones (e.g. "John is User")
        // regardless of semantic similarity to the query.
        const latestVersions = new Map<string, VectorResult | GraphResult>();

        for (const r of results) {
            // Create a unique key for deduplication
            // Use name + type for stricter deduplication of entities
            // Fallback to summary if name/type not available
            let uniqueKey = r.summary.toLowerCase().trim();

            if ('metadata' in r && r.metadata && r.metadata.name && r.metadata.type) {
                uniqueKey = `${r.metadata.name}:${r.metadata.type}`.toLowerCase().trim();
            }

            const existing = latestVersions.get(uniqueKey);
            if (!existing || r.timestamp > existing.timestamp) {
                latestVersions.set(uniqueKey, r);
            }
        }

        // 2. Calculate scores ONLY for the latest versions
        const scored = Array.from(latestVersions.values()).map(r => {
            let ageInDays = 0;
            const isStaticFact = 'metadata' in r && r.metadata &&
                ['email', 'phone', 'address', 'birthday', 'website', 'account'].includes(r.metadata.type);

            if (isStaticFact) {
                // Static facts (like emails) do not decay. They are valid forever.
                ageInDays = 0;
            } else if (r.timestamp > 0) {
                ageInDays = (now - r.timestamp) / (1000 * 60 * 60 * 24);
            } else {
                // If timestamp is 0 (unknown), assume it's moderately recent (e.g., 7 days)
                // to avoid penalizing it too heavily compared to brand new items,
                // but still prefer explicitly recent items.
                ageInDays = 7;
            }

            // Exponential decay: recent items get higher scores
            // λ = 0.1 means items lose ~10% value per day
            const recencyScore = Math.exp(-0.1 * ageInDays);

            const semanticWeight = 0.6;
            const recencyWeight = 0.3;
            const graphWeight = 0.1;

            const finalScore =
                semanticWeight * r.similarity +
                recencyWeight * recencyScore +
                graphWeight * ('graphStrength' in r ? r.graphStrength : 0);

            return {
                ...r,
                score: finalScore,
                recencyScore,
                ageInDays: Math.round(ageInDays * 10) / 10
            };
        });

        // 3. Sort by final score descending
        scored.sort((a, b) => b.score - a.score);

        // Log top results for debugging
        if (scored.length > 0) {
            console.log('[MemoryRetrieval] Top result:', {
                summary: scored[0].summary.substring(0, 60) + '...',
                score: scored[0].score.toFixed(3),
                ageInDays: scored[0].ageInDays,
                recencyScore: scored[0].recencyScore.toFixed(3)
            });
        }

        return scored;
    }

    /**
     * Cleanup resources
     */
    async close() {
        // ChromaDB client doesn't need explicit closing
        // Neo4j driver is managed externally
    }
}
