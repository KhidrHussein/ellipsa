import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn('entities', 'deleted_at');
    if (!hasColumn) {
        await knex.schema.alterTable('entities', (table) => {
            table.timestamp('deleted_at').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn('entities', 'deleted_at');
    if (hasColumn) {
        await knex.schema.alterTable('entities', (table) => {
            table.dropColumn('deleted_at');
        });
    }
}
