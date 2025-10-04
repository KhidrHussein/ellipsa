import { Knex } from 'knex';
import { z } from 'zod';
import { BaseModel } from './BaseModel';
import { Session } from 'neo4j-driver';

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

export const TaskSchema = z.object({
  id: z.string().uuid(),
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
  metadata: z.record(z.any()).default({}),
  created_at: z.date().or(z.string()).optional(),
  updated_at: z.date().or(z.string()).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export class TaskModel extends BaseModel<Task> {
  private neo4jSession: Session;

  constructor(db: Knex, neo4jSession: Session) {
    super('tasks', TaskSchema, db);
    this.neo4jSession = neo4jSession;
  }

  /**
   * Create a new task with graph relationships
   */
  override async create(data: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    // Create in relational DB
    const task = await super.create(data);

    try {
      // Create in graph DB
      await this.neo4jSession.writeTransaction(tx =>
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

      // Create relationship with assignee if exists
      if (task.assignee_id) {
        await this.neo4jSession.writeTransaction(tx =>
          tx.run(
            `MATCH (t:Task {id: $taskId}), (u:Entity {id: $userId})
             MERGE (u)-[:ASSIGNED_TO {assignedAt: datetime()}]->(t)`,
            {
              taskId: task.id,
              userId: task.assignee_id,
            }
          )
        );
      }

      // Create relationship with creator if exists
      if (task.created_by) {
        await this.neo4jSession.writeTransaction(tx =>
          tx.run(
            `MATCH (t:Task {id: $taskId}), (u:Entity {id: $userId})
             MERGE (u)-[:CREATED {createdAt: datetime()}]->(t)`,
            {
              taskId: task.id,
              userId: task.created_by,
            }
          )
        );
      }

      // Create relationship with related entity if exists
      if (task.related_entity_id) {
        await this.neo4jSession.writeTransaction(tx =>
          tx.run(
            `MATCH (t:Task {id: $taskId}), (e:Entity {id: $entityId})
             MERGE (t)-[:RELATED_TO {relationType: 'entity'}]->(e)`,
            {
              taskId: task.id,
              entityId: task.related_entity_id,
            }
          )
        );
      }

      // Create relationship with related event if exists
      if (task.related_event_id) {
        await this.neo4jSession.writeTransaction(tx =>
          tx.run(
            `MATCH (t:Task {id: $taskId}), (e:Event {id: $eventId})
             MERGE (t)-[:RELATED_TO {relationType: 'event'}]->(e)`,
            {
              taskId: task.id,
              eventId: task.related_event_id,
            }
          )
        );
      }
    } catch (error) {
      // Clean up if anything fails
      await super.delete(task.id);
      throw error;
    }

    return task;
  }

  /**
   * Update a task and its graph relationships
   */
  override async update(
    id: string,
    data: Partial<Omit<Task, 'id' | 'created_at'>>
  ): Promise<Task | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // Update in relational DB
    const updated = await super.update(id, data);
    if (!updated) return null;

    try {
      // Update in graph DB
      await this.neo4jSession.writeTransaction(tx =>
        tx.run(
          `MATCH (t:Task {id: $id})
           SET t.title = $title,
               t.status = $status,
               t.priority = $priority,
               t.dueDate = $dueDate ? datetime($dueDate) : null,
               t.updatedAt = datetime()`,
          {
            id,
            title: updated.title,
            status: updated.status,
            priority: updated.priority,
            dueDate: updated.due_date,
          }
        )
      );

      // Update assignee relationship if changed
      if (data.assignee_id !== undefined && data.assignee_id !== existing.assignee_id) {
        // Remove existing assignee relationship
        await this.neo4jSession.writeTransaction(tx =>
          tx.run(
            'MATCH (u)-[r:ASSIGNED_TO]->(t:Task {id: $taskId}) DELETE r',
            { taskId: id }
          )
        );

        // Add new assignee relationship if assignee_id is not null
        if (data.assignee_id) {
          await this.neo4jSession.writeTransaction(tx =>
            tx.run(
              `MATCH (t:Task {id: $taskId}), (u:Entity {id: $userId})
               MERGE (u)-[:ASSIGNED_TO {assignedAt: datetime()}]->(t)`,
              {
                taskId: id,
                userId: data.assignee_id,
              }
            )
          );
        }
      }
    } catch (error) {
      console.error('Error updating task in graph store:', error);
      // We don't want to fail the entire operation if graph update fails
    }

    return updated;
  }

  /**
   * Delete a task and its graph relationships
   */
  override async delete(id: string): Promise<boolean> {
    const deleted = await super.delete(id);
    if (!deleted) return false;

    try {
      // Delete from graph DB (all relationships will be automatically deleted due to DETACH DELETE)
      await this.neo4jSession.writeTransaction(tx =>
        tx.run('MATCH (t:Task {id: $id}) DETACH DELETE t', { id })
      );
    } catch (error) {
      console.error('Error deleting task from graph store:', error);
      // We don't want to fail the entire operation if graph delete fails
    }

    return true;
  }

  /**
   * Find tasks by assignee
   */
  async findByAssignee(
    userId: string,
    options: { 
      status?: TaskStatus[];
      limit?: number; 
      offset?: number;
    } = {}
  ): Promise<Task[]> {
    const { status, limit = 10, offset = 0 } = options;
    
    let cypher = `
      MATCH (u:Entity {id: $userId})-[:ASSIGNED_TO]->(t:Task)
      WHERE 1=1
    `;
    
    const params: any = { userId };
    
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
      const result = await this.neo4jSession.readTransaction(tx =>
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
      console.error('Error finding tasks by assignee:', error);
      return [];
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
    
    const params: any = { entityId };
    
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
      const result = await this.neo4jSession.readTransaction(tx =>
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
