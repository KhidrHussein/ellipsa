import { initializeDatabases, closeConnections } from '../db/init';
import { EventModel } from '../models/EventModel';
import { TaskModel } from '../models/TaskModel';
import { PromptServiceClient } from '../services/PromptServiceClient';
import { logger } from '../utils/logger';
import { getSession } from '../db/graph/connection';

const PROMPT_SERVICE_URL = process.env.PROMPT_SERVICE_URL || 'http://localhost:4003';

async function generateMorningBriefing() {
    logger.info('Generating Morning Briefing...');

    try {
        const { knex, chromaCollections } = await initializeDatabases();
        const neo4jSession = getSession();

        const eventModel = new EventModel(knex, neo4jSession, chromaCollections.events);
        const taskModel = new TaskModel(knex, neo4jSession);
        const promptService = new PromptServiceClient(PROMPT_SERVICE_URL);

        // 1. Fetch Today's Schedule
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const todaysEvents = await eventModel.findAll({
            startTime: startOfDay,
            endTime: endOfDay
        }, { pageSize: 50 });

        // 2. Fetch Tasks
        const pendingTasks = await taskModel.findAll({ status: 'pending' }, { pageSize: 20 });

        if (todaysEvents.data.length === 0 && pendingTasks.data.length === 0) {
            logger.info('No events or tasks for today. Skipping briefing.');
            return;
        }

        // 3. Prepare Context
        const scheduleText = todaysEvents.data.map((e: any) =>
            `- [${new Date(e.start_time).toLocaleTimeString()}] ${e.title}`
        ).join('\n');

        const tasksText = pendingTasks.data.map((t: any) =>
            `- ${t.title} (Priority: ${t.priority || 'normal'})`
        ).join('\n');

        const context = `
    SCHEDULE FOR TODAY:
    ${scheduleText || 'No meetings scheduled.'}

    PENDING TASKS:
    ${tasksText || 'No pending tasks.'}
    `;

        // 4. Generate Briefing
        const systemPrompt = `
    You are an Executive Assistant preparing a Morning Briefing.
    Summarize the day ahead. Be concise and strategic.
    Highlight conflicts or high-priority items.
    Tone: Professional, forward-looking.
    `;

        const briefingText = await promptService.generate(
            `${systemPrompt}\n\nInformation:\n${context}`
        );

        logger.info('Generated Briefing:', briefingText);

        // 5. Store as Event (for Timeline/History)
        await eventModel.create({
            type: 'assistant_message',
            title: 'Morning Briefing',
            start_time: new Date(),
            description: briefingText,
            participants: [],
            metadata: {
                is_briefing: true,
                summary: briefingText // For display in timeline
            }
        });

        console.log('Briefing stored successfully.');

    } catch (error) {
        logger.error('Failed to generate briefing:', error);
    } finally {
        await closeConnections();
    }
}

if (require.main === module) {
    generateMorningBriefing();
}

export { generateMorningBriefing };
