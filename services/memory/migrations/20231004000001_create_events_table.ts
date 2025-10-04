import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the events table
  await knex.schema.createTable('events', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Core fields
    table.enum('type', [
      'meeting',
      'conversation',
      'email',
      'document_edit',
      'browser_activity',
      'system_event',
      'reminder',
      'task',
      'other',
    ]).notNullable();
    
    table.string('title').notNullable();
    table.text('description').nullable();
    
    // Timestamps
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Source tracking
    table.string('source').nullable();
    table.string('source_id').nullable();
    
    // Metadata and embedding
    table.jsonb('metadata').defaultTo('{}');
    table.jsonb('embedding').nullable();
    
    // Indexes
    table.index(['type']);
    table.index(['start_time']);
    table.index(['source', 'source_id']);
  });
  
  // Create the event_participants join table
  await knex.schema.createTable('event_participants', (table) => {
    table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE');
    table.uuid('entity_id').references('id').inTable('entities').onDelete('CASCADE');
    table.string('role').nullable();
    table.jsonb('metadata').defaultTo('{}');
    
    // Composite primary key
    table.primary(['event_id', 'entity_id']);
    
    // Indexes
    table.index(['entity_id']);
  });
  
  // Add GIN index for JSONB metadata
  await knex.raw('CREATE INDEX idx_events_metadata ON events USING GIN (metadata jsonb_path_ops)');
  
  // Add vector index for similarity search (PostgreSQL specific)
  if (knex.client.config.client === 'pg') {
    await knex.raw(`
      CREATE INDEX idx_events_embedding ON events 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_participants');
  await knex.schema.dropTableIfExists('events');
}
