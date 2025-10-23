import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Add embedding column to events table
  await knex.schema.alterTable('events', (table) => {
    if (isPg) {
      table.jsonb('embedding').nullable();
    } else {
      // SQLite uses text for JSON
      table.text('embedding', 'text').nullable();
    }
  });
  
  console.info('Added embedding column to events table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('events', (table) => {
    table.dropColumn('embedding');
  });
  
  console.info('Removed embedding column from events table');
}
