import { initializeDatabases, closeConnections } from '../db/init';
import { EventModel } from '../models/EventModel';
import { EntityModel } from '../models/EntityModel';
import { PromptServiceClient } from '../services/PromptServiceClient';
import { logger } from '../utils/logger';
import { getDriver, getSession } from '../db/graph/connection';
import config from '../config';

const PROMPT_SERVICE_URL = process.env.PROMPT_SERVICE_URL || 'http://localhost:4003';

async function consolidateMemory() {
    logger.info('Starting memory consolidation...');

    try {
        const { knex, chromaCollections } = await initializeDatabases();
        const neo4jSession = getSession();

        const eventModel = new EventModel(knex, neo4jSession, chromaCollections.events);
        const entityModel = new EntityModel(knex, neo4jSession, chromaCollections.entities);
        const promptService = new PromptServiceClient(PROMPT_SERVICE_URL);

        // 1. Fetch events from last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const events = await eventModel.findAll({
            startTime: oneDayAgo
        }, { pageSize: 100, page: 1 });

        if (events.data.length === 0) {
            logger.info('No events found to consolidate.');
            return;
        }

        logger.info(`Found ${events.data.length} events to consolidate.`);

        // 2. Prepare context for LLM
        const transcript = events.data.map(e =>
            `[${e.start_time}] ${e.title}: ${e.description || (e.metadata as any)?.summary || ''}`
        ).join('\n');

        // 3. Extract facts using Prompt Service
        const prompt = `
      Analyze the following timeline of user activity from the last 24 hours.
      Extract permanent facts about the user (Preferences, Relationships, Projects) that should be stored in the long-term Knowledge Graph.
      Ignore transient chitchat or routine tasks.

      Timeline:
      ${transcript}

      Return JSON:
      {
        "facts": [
          { "subject": "User", "predicate": "is working on", "object": "Project X" },
          { "subject": "Alice", "predicate": "is", "object": "Project Manager" }
        ],
        "summary": "Daily summary..."
      }
    `;

        const response = await promptService.generate(prompt, {
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response);
        logger.info('Consolidation result:', result);

        // 4. Update Knowledge Graph (Placeholder / Implementation)
        // For each fact, we would use entityModel to create/update nodes and edges.
        // This requires a method like entityModel.addFact(subject, predicate, object)
        // For now, we just log it.
        for (const fact of result.facts || []) {
            // Logic to find or create entities and link them
            logger.info(`[Graph Update] ${fact.subject} -[${fact.predicate}]-> ${fact.object}`);
            // TODO: Implement verify/upsert logic here
        }

        logger.info('Memory consolidation complete.');

    } catch (error) {
        logger.error('Consolidation failed:', error);
    } finally {
        await closeConnections();
    }
}

// Run if called directly
if (require.main === module) {
    consolidateMemory();
}

export { consolidateMemory };
