import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Create the entities table
  await knex.schema.createTable('entities', (table) => {
    // Primary key
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      // SQLite fallback
      table.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(4))) || "-" || lower(hex(randomblob(2))) || "-4" || substr(lower(hex(randomblob(2))),2) || "-" || substr("89ab", abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || "-" || lower(hex(randomblob(6))))'));
    }
    
    // Core fields
    table.string('name').notNullable();
    
    // Type field - we'll enforce the constraint at the application level
    table.string('type').notNullable();
    
    // Optional fields
    table.text('description').nullable();
    
    // JSON fields
    if (isPg) {
      table.jsonb('metadata').defaultTo('{}');
      // table.jsonb('embedding').nullable(); // Vector search disabled temporarily
    } else {
      // SQLite uses text for JSON
      table.text('metadata', 'text').defaultTo('{}');
      // table.text('embedding', 'text').nullable(); // Vector search disabled temporarily
    }
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_seen_at').nullable();
    
    // Indexes
    table.index('name');
    table.index('type');
    table.index('last_seen_at');
  });
  
  // Add trigger for updated_at
  if (isPg) {
    await knex.schema.raw(`
      CREATE TRIGGER update_entities_updated_at
      BEFORE UPDATE ON entities
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    // Create the function for PostgreSQL
    await knex.schema.raw(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  } else {
    // SQLite trigger
    await knex.schema.raw(`
      CREATE TRIGGER IF NOT EXISTS update_entities_updated_at
      AFTER UPDATE ON entities
      FOR EACH ROW
      BEGIN
        UPDATE entities SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  }

  // If you need to add any additional setup after creating the tables, add it here
}

export async function down(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Drop triggers
  if (isPg) {
    await knex.schema.raw('DROP TRIGGER IF EXISTS update_entities_updated_at ON entities');
    await knex.schema.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  } else {
    await knex.schema.raw('DROP TRIGGER IF EXISTS update_entities_updated_at');
  }
  
  // Drop table
  await knex.schema.dropTableIfExists('entities');
}