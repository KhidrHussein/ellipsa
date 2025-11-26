import { Knex } from 'knex';
import { z } from 'zod';
import { Session, Transaction } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { BaseModel, PaginationOptions, PaginatedResult, DatabaseError, ValidationError } from './BaseModel';
import { getEmbeddingFunction } from '../db/vector/chroma';

// Types for entity relationships
export const RelationshipType = z.enum([
  'part_of',
  'related_to',
  'works_at',
  'knows',
  'attended',
  'authored',
  'mentions',
  'custom'
]);

export type RelationshipType = z.infer<typeof RelationshipType>;

export interface EntityRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  metadata?: Record<string, unknown>;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface EntitySearchOptions extends PaginationOptions {
  type?: EntityType;
  minSimilarity?: number;
  includeRelated?: boolean;
  relationshipTypes?: RelationshipType[];
  [key: string]: unknown;
}

export interface EntityDedupeOptions {
  similarityThreshold?: number;
  mergeStrategy?: 'keep_earliest' | 'keep_latest' | 'merge';
  mergeMetadata?: boolean;
}

export const EntityType = z.enum([
  'person',
  'organization',
  'location',
  'event',
  'document',
  'concept',
  'task',
  'action_item',
  'file',
  'service',
  'project',
  'technology',
  'other',
]);

export type EntityType = z.infer<typeof EntityType>;

const BaseEntitySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  type: EntityType,
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.date().or(z.string()).optional(),
  updated_at: z.date().or(z.string()).optional(),
  deleted_at: z.date().or(z.string()).nullable().optional(),
  last_seen_at: z.date().or(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

type BaseEntity = z.infer<typeof BaseEntitySchema>;

export const EntitySchema = BaseEntitySchema.extend({
  metadata: z.record(z.unknown()).default({}),
}).transform((data) => ({
  ...data,
  metadata: data.metadata || {},
}));

export type Entity = z.infer<typeof EntitySchema>;

type EntityInput = Omit<BaseEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
type EntityUpdate = Partial<Omit<BaseEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export class EntityModel extends BaseModel<BaseEntity, EntityInput, EntityUpdate> {
  private neo4jSession: Session;
  private collection: any;
  private embeddingFunction: any;
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly DEDUPE_SIMILARITY_THRESHOLD = 0.9;
  private readonly FUZZY_SEARCH_MIN_LENGTH = 3;
  private readonly FUZZY_SEARCH_MAX_DISTANCE = 2;

  constructor(db: Knex, neo4jSession: Session, collection: any) {
    super('entities', BaseEntitySchema, db, true);
    this.neo4jSession = neo4jSession;
    this.collection = collection;
    this.embeddingFunction = getEmbeddingFunction();
  }

  /**
   * Create a new entity with vector and graph data
   */
  override async create(
    data: EntityInput,
    trx?: Knex.Transaction,
    _options?: Record<string, unknown>
  ): Promise<BaseEntity> {
    const duplicates = await this.findPotentialDuplicates(data.name, data.type);
    if (duplicates.length > 0) {
      console.warn('Potential duplicate entities found:', duplicates);
    }

    const textToEmbed = `${data.name} ${data.description || ''}`.trim();
    const embedding = await this.generateEmbedding(textToEmbed);

    const entityData: EntityInput = {
      ...data,
      metadata: data.metadata || {},
      last_seen_at: new Date().toISOString(),
    };

    const createFn = async (tx: Knex.Transaction): Promise<BaseEntity> => {
      // Validate data first (embedding should be an array here)
      const validatedData = this.validate({
        ...entityData,
        embedding,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      });

      // Stringify embedding for DB insertion
      const dbData = {
        ...validatedData,
        embedding: JSON.stringify(embedding) as any,
      };

      const [result] = await tx(this.tableName)
        .insert(dbData)
        .returning('*');

      const entity = this.toEntity(result);

      if (!entity?.id) {
        throw new Error('Failed to create entity: missing ID');
      }

      try {
        await this.collection.add(
          [entity.id],
          [embedding],
          [{
            name: entity.name,
            type: entity.type,
            ...(entity.metadata || {}),
          }],
          [textToEmbed]
        );

        await this.neo4jSession.writeTransaction((neo4jTx: Transaction) =>
          neo4jTx.run(
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

        return entity;
      } catch (error) {
        if (entity?.id) {
          await this.hardDeleteById(entity.id, tx);
        }
        throw error;
      }
    };

    return trx ? await createFn(trx) : await this.withTransaction(createFn);
  }

  /**
   * Generate embedding for the given text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!text) return [];

    try {
      const result = await this.embeddingFunction.generate([text]);
      if (!result || !result.embeddings || !result.embeddings[0]) {
        console.warn('Embedding service returned no result for text:', text.substring(0, 50));
        return new Array(1536).fill(0); // Return zero vector as fallback
      }
      return result.embeddings[0] as number[];
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      return new Array(1536).fill(0); // Return zero vector on error to allow processing to continue
    }
  }

  /**
   * Find potential duplicate entities
   */
  private async findPotentialDuplicates(
    name: string,
    type?: EntityType,
    threshold: number = this.SIMILARITY_THRESHOLD
  ): Promise<BaseEntity[]> {
    if (!name) return [];

    try {
      const embedding = await this.generateEmbedding(name);

      const queryOptions: any = {
        queryEmbeddings: [embedding],
        nResults: 5,
        include: ['metadatas', 'documents', 'distances'],
      };

      if (type) {
        queryOptions.where = { type };
      }

      const results = await this.collection.query(queryOptions);

      if (!results.matches || !results.matches[0]) return [];

      return results.matches[0]
        .filter((match: any) => match?.score >= threshold)
        .map((match: any) => ({
          id: String(match?.id || ''),
          name: String(match?.metadata?.name || ''),
          type: match?.metadata?.type as EntityType,
          description: match?.metadata?.description as string | undefined,
          metadata: match?.metadata?.metadata || {},
          created_at: match?.metadata?.created_at,
          updated_at: match?.metadata?.updated_at,
          last_seen_at: match?.metadata?.last_seen_at,
        }));
    } catch (error) {
      console.error('Error finding potential duplicates:', error);
      return [];
    }
  }

  /**
   * Create a relationship between two entities
   */
  async createRelationship(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    metadata: Record<string, unknown> = {},
    trx?: Knex.Transaction
  ): Promise<EntityRelationship> {
    if (!sourceId || !targetId) {
      throw new ValidationError('Source and target IDs are required');
    }

    const relationshipId = uuidv4();
    const now = new Date().toISOString();

    const createFn = async (tx: Knex.Transaction): Promise<EntityRelationship> => {
      const [relationship] = await tx('entity_relationships')
        .insert({
          id: relationshipId,
          source_id: sourceId,
          target_id: targetId,
          type,
          metadata: JSON.stringify(metadata),
          created_at: now,
          updated_at: now,
        })
        .returning('*');

      await this.neo4jSession.writeTransaction((neo4jTx: Transaction) =>
        neo4jTx.run(
          `MATCH (a:Entity {id: $sourceId}), (b:Entity {id: $targetId})
           MERGE (a)-[r:${type} {id: $id}]->(b)
           SET r.metadata = $metadata,
               r.created_at = $createdAt,
               r.updated_at = $updatedAt
           RETURN r`,
          {
            sourceId,
            targetId,
            id: relationshipId,
            metadata: JSON.stringify(metadata),
            createdAt: now,
            updatedAt: now,
          }
        )
      );

      return {
        id: relationshipId,
        sourceId,
        targetId,
        type,
        metadata,
        created_at: now,
        updated_at: now,
      };
    };

    return trx ? createFn(trx) : this.withTransaction(createFn);
  }

  /**
   * Get all relationships for an entity
   */
  async getRelationships(
    entityId: string,
    options: { type?: RelationshipType; direction?: 'incoming' | 'outgoing' | 'both' } = {}
  ): Promise<EntityRelationship[]> {
    if (!entityId) return [];

    const { type, direction = 'both' } = options;

    let directionClause = '';
    if (direction === 'incoming') directionClause = '<-';
    else if (direction === 'outgoing') directionClause = '->';
    else directionClause = '-';

    const typeFilter = type ? `:${type}` : '';

    try {
      const result = await this.neo4jSession.readTransaction((tx: Transaction) =>
        tx.run(
          `MATCH (a:Entity {id: $entityId})${directionClause}[r${typeFilter}]-${directionClause}(b:Entity)
           RETURN r, startNode(r).id as sourceId, endNode(r).id as targetId`,
          { entityId }
        )
      );

      if (!result.records || !Array.isArray(result.records)) return [];

      return result.records.map((record: any) => {
        const rel = record.get('r');
        const props = rel?.properties || {};

        let parsedMetadata = {};
        if (props.metadata) {
          try {
            parsedMetadata = typeof props.metadata === 'string'
              ? JSON.parse(props.metadata)
              : props.metadata;
          } catch (e) {
            console.warn('Failed to parse relationship metadata:', e);
          }
        }

        return {
          id: String(props.id || ''),
          sourceId: String(record.get('sourceId') || ''),
          targetId: String(record.get('targetId') || ''),
          type: rel.type as RelationshipType,
          metadata: parsedMetadata,
          created_at: props.created_at,
          updated_at: props.updated_at,
        };
      });
    } catch (error) {
      console.error('Error getting relationships:', error);
      return [];
    }
  }

  /**
   * Remove a relationship between entities
   */
  async removeRelationship(relationshipId: string, trx?: Knex.Transaction): Promise<void> {
    await this.neo4jSession.writeTransaction((tx: Transaction) =>
      tx.run(
        `MATCH ()-[r {id: $id}]->()
         DELETE r`,
        { id: relationshipId }
      )
    );

    await (trx || this.db)('entity_relationships')
      .where('id', relationshipId)
      .delete();
  }

  /**
   * Merge duplicate entities
   */
  async mergeEntities(
    primaryId: string,
    duplicateIds: string[],
    options: EntityDedupeOptions = {}
  ): Promise<BaseEntity> {
    const trx = await this.db.transaction();

    try {
      const primary = await this.findById(primaryId, trx);
      if (!primary) {
        throw new Error(`Primary entity ${primaryId} not found`);
      }

      const duplicates = await Promise.all(
        duplicateIds
          .filter(id => id !== primaryId)
          .map(id => this.findById(id, trx))
      );

      if (options.mergeMetadata) {
        const mergedMetadata: Record<string, any> = { ...primary.metadata };
        duplicates.forEach(dup => {
          if (dup && dup.id) {
            mergedMetadata.mergedFrom = [
              ...(Array.isArray(mergedMetadata.mergedFrom) ? mergedMetadata.mergedFrom : []),
              { id: dup.id, name: dup.name, mergedAt: new Date().toISOString() }
            ];
            Object.entries(dup.metadata || {}).forEach(([key, value]) => {
              if (!(key in mergedMetadata)) {
                mergedMetadata[key] = value;
              }
            });
          }
        });

        await this.update(primaryId, { metadata: mergedMetadata }, trx);
      }

      for (const dup of duplicates) {
        if (!dup || !dup.id) continue;

        const relationships = await this.getRelationships(dup.id);

        for (const rel of relationships) {
          try {
            const isSource = rel.sourceId === dup.id;
            const otherId = isSource ? rel.targetId : rel.sourceId;
            const newSourceId = isSource ? primaryId : otherId;
            const newTargetId = isSource ? otherId : primaryId;

            const exists = await this.getRelationships(primaryId, {
              type: rel.type,
              direction: isSource ? 'outgoing' : 'incoming'
            }).then(rels => rels.some(r =>
              (isSource ? r.targetId : r.sourceId) === otherId
            ));

            if (!exists) {
              await this.createRelationship(
                newSourceId,
                newTargetId,
                rel.type,
                rel.metadata,
                trx
              );
            }
          } catch (error) {
            console.error(`Error processing relationship for duplicate ${dup.id}:`, error);
          }
        }

        await this.delete(dup.id, trx);
      }

      await trx.commit();
      return await this.findById(primaryId) as BaseEntity;
    } catch (error) {
      await trx.rollback();
      console.error('Error merging entities:', error);
      throw error;
    }
  }

  /**
   * Calculate text similarity using various methods
   */
  private calculateTextSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;

    const str1 = a.toLowerCase();
    const str2 = b.toLowerCase();

    if (str1 === str2) return 1.0;
    if (str1.startsWith(str2) || str2.startsWith(str1)) return 0.9;
    if (str1.endsWith(str2) || str2.endsWith(str1)) return 0.8;
    if (str1.includes(str2) || str2.includes(str1)) return 0.7;

    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            )
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Perform a fuzzy search for entities by name
   */
  async fuzzySearch(
    query: string,
    options: {
      type?: EntityType;
      limit?: number;
      minScore?: number;
      fields?: (keyof BaseEntity)[];
    } = {}
  ): Promise<Array<{ entity: BaseEntity; score: number }>> {
    if (!query) return [];
    const {
      type,
      limit = 10,
      minScore = 0.7,
      fields = ['name', 'description']
    } = options;

    try {
      if (query.length < this.FUZZY_SEARCH_MIN_LENGTH) {
        const exactMatches = await this.db(this.tableName)
          .where(function () {
            this.where('name', 'like', `%${query}%`);
            if (type) this.andWhere('type', type);
          })
          .limit(limit)
          .select('*');

        return exactMatches.map(entity => ({
          entity: this.toEntity(entity),
          score: 1.0
        }));
      }

      const embedding = await this.generateEmbedding(query);

      const queryOptions: any = {
        queryEmbeddings: [embedding],
        nResults: limit * 2,
        include: ['metadatas', 'distances'],
      };

      if (type) {
        queryOptions.where = { type };
      }

      const results = await this.collection.query(queryOptions);

      if (!results.matches || !results.matches[0]) return [];

      const scoredResults = results.matches[0]
        .map((match: any) => {
          const entity = {
            id: match.id,
            ...match.metadata,
            metadata: typeof match.metadata.metadata === 'string'
              ? JSON.parse(match.metadata.metadata)
              : match.metadata.metadata || {}
          };

          const fieldValues = fields
            .map(field => {
              const value = entity[field];
              return typeof value === 'string' ? value : '';
            })
            .filter(Boolean)
            .join(' ');

          const textScore = this.calculateTextSimilarity(query, fieldValues);
          const combinedScore = (match.score * 0.7) + (textScore * 0.3);

          return {
            entity: this.toEntity(entity),
            score: combinedScore
          };
        })
        .filter((result: any) => result.score >= minScore)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit);

      return scoredResults;
    } catch (error) {
      console.error('Error in fuzzy search:', error);
      return [];
    }
  }

  /**
   * Get entities related to a given entity
   */
  async getRelatedEntities(
    entityId: string,
    options: {
      types?: RelationshipType[];
      limit?: number;
    } = {}
  ): Promise<BaseEntity[]> {
    if (!entityId) return [];

    const { types, limit = 10 } = options;

    try {
      const typeClause = types && types.length > 0
        ? `:${types.join('|')}`
        : '';

      const cypher = `
        MATCH (e:Entity {id: $entityId})-[r${typeClause}]-(related:Entity)
        RETURN DISTINCT related
        ${limit ? 'LIMIT $limit' : ''}
      `;

      const result = await this.neo4jSession.readTransaction((tx: Transaction) =>
        tx.run(cypher, { entityId, limit })
      );

      return result.records.map(record => {
        const node = record.get('related');
        const props = node.properties as Record<string, any>;

        let metadata: Record<string, unknown> = {};
        if (props.metadata) {
          try {
            metadata = typeof props.metadata === 'string'
              ? JSON.parse(props.metadata)
              : props.metadata;
          } catch (e) {
            console.warn('Failed to parse metadata:', e);
          }
        }

        return this.toEntity({
          ...props,
          id: String(props.id || ''),
          metadata
        });
      });
    } catch (error) {
      console.error('Error getting related entities:', error);
      return [];
    }
  }

  /**
   * Search entities with both exact and fuzzy matching
   */
  async search(
    query: string,
    options: EntitySearchOptions = {}
  ): Promise<PaginatedResult<BaseEntity>> {
    const {
      page = 1,
      pageSize = 10,
      minSimilarity = 0.7,
      includeRelated = false,
      relationshipTypes
    } = options;

    try {
      const exactMatch = await this.db(this.tableName)
        .where('name', query)
        .first();

      if (exactMatch) {
        const entity = this.toEntity(exactMatch);
        return {
          data: [entity],
          pagination: {
            page: 1,
            pageSize: 1,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          }
        };
      }

      const fuzzySearchOpts: {
        type?: EntityType;
        limit: number;
        minScore: number;
        fields?: (keyof BaseEntity)[];
      } = {
        limit: pageSize,
        minScore: minSimilarity
      };

      if (options.type) {
        fuzzySearchOpts.type = options.type;
      }

      const fuzzyResults = await this.fuzzySearch(query, fuzzySearchOpts);

      let relatedEntities: BaseEntity[] = [];
      if (includeRelated && fuzzyResults.length > 0) {
        const relatedPromises = fuzzyResults
          .filter(result => result.entity.id)
          .map(result =>
            this.getRelatedEntities(result.entity.id as string, { types: relationshipTypes })
          );
        const relatedResults = await Promise.all(relatedPromises);
        relatedEntities = relatedResults.flat();
      }

      const allResults = [
        ...fuzzyResults.map(r => r.entity),
        ...relatedEntities
      ];

      const uniqueResults = Array.from(
        new Map(allResults.filter(item => item.id).map(item => [item.id, item])).values()
      );

      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedResults = uniqueResults.slice(start, end);

      return {
        data: paginatedResults,
        pagination: {
          page,
          pageSize,
          totalItems: uniqueResults.length,
          totalPages: Math.ceil(uniqueResults.length / pageSize),
          hasNextPage: end < uniqueResults.length,
          hasPreviousPage: start > 0
        }
      };
    } catch (error) {
      console.error('Error in entity search:', error);
      return {
        data: [],
        pagination: {
          page,
          pageSize,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false
        }
      };
    }
  }
}

export default EntityModel;