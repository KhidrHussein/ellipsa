import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const isPg = knex.client.config.client === 'pg';

    // Add content column to events table
    await knex.schema.alterTable('events', (table) => {
        table.text('content').nullable();
    });

    console.info('Added content column to events table');
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('events', (table) => {
        table.dropColumn('content');
    });

    console.info('Removed content column from events table');
}
