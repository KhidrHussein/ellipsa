import { Knex } from 'knex';
import { z } from 'zod';
import { BaseModel } from './BaseModel';
import { Session, auth as neo4jAuth } from 'neo4j-driver';
import { getEmbeddingFunction } from '../db/vector/chroma';

export const EntityType = z.enum([
  'person',
  'organization',
  'location',
  'event',
  'document',
  'concept',
  'other',
]);

export type EntityType = z.infer<typeof EntityType>;

// Define base schema without metadata default to avoid type issues
const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: EntityType,
  description: z.string().optional(),
  metadata: z.record(z.any()),
  created_at: z.date().or(z.string()).optional(),
  updated_at: z.date().or(z.string()).optional(),
  last_seen_at: z.date().or(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

// Create a type from the base schema
type BaseEntity = z.infer<typeof BaseEntitySchema>;

// Create the final schema with default values
export const EntitySchema = BaseEntitySchema.extend({
  metadata: z.record(z.any()).default({}),
}).transform((data) => ({
  ...data,
  // Ensure metadata is always an object
  metadata: data.metadata || {},
}));

export type Entity = z.infer<typeof EntitySchema>;

// Use BaseEntity for the model to avoid type issues with the transformed schema
export class EntityModel extends BaseModel<BaseEntity> {
  private neo4jSession: Session;
  private collection: any; // ChromaDB collection

  constructor(db: Knex, neo4jSession: Session, collection: any) {
    // Use BaseEntitySchema for the base model to avoid type issues
    super('entities', BaseEntitySchema, db);
    this.neo4jSession = neo4jSession;
    this.collection = collection;
  }

  /**
   * Create a new entity with vector and graph data
   */
  override async create(data: Omit<BaseEntity, 'id' | 'created_at' | 'updated_at'>): Promise<BaseEntity> {
    // Generate embedding for the entity name and description
    const textToEmbed = `${data.name} ${data.description || ''}`.trim();
    const embedding = await this.generateEmbedding(textToEmbed);
    
    // Ensure metadata is an object
    const entityData = {
      ...data,
      metadata: data.metadata || {},
    };
    
    // Create in relational DB
    const entity = await super.create({
      ...data,
      embedding,
    });

    try {
      // Add to vector store
      await this.collection.add(
        [entity.id],
        [embedding],
        [{
          name: entity.name,
          type: entity.type,
          ...entity.metadata,
        }],
        [textToEmbed]
      );

          // Create in graph DB
      await this.neo4jSession.writeTransaction(tx =>
        tx.run(
          `CREATE (e:Entity {
            id: $id,
            name: $name,
            type: $type,
            createdAt: datetime()
          })`,
          {
            id: entity.id,
            name: entity.name,
            type: entity.type,
          }
        )
      );
    } catch (error) {
      // Clean up if anything fails
      await super.delete(entity.id);
      throw error;
    }

    return entity;
  }

  /**
   * Find similar entities using vector search
   */
  async findSimilar(
    text: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<{ entity: Entity; score: number }[]> {
    const { limit = 5, threshold = 0.7 } = options;
    
    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(text);
    
    // Query the vector store
    const results = await this.collection.query(
      queryEmbedding,
      limit,
      undefined,
      undefined,
      ['documents', 'metadatas', 'distances']
    );

    // Get full entity details from the database
    const entities = await Promise.all(
      results.ids[0].map(async (id: string, index: number) => {
        const entity = await this.findById(id);
        const score = 1 - (results.distances?.[0]?.[index] || 0); // Convert distance to similarity score
        return entity ? { entity, score } : null;
      })
    );

    // Filter out nulls and apply threshold, then sort by score
    return entities
      .filter((item): item is { entity: Entity; score: number } => 
        item !== null && item.score >= threshold
      )
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Update an entity and its vector/graph data
   */
  override async update(
    id: string, 
    data: Partial<Omit<BaseEntity, 'id' | 'created_at'>>
  ): Promise<BaseEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // If name or description changed, update the embedding
    let embedding = existing.embedding;
    if (data.name || data.description) {
      const textToEmbed = `${data.name || existing.name} ${data.description || existing.description || ''}`.trim();
      if (existing.type === 'person') {
        embedding = await this.generateEmbedding(textToEmbed, 'person');
      } else if (existing.type === 'organization') {
        embedding = await this.generateEmbedding(textToEmbed, 'organization');
      } else if (existing.type === 'location') {
        embedding = await this.generateEmbedding(textToEmbed, 'location');
      } else if (existing.type === 'event') {
        embedding = await this.generateEmbedding(textToEmbed, 'event');
      } else if (existing.type === 'document') {
        embedding = await this.generateEmbedding(textToEmbed, 'document');
      } else if (existing.type === 'concept') {
        embedding = await this.generateEmbedding(textToEmbed, 'concept');
      } else {
        embedding = await this.generateEmbedding(textToEmbed, 'other');
      }
    }

    // Update in relational DB
    const updated = await super.update(id, { ...data, embedding });
    if (!updated) return null;

    try {
      // Update in vector store
      await this.collection.update(
        [id],
        [embedding],
        [{
          name: updated.name,
          type: updated.type,
          ...updated.metadata,
        }],
        [`${updated.name} ${updated.description || ''}`.trim()]
      );

      // Update in graph DB
      await this.neo4jSession.writeTransaction(tx =>
        tx.run(
          `MATCH (e:Entity {id: $id})
           SET e.name = $name,
               e.type = $type,
               e.updatedAt = datetime()`,
          {
            id,
            name: updated.name,
            type: updated.type,
          }
        )
      );
    } catch (error) {
      console.error('Error updating entity in vector/graph store:', error);
      // We don't want to fail the entire operation if vector/graph update fails
    }

    return updated;
  }

  /**
   * Delete an entity and its vector/graph representations
   */
  override async delete(id: string): Promise<boolean> {
    const deleted = await super.delete(id);
    if (!deleted) return false;

    try {
      // Delete from vector store
      await this.collection.delete([id]);

      // Delete from graph DB
      await this.neo4jSession.writeTransaction(tx =>
        tx.run(
          'MATCH (e:Entity {id: $id}) DETACH DELETE e',
          { id }
        )
      );
    } catch (error) {
      console.error('Error deleting entity from vector/graph store:', error);
      // We don't want to fail the entire operation if vector/graph delete fails
    }

    return true;
  }

  /**
   * Create a relationship between two entities
   */
  async createRelationship(
    fromId: string,
    toId: string,
    type: string,
    properties: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      await this.neo4jSession.writeTransaction(tx =>
        tx.run(
          `MATCH (a:Entity {id: $fromId}), (b:Entity {id: $toId})
           MERGE (a)-[r:${type} $props]->(b)`,
          {
            fromId,
            toId,
            props: {
              ...properties,
              createdAt: new Date().toISOString(),
            },
          }
        )
      );
      return true;
    } catch (error) {
      console.error('Error creating relationship:', error);
      return false;
    }
  }

  /**
   * Find related entities
   */
  async findRelated(
    id: string,
    options: { type?: string; direction?: 'incoming' | 'outgoing' | 'both' } = {}
  ): Promise<{ entity: Entity; relationship: string; properties: Record<string, any> }[]> {
    const { type = '*', direction = 'outgoing' } = options;
    
    let cypher = '';
    const params: any = { id };

    if (direction === 'outgoing') {
      cypher = `MATCH (a:Entity {id: $id})-[r${type ? ':' + type : ''}]->(b:Entity) RETURN b, type(r) as relType, properties(r) as relProps`;
    } else if (direction === 'incoming') {
      cypher = `MATCH (a:Entity {id: $id})<-[r${type ? ':' + type : ''}]-(b:Entity) RETURN b, type(r) as relType, properties(r) as relProps`;
    } else {
      cypher = `MATCH (a:Entity {id: $id})-[r${type ? ':' + type : ''}]-(b:Entity) RETURN b, type(r) as relType, properties(r) as relProps`;
    }

    try {
      const result = await this.neo4jSession.readTransaction(tx =>
        tx.run(cypher, params)
      );

      return await Promise.all(
        result.records.map(async record => {
          const entityData = record.get('b').properties;
          const entity = await this.findById(entityData.id);
          return {
            entity: entity || entityData,
            relationship: record.get('relType'),
            properties: record.get('relProps'),
          };
        })
      );
    } catch (error) {
      console.error('Error finding related entities:', error);
      return [];
  }
}

  /**
   * Generate an embedding for the given text
   * @param text The text to generate an embedding for
   * @param entityType Optional entity type to include in the embedding context
   */
  private async generateEmbedding(text: string, entityType?: string): Promise<number[]> {
    if (!text) return [];
    
    try {
      // Include entity type in the text to generate more relevant embeddings
      const textToEmbed = entityType ? `[${entityType}] ${text}` : text;
      const embedding = await getEmbeddingFunction().generate([textToEmbed]);
      return embedding[0]; // Return the first (and only) embedding vector
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }
}
