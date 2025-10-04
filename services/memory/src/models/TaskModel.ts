import { Knex } from 'knex';
import { z, type ZodType } from 'zod';
import { BaseModel } from './BaseModel';
import type { PaginationOptions, PaginatedResult } from './BaseModel';
import type { Session, Transaction } from 'neo4j-driver';

// Extend PaginationOptions to include status filter
type TaskPaginationOptions = PaginationOptions & {
  status?: string[];
};

export const TaskStatus = z.enum([
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'cancelled',
]);

export const TaskPriority = z.enum([
  'low',
  'medium',
  'high',
  'urgent',
]);

export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskPriority = z.infer<typeof TaskPriority>;

// Schema with defaults for runtime validation
export const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatus.default('pending'),
  priority: TaskPriority.default('medium'),
  due_date: z.string().or(z.date()).optional(),
  completed_at: z.string().or(z.date()).optional(),
  assignee_id: z.string().uuid().optional(),
  created_by: z.string().uuid().optional(),
  related_entity_id: z.string().uuid().optional(),
  related_event_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.date().or(z.string()).optional(),
  updated_at: z.date().or(z.string()).optional(),
  deleted_at: z.date().or(z.string()).nullable().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
type TaskInput = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
type TaskUpdate = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export class TaskModel extends BaseModel<Task, TaskInput, TaskUpdate> {
  private neo4jSession: Session;

  constructor(db: Knex, neo4jSession: Session) {
    super('tasks', TaskSchema as unknown as ZodType<Task>, db, true);
    this.neo4jSession = neo4jSession;
  }

  /**
   * Create a new task with graph relationships
   */
  override async create(
    data: TaskInput,
    trx?: Knex.Transaction,
    _options?: Record<string, unknown>
  ): Promise<Task> {
    // Ensure required fields have default values
    const taskData: TaskInput = {
      ...data,
      status: data.status || 'pending',
      priority: data.priority || 'medium',
      metadata: data.metadata || {},
    };
    
    // Create in relational DB
    const task = await super.create(taskData, trx);

    try {
      // Create in graph DB
      await this.neo4jSession.writeTransaction((tx: Transaction) =>
        tx.run(
          `CREATE (t:Task {
            id: $id,
            title: $title,
            status: $status,
            priority: $priority,
            dueDate: $dueDate ? datetime($dueDate) : null,
            createdAt: datetime()
          })`,
          {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueDate: task.due_date,
          }
        )
      );

      // Create relationships if assignee or related entities exist
      if (task.assignee_id) {
        await this.neo4jSession.writeTransaction((tx: Transaction) =>
          tx.run(
            `MATCH (e:Entity {id: $assigneeId}), (t:Task {id: $taskId})
             MERGE (e)-[:ASSIGNED_TO]->(t)`,
            {
              assigneeId: task.assignee_id,
              taskId: task.id,
            }
          )
        );
      }

      if (task.related_entity_id) {
        await this.neo4jSession.writeTransaction((tx: Transaction) =>
          tx.run(
            `MATCH (e:Entity {id: $entityId}), (t:Task {id: $taskId})
             MERGE (t)-[:RELATED_TO]->(e)`,
            {
              entityId: task.related_entity_id,
              taskId: task.id,
            }
          )
        );
      }

      return task;
    } catch (error) {
      console.error('Error creating task in graph DB:', error);
      throw error;
    }
  }

  /**
   * Find tasks by assignee
   */
  override async findAll(
    filters: Record<string, unknown> = {},
    options: TaskPaginationOptions = {},
    trx?: Knex.Transaction
  ): Promise<PaginatedResult<Task>> {
    const { status } = options;
    
    // If we have an assignee_id filter, use the graph DB for the query
    if (filters.assignee_id) {
      return this.findByAssignee(filters.assignee_id as string, options, trx);
    }
    
    // Otherwise, use the standard SQL-based query with proper pagination
    const query = (trx || this.db)(this.tableName).where(filters);
    
    // Apply pagination
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const queryOffset = (page - 1) * pageSize;
    
    // Get total count for pagination
    const countResult = await (trx || this.db)(this.tableName)
      .where(filters)
      .count('* as count')
      .first();
      
    const totalCount = countResult ? parseInt(countResult.count as string, 10) : 0;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // Get paginated results
    const results = await query
      .clone()
      .orderBy('due_date', 'asc')
      .orderBy('priority', 'desc')
      .offset(queryOffset)
      .limit(pageSize);
    
    return {
      data: results.map(item => this.toEntity(item)),
      pagination: {
        page,
        pageSize,
        totalItems: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
  
  /**
   * Find tasks by assignee using graph DB
   */
  private async findByAssignee(
    userId: string,
    options: TaskPaginationOptions = {},
    trx?: Knex.Transaction
  ): Promise<PaginatedResult<Task>> {
    const { status } = options;
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const queryOffset = (page - 1) * pageSize;
    
    try {
      // First, get the count of all tasks for this assignee
      let countCypher = `
        MATCH (u:Entity {id: $userId})-[:ASSIGNED_TO]->(t:Task)
        RETURN count(t) as count
      `;
      
      const countParams: Record<string, unknown> = { userId };
      const countResult = await this.neo4jSession.readTransaction((tx: Transaction) =>
        tx.run(countCypher, countParams)
      );
      
      const totalCount = countResult.records[0]?.get('count').toNumber() || 0;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Then get the paginated results
      let cypher = `
        MATCH (u:Entity {id: $userId})-[:ASSIGNED_TO]->(t:Task)
        WHERE 1=1
      `;
      
      const params: Record<string, unknown> = { 
        userId,
        offset: queryOffset,
        limit: pageSize 
      };
      
      if (status && status.length > 0) {
        cypher += ' AND t.status IN $status';
        params.status = status;
      }
      
      cypher += `
        RETURN t
        ORDER BY t.dueDate ASC, t.priority DESC
        SKIP $offset
        LIMIT $limit
      `;

      const result = await this.neo4jSession.readTransaction((tx: Transaction) =>
        tx.run(cypher, params)
      );

      // Get full task details from the database
      const taskIds = result.records.map(record => record.get('t').properties.id);
      if (taskIds.length === 0) {
        return {
          data: [],
          pagination: {
            page,
            pageSize,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        };
      }
      
      const tasks = await (trx || this.db)('tasks')
        .whereIn('id', taskIds)
        .orderBy('due_date', 'asc')
        .orderBy('priority', 'desc');
      
      return {
        data: tasks.map(task => this.toEntity(task)),
        pagination: {
          page,
          pageSize,
          totalItems: totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      console.error('Error finding tasks by assignee:', error);
      // Return empty result on error
      return {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }
  }

  /**
   * Find tasks related to an entity
   */
  async findByEntity(
    entityId: string,
    options: { 
      status?: TaskStatus[];
      limit?: number; 
      offset?: number;
    } = {}
  ): Promise<Task[]> {
    const { status, limit = 10, offset = 0 } = options;
    
    let cypher = `
      MATCH (e:Entity {id: $entityId})<-[:RELATED_TO]-(t:Task)
      WHERE 1=1
    `;
    
    const params: Record<string, unknown> = { entityId };
    
    if (status && status.length > 0) {
      cypher += ' AND t.status IN $status';
      params.status = status;
    }
    
    cypher += `
      RETURN t
      ORDER BY t.dueDate ASC, t.priority DESC
      SKIP $offset
      LIMIT $limit
    `;
    
    params.offset = offset;
    params.limit = limit;

    try {
      const result = await this.neo4jSession.readTransaction((tx: Transaction) =>
        tx.run(cypher, params)
      );

      // Get full task details from the database
      const taskIds = result.records.map(record => record.get('t').properties.id);
      if (taskIds.length === 0) return [];
      
      const tasks = await this.db('tasks')
        .whereIn('id', taskIds)
        .orderBy('due_date', 'asc')
        .orderBy('priority', 'desc');
      
      return tasks.map(task => this.validate(task));
    } catch (error) {
      console.error('Error finding tasks by entity:', error);
      return [];
    }
  }
}