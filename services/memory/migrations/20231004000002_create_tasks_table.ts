import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Create the tasks table
  await knex.schema.createTable('tasks', (table) => {
    // Primary key
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      // SQLite fallback
      table.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(4))) || "-" || lower(hex(randomblob(2))) || "-4" || substr(lower(hex(randomblob(2))),2) || "-" || substr("89ab", abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || "-" || lower(hex(randomblob(6))))'));
    }
    
    // Core fields
    table.string('title').notNullable();
    table.text('description').nullable();
    
    // Status and priority
    if (isPg) {
      table.enum('status', [
        'pending',
        'in_progress',
        'completed',
        'blocked',
        'cancelled',
      ]).defaultTo('pending');
      
      table.enum('priority', [
        'low',
        'medium',
        'high',
        'urgent',
      ]).defaultTo('medium');
    } else {
      // SQLite doesn't support enums, use string with check constraint
      table.string('status').defaultTo('pending');
      table.string('priority').defaultTo('medium');
    }
    
    // Timestamps
    table.timestamp('due_date').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Relationships
    const uuidColumn = (columnName: string) => {
      if (isPg) {
        return table.uuid(columnName).references('id').inTable('entities').onDelete('SET NULL');
      } else {
        // SQLite doesn't support foreign key constraints with ON DELETE SET NULL
        return table.string(columnName, 36).nullable();
      }
    };
    
    uuidColumn('assignee_id');
    uuidColumn('created_by');
    uuidColumn('related_entity_id');
    
    // For related_event_id, we need to check if the events table exists first
    if (isPg) {
      table.uuid('related_event_id').references('id').inTable('events').onDelete('SET NULL');
    } else {
      table.string('related_event_id', 36).nullable();
    }
    
    // Metadata
    if (isPg) {
      table.jsonb('metadata').defaultTo('{}');
    } else {
      table.text('metadata', 'text').defaultTo('{}');
    }
    
    // Indexes
    table.index(['status']);
    table.index(['priority']);
    table.index(['due_date']);
    table.index(['assignee_id']);
    table.index(['related_entity_id']);
    table.index(['related_event_id']);
  });
  
  // Add GIN index for JSONB metadata (PostgreSQL only)
  if (isPg) {
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_tasks_metadata ON tasks USING GIN (metadata jsonb_path_ops)');
  }
  
  // Add check constraints for SQLite
  if (!isPg) {
    await knex.schema.raw(`
      CREATE TRIGGER IF NOT EXISTS check_task_status
      BEFORE INSERT ON tasks
      BEGIN
        SELECT
          CASE
            WHEN NEW.status NOT IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')
            THEN RAISE(ABORT, 'Invalid task status')
          END,
          CASE
            WHEN NEW.priority NOT IN ('low', 'medium', 'high', 'urgent')
            THEN RAISE(ABORT, 'Invalid task priority')
          END;
      END;
    `);
    
    // Create updated_at trigger for SQLite
    await knex.schema.raw(`
      CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at
      AFTER UPDATE ON tasks
      FOR EACH ROW
      BEGIN
        UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Drop triggers for SQLite
  if (!isPg) {
    await knex.schema.raw('DROP TRIGGER IF EXISTS check_task_status');
    await knex.schema.raw('DROP TRIGGER IF EXISTS update_tasks_updated_at');
  }
  
  // Drop the table
  await knex.schema.dropTableIfExists('tasks');
}
