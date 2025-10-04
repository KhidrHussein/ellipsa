import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the tasks table
  await knex.schema.createTable('tasks', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Core fields
    table.string('title').notNullable();
    table.text('description').nullable();
    
    // Status and priority
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
    
    // Timestamps
    table.timestamp('due_date').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Relationships
    table.uuid('assignee_id').references('id').inTable('entities').onDelete('SET NULL');
    table.uuid('created_by').references('id').inTable('entities').onDelete('SET NULL');
    table.uuid('related_entity_id').references('id').inTable('entities').onDelete('SET NULL');
    table.uuid('related_event_id').references('id').inTable('events').onDelete('SET NULL');
    
    // Metadata
    table.jsonb('metadata').defaultTo('{}');
    
    // Indexes
    table.index(['status']);
    table.index(['priority']);
    table.index(['due_date']);
    table.index(['assignee_id']);
    table.index(['related_entity_id']);
    table.index(['related_event_id']);
  });
  
  // Add GIN index for JSONB metadata
  await knex.raw('CREATE INDEX idx_tasks_metadata ON tasks USING GIN (metadata jsonb_path_ops)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks');
}
