import { Knex } from 'knex';
import { z, ZodType } from 'zod';

/**
 * Base type for all model entities
 */
export type BaseModelType = {
  id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
  metadata?: Record<string, any>;
  [key: string]: any;
};

export type ModelInput<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

export abstract class BaseModel<
  T extends BaseModelType,
  TCreate = Omit<T, 'id' | 'created_at' | 'updated_at'>,
  TBase = T
> {
  constructor(
    protected tableName: string,
    protected schema: ZodType<T, any, TBase>,
    protected db: Knex
  ) {}

  /**
   * Validate data against the schema
   */
  protected validate(data: unknown): T {
    const result = this.schema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation failed: ${JSON.stringify(result.error.issues)}`);
    }
    return result.data;
  }

  /**
   * Create a new record
   */
  async create(data: TCreate): Promise<T> {
    const validatedData = this.validate({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    const [result] = await this.db(this.tableName)
      .insert(validatedData)
      .returning('*');
    
    return this.toEntity(result);
  }
  /**
   * Find a record by ID
   */
  async findById(id: string): Promise<T | null> {
    const result = await this.db(this.tableName).where({ id }).first();
    return result ? this.toEntity(result) : null;
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<TCreate>): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    
    const validatedData = this.validate({
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
    });
    
    const [result] = await this.db(this.tableName)
      .where({ id })
      .update(validatedData)
      .returning('*');
    
    return this.toEntity(result);
  }

  /**
   * Delete a record by ID
   */
  /**
   * Convert a database record to the entity type
   */
  protected toEntity(data: any): T {
    return data as T;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.db(this.tableName).where({ id }).del();
    return count > 0;
  }

  /**
   * Find records matching the given criteria
   * @param where Conditions to filter records
   * @param options Query options (limit, offset)
   * @returns Array of matching records
   */
  async find(
    where: Partial<T> = {},
    options: { limit?: number; offset?: number } = {}
  ): Promise<T[]> {
    const query = this.db(this.tableName).where(where);
    
    if (options.limit) {
      query.limit(options.limit);
    }
    
    if (options.offset) {
      query.offset(options.offset);
    }
    
    const results = await query;
    return results.map(result => this.validate(result));
  }
}
