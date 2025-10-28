import { config } from 'dotenv';
import { GmailEmailService } from '../email/services/GmailEmailService';
import { EmailLLMService } from '../email/services/EmailLLMService';
import { InMemoryService } from '../services/InMemoryService';
import { EmailMemoryService } from '../email/services/EmailMemoryService';
import { PromptService } from '@ellipsa/prompt';
import { EntityModel, EventModel, Neo4jService, ChromaClient } from '@ellipsis/memory';
import Knex from 'knex';

// Load environment variables
config();

async function migrateData() {
  console.log('Starting data migration...');

  // Initialize old services
  const oldLLMService = new EmailLLMService(process.env.OPENAI_API_KEY || '');
  const oldMemoryService = new InMemoryService();
  const oldEmailService = new GmailEmailService(
    process.env.GOOGLE_CLIENT_ID || '',
    process.env.GOOGLE_CLIENT_SECRET || '',
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4004/oauth2callback',
    process.env.GOOGLE_ACCESS_TOKEN || '',
    process.env.GOOGLE_REFRESH_TOKEN || '',
    oldLLMService,
    oldMemoryService
  );

  // Initialize new services
  const knex = Knex({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ellipsa',
  });

  const neo4j = new Neo4jService({
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  });

  const chroma = new ChromaClient({
    url: process.env.CHROMA_URL || 'http://localhost:8000',
  });

  const entityModel = new EntityModel(knex, neo4j, chroma);
  const eventModel = new EventModel(knex);
  const promptService = new PromptService({
    apiKey: process.env.OPENAI_API_KEY || '',
    defaultModel: 'gpt-4',
  });

  const newMemoryService = new EmailMemoryService(entityModel, eventModel);
  const processingService = new EmailProcessingService(promptService, newMemoryService);
  
  const newEmailService = new GmailEmailService(
    process.env.GOOGLE_CLIENT_ID || '',
    process.env.GOOGLE_CLIENT_SECRET || '',
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4004/oauth2callback',
    process.env.GOOGLE_ACCESS_TOKEN || '',
    process.env.GOOGLE_REFRESH_TOKEN || '',
    processingService,
    newMemoryService
  );

  try {
    console.log('Fetching emails from old service...');
    const emails = await oldMemoryService.getAllEmails();
    
    console.log(`Found ${emails.length} emails to migrate`);
    
    for (const email of emails) {
      try {
        console.log(`Processing email: ${email.id}`);
        
        // Process the email with the new service
        await processingService.processEmail(email);
        
        console.log(`Successfully migrated email: ${email.id}`);
      } catch (error) {
        console.error(`Error migrating email ${email.id}:`, error);
      }
    }
    
    console.log('Data migration completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    // Clean up
    await knex.destroy();
    await neo4j.close();
  }
}

// Run the migration
if (require.main === module) {
  migrateData().catch(console.error);
}

export { migrateData };
