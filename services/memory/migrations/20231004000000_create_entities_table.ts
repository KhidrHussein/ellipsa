import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the entities table
  await knex.schema.createTable('entities', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Core fields
    table.string('name').notNullable();
    table.enum('type', [
      'person',
      'organization',
      'location',
      'event',
      'document',
      'concept',
      'other',
    ]).notNullable();
    
    // Optional fields
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_seen_at').nullable();
    
    // Embedding for vector search (stored as JSONB for flexibility)
    table.jsonb('embedding').nullable();
    
    // Indexes
    table.index(['type']);
    table.index(['name']);
    table.index(['last_seen_at']);
  });
  
  // Add a GIN index for JSONB metadata
  await knex.raw('CREATE INDEX idx_entities_metadata ON entities USING GIN (metadata jsonb_path_ops)');
  
  // Add a vector index for similarity search (PostgreSQL specific)
  if (knex.client.config.client === 'pg') {
    await knex.raw(`
      CREATE INDEX idx_entities_embedding ON entities 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('entities');
}
