import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('entity_relationships', (table) => {
        table.uuid('id').primary();
        table.uuid('source_id').references('id').inTable('entities').onDelete('CASCADE').notNullable();
        table.uuid('target_id').references('id').inTable('entities').onDelete('CASCADE').notNullable();
        table.string('type').notNullable();
        table.jsonb('metadata').defaultTo({});
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        table.index(['source_id', 'target_id', 'type']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('entity_relationships');
}
