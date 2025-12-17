
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Add user_id to events
    const hasEvents = await knex.schema.hasTable('events');
    if (hasEvents) {
        await knex.schema.alterTable('events', (table) => {
            table.string('user_id').nullable();
        });
        // Backfill default user
        await knex('events').update({ user_id: 'user' });
        // Now make it not nullable
        await knex.schema.alterTable('events', (table) => {
            table.string('user_id').notNullable().alter();
            table.index(['user_id']);
        });
    }

    // Add user_id to entities
    const hasEntities = await knex.schema.hasTable('entities');
    if (hasEntities) {
        await knex.schema.alterTable('entities', (table) => {
            table.string('user_id').nullable();
        });
        // Backfill default user
        await knex('entities').update({ user_id: 'user' });
        // Now make it not nullable
        await knex.schema.alterTable('entities', (table) => {
            table.string('user_id').notNullable().alter();
            table.index(['user_id']);
        });
    }

    // Add user_id to tasks (if exists)
    const hasTasks = await knex.schema.hasTable('tasks');
    if (hasTasks) {
        await knex.schema.alterTable('tasks', (table) => {
            table.string('user_id').nullable();
        });
        // Backfill default user
        await knex('tasks').update({ user_id: 'user' });
        // Now make it not nullable
        await knex.schema.alterTable('tasks', (table) => {
            table.string('user_id').notNullable().alter();
            table.index(['user_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasTasks = await knex.schema.hasTable('tasks');
    if (hasTasks) {
        await knex.schema.alterTable('tasks', (table) => {
            table.dropColumn('user_id');
        });
    }

    const hasEntities = await knex.schema.hasTable('entities');
    if (hasEntities) {
        await knex.schema.alterTable('entities', (table) => {
            table.dropColumn('user_id');
        });
    }

    const hasEvents = await knex.schema.hasTable('events');
    if (hasEvents) {
        await knex.schema.alterTable('events', (table) => {
            table.dropColumn('user_id');
        });
    }
}
