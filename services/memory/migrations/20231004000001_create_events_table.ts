import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Create the events table
  await knex.schema.createTable('events', (table) => {
    // Primary key
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      // SQLite fallback
      table.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(4))) || "-" || lower(hex(randomblob(2))) || "-4" || substr(lower(hex(randomblob(2))),2) || "-" || substr("89ab", abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || "-" || lower(hex(randomblob(6))))'));
    }
    
    // Core fields
    if (isPg) {
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
    } else {
      // SQLite doesn't support enums, use string with check constraint
      table.string('type').notNullable();
    }
    
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
    
    // Metadata
    if (isPg) {
      table.jsonb('metadata').defaultTo('{}');
      // table.jsonb('embedding').nullable(); // Vector search disabled temporarily
    } else {
      // SQLite uses text for JSON
      table.text('metadata', 'text').defaultTo('{}');
      // table.text('embedding', 'text').nullable(); // Vector search disabled temporarily
    }
    
    // Indexes
    table.index(['type']);
    table.index(['start_time']);
    table.index(['source', 'source_id']);
  });
  
  // Add check constraint for SQLite
  if (!isPg) {
    await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS check_event_type
      BEFORE INSERT ON events
      BEGIN
        SELECT
          CASE
            WHEN NEW.type NOT IN ('meeting', 'conversation', 'email', 'document_edit', 'browser_activity', 'system_event', 'reminder', 'task', 'other')
            THEN RAISE(ABORT, 'Invalid event type')
          END;
      END;
    `);
  }
  
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
  
  // Vector index for similarity search (temporarily disabled)
  // if (knex.client.config.client === 'pg') {
  //   await knex.raw(`
  //     CREATE INDEX idx_events_embedding ON events 
  //     USING ivfflat (embedding vector_cosine_ops)
  //     WITH (lists = 100);
  //   `);
  // }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_participants');
  await knex.schema.dropTableIfExists('events');
}
