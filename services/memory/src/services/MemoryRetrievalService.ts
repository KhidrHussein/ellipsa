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
    async retrieveRelevantContext(query: string, limit: number = 5): Promise<MemoryBullet[]> {
        try {
            // 1. Vector search in ChromaDB
            const vectorResults = await this.vectorSearch(query, limit * 3);

            // 2. Graph search in Neo4j (if entities detected)
            const graphResults = await this.graphSearch(query, limit * 2);

            // 3. Combine and rerank with recency
            const scored = this.rerankWithRecency([...vectorResults, ...graphResults]);

            // 4. Return top K as bullet points
            return scored.slice(0, limit).map(r => ({
                text: r.summary,
                source: r.event_id,
                timestamp: new Date(r.timestamp),
                confidence: r.score
            }));
        } catch (error) {
            console.error('[MemoryRetrieval] Error retrieving context:', error);
            return [];
        }
    }

    /**
     * Vector search using ChromaDB semantic similarity
     */
    private async vectorSearch(query: string, limit: number): Promise<VectorResult[]> {
        if (!this.eventsCollection) {
            console.warn('[MemoryRetrieval] Events collection not initialized');
            return [];
        }

        try {
            const results = await this.eventsCollection.query({
                queryTexts: [query],
                nResults: limit
            } as any);

            if (!results.ids || !results.ids[0] || results.ids[0].length === 0) {
                console.log('[MemoryRetrieval] No vector results found');
                return [];
            }

            // Transform ChromaDB results
            const vectorResults: VectorResult[] = [];
            for (let i = 0; i < results.ids[0].length; i++) {
                const metadata = results.metadatas?.[0]?.[i] as any;
                const distance = results.distances?.[0]?.[i] || 1;

                if (metadata) {
                    vectorResults.push({
                        id: results.ids[0][i] as string,
                        summary: metadata.summary || metadata.description || 'No summary',
                        similarity: 1 - distance, // Convert distance to similarity
                        timestamp: metadata.timestamp ? new Date(metadata.timestamp).getTime() : Date.now(),
                        event_id: metadata.event_id || results.ids[0][i] as string
                    });
                }
            }

            console.log(`[MemoryRetrieval] Vector search found ${vectorResults.length} results`);
            return vectorResults;
        } catch (error) {
            console.error('[MemoryRetrieval] Vector search error:', error);
            return [];
        }
    }

    /**
     * Graph search using Neo4j to find related entities and events
     */
    private async graphSearch(query: string, limit: number): Promise<GraphResult[]> {
        const session: Session = this.neo4jDriver.session();

        try {
            // Extract potential entity names from query (simple approach)
            const entities = this.extractPotentialEntities(query);

            if (entities.length === 0) {
                return [];
            }

            // Query Neo4j for events related to these entities
            const cypher = `
        MATCH (e:Entity)-[r:RELATED_TO|PART_OF]-(evt:Event)
        WHERE e.name IN $entities
        RETURN evt.id as event_id, 
               evt.description as summary,
               evt.created_at as timestamp,
        ORDER BY relationship_count DESC
        LIMIT $limit
            `;

            const result = await session.run(cypher, { entities, limit: neo4j.int(limit) });

            const graphResults: GraphResult[] = result.records.map(record => ({
                event_id: record.get('event_id'),
                summary: record.get('summary') || 'No summary',
                timestamp: new Date(record.get('timestamp')).getTime(),
                graphStrength: record.get('relationship_count').toNumber(),
                similarity: 0.5 // Neutral similarity for graph results
            }));

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

        const scored = results.map(r => {
            const ageInDays = (now - r.timestamp) / (1000 * 60 * 60 * 24);

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

        // Sort by final score descending
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
