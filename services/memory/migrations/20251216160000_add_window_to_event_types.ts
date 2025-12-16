import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Drop the existing check constraint
    await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check');

    // Add the new check constraint with updated types including 'window'
    await knex.raw(`
    ALTER TABLE events 
    ADD CONSTRAINT events_type_check 
    CHECK (type IN (
      'meeting', 
      'conversation', 
      'email', 
      'document_edit', 
      'browser_activity', 
      'system_event', 
      'reminder', 
      'task', 
      'user_message', 
      'assistant_message', 
      'action_execution', 
      'window',
      'other'
    ))
  `);
}

export async function down(knex: Knex): Promise<void> {
    // Revert to the previous check constraint (without 'window')
    await knex.raw('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check');

    await knex.raw(`
    ALTER TABLE events 
    ADD CONSTRAINT events_type_check 
    CHECK (type IN (
      'meeting', 
      'conversation', 
      'email', 
      'document_edit', 
      'browser_activity', 
      'system_event', 
      'reminder', 
      'task', 
      'user_message', 
      'assistant_message', 
      'action_execution', 
      'other'
    ))
  `);
}
