import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';
  
  // Add participants column to events table
  await knex.schema.alterTable('events', (table) => {
    if (isPg) {
      table.jsonb('participants').defaultTo('[]');
    } else {
      // SQLite uses text for JSON
      table.text('participants', 'text').defaultTo('[]');
    }
  });
  
  console.info('Added participants column to events table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('events', (table) => {
    table.dropColumn('participants');
  });
  
  console.info('Removed participants column from events table');
}
