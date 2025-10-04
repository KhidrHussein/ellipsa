import { Knex } from 'knex';
import { z, ZodType } from 'zod';

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: any[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export type SoftDeletable = {
  deleted_at?: Date | string | null;
};

export type TransactionCallback<T> = (trx: Knex.Transaction) => Promise<T>;

/**
 * Base type for all model entities
 */
export type BaseModelType = {
  id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
  deleted_at?: Date | string | null;
  metadata?: Record<string, any>;
  [key: string]: any;
} & SoftDeletable;

export type ModelInput<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

export abstract class BaseModel<
  T extends BaseModelType,
  TCreate = Omit<T, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>,
  TUpdate = Partial<TCreate>,
  TBase = T
> {
  constructor(
    protected tableName: string,
    protected schema: ZodType<T, any, TBase>,
    protected db: Knex,
    protected softDelete: boolean = true
  ) {}

  /**
   * Validate data against the schema
   */
  protected validate(data: unknown, strict: boolean = true): T {
    // For non-strict validation, we'll use passthrough() instead of strict()
    const result = strict 
      ? (this.schema as any).strict().safeParse(data)
      : (this.schema as any).passthrough().safeParse(data);
      
    if (!result.success) {
      throw new ValidationError(
        'Validation failed',
        result.error.issues
      );
    }
    return result.data as T;
  }

  /**
   * Create a new record within a transaction
   */
  async create(data: TCreate, trx?: Knex.Transaction): Promise<T> {
    const createFn = async (tx: Knex.Transaction) => {
      const validatedData = this.validate({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      });
      
      const [result] = await tx(this.tableName)
        .insert(validatedData)
        .returning('*');
      
      return this.toEntity(result);
    };

    return trx ? createFn(trx) : this.withTransaction(createFn);
  }
  /**
   * Execute a function within a transaction
   */
  async withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const trx = await this.db.transaction();
    try {
      const result = await callback(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new DatabaseError(
        'Transaction failed',
        error,
        (error as any).code
      );
    }
  }

  /**
   * Build a query with soft delete filtering if enabled
   */
  protected query(trx?: Knex.Transaction) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return this.softDelete 
      ? query.whereNull('deleted_at') 
      : query;
  }

  /**
   * Find a record by ID
   */
  async findById(id: string, trx?: Knex.Transaction): Promise<T | null> {
    try {
      const result = await this.query(trx).where({ id }).first();
      return result ? this.toEntity(result) : null;
    } catch (error) {
      throw new DatabaseError(
        `Failed to find ${this.tableName} with id ${id}`,
        error,
        (error as any).code
      );
    }
  }

  /**
   * Update a record by ID
   */
  async update(
    id: string, 
    data: TUpdate,
    trx?: Knex.Transaction
  ): Promise<T | null> {
    const updateFn = async (tx: Knex.Transaction) => {
      const existing = await this.findById(id, tx);
      if (!existing) return null;
      
      const validatedData = this.validate(
        {
          ...existing,
          ...data,
          updated_at: new Date().toISOString(),
        },
        false // Use non-strict validation to allow partial updates
      );
      
      const [result] = await tx(this.tableName)
        .where({ id })
        .update(validatedData)
        .returning('*');
      
      return this.toEntity(result);
    };

    return trx ? updateFn(trx) : this.withTransaction(updateFn);
  }

  /**
   * Soft delete a record by ID
   */
  async softDeleteById(id: string, trx?: Knex.Transaction): Promise<boolean> {
    if (!this.softDelete) {
      return this.hardDeleteById(id, trx);
    }

    const deleteFn = async (tx: Knex.Transaction) => {
      const result = await tx(this.tableName)
        .where({ id })
        .update({ 
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        });
      return result > 0;
    };

    return trx ? deleteFn(trx) : this.withTransaction(deleteFn);
  }

  /**
   * Permanently delete a record by ID
   */
  async hardDeleteById(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const deleteFn = async (tx: Knex.Transaction) => {
      const count = await tx(this.tableName).where({ id }).del();
      return count > 0;
    };

    return trx ? deleteFn(trx) : this.withTransaction(deleteFn);
  }

  /**
   * Delete a record by ID (uses soft delete if enabled)
   */
  async delete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    return this.softDelete
      ? this.softDeleteById(id, trx)
      : this.hardDeleteById(id, trx);
  }

  /**
   * Find all records with pagination and filtering
   */
  async findAll(
    filters: Record<string, any> = {},
    options: PaginationOptions = {},
    trx?: Knex.Transaction
  ): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    const offset = (page - 1) * pageSize;
    
    // Build base query
    let query = this.query(trx).where(filters);
    
    // Get total count
    const countResult = await query.clone().count('* as count').first();
    const totalItems = countResult ? Number(countResult.count) : 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Apply pagination and sorting
    const items = await query
      .orderBy(sortBy, sortOrder)
      .offset(offset)
      .limit(pageSize);

    return {
      data: items.map(item => this.toEntity(item)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find one record matching the filters
   */
  async findOne(
    filters: Record<string, any> = {},
    trx?: Knex.Transaction
  ): Promise<T | null> {
    const result = await this.query(trx).where(filters).first();
    return result ? this.toEntity(result) : null;
  }

  /**
   * Count records matching the filters
   */
  async count(
    filters: Record<string, any> = {},
    trx?: Knex.Transaction
  ): Promise<number> {
    const result = await this.query(trx).where(filters).count('* as count').first();
    return result ? Number(result.count) : 0;
  }

  /**
   * Convert a database record to the entity type
   */
  protected toEntity(data: any): T {
    return data as T;
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
