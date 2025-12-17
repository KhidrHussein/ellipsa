import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("drafts", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.string("thread_id");
        table.jsonb("to").defaultTo("[]");
        table.jsonb("cc").defaultTo("[]");
        table.jsonb("bcc").defaultTo("[]");
        table.string("subject");
        table.string("status").defaultTo("draft");
        table.text("body");
        table.text("html");
        table.string("in_reply_to");
        table.jsonb("references").defaultTo("[]");
        table.uuid("email_id");
        table.jsonb("attachments").defaultTo("[]");
        table.jsonb("metadata").defaultTo("{}");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
        table.timestamp("deleted_at");

        table.index("thread_id");
        table.index("status");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable("drafts");
}
