import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn('entities', 'embedding');
    if (!hasColumn) {
        await knex.schema.alterTable('entities', (table) => {
            // Use text for SQLite (local dev) and vector/jsonb for Postgres if needed, 
            // but sticking to the pattern in other migrations.
            // In 20251021144825_add_embedding_to_events.ts it uses specific logic.
            // Let's check the dialect.
            const client = knex.client.config.client;
            if (client === 'sqlite3' || client === 'better-sqlite3') {
                table.text('embedding').nullable();
            } else {
                // For Postgres, usually vector or jsonb. 
                // Based on previous errors "invalid input syntax for type json", it seems it expects JSON.
                table.jsonb('embedding').nullable();
            }
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn('entities', 'embedding');
    if (hasColumn) {
        await knex.schema.alterTable('entities', (table) => {
            table.dropColumn('embedding');
        });
    }
}
