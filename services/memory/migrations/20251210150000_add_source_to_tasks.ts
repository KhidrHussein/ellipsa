import { Knex } from 'knex';

/**
 * Add 'source' column to tasks table to distinguish between user-created 
 * and system-generated tasks
 * 
 * Sources:
 * - 'user': Tasks explicitly created by the user
 * - 'system': AI-generated tasks from audio/screen processing
 * - 'chat': Tasks extracted from chat conversations
 * - 'email': Tasks extracted from email processing
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('tasks', (table) => {
        table.string('source').nullable().defaultTo('user');
    });

    // Add index for filtering by source
    await knex.schema.alterTable('tasks', (table) => {
        table.index(['source']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('tasks', (table) => {
        table.dropIndex(['source']);
        table.dropColumn('source');
    });
}
