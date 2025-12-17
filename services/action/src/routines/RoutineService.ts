import schedule from 'node-schedule';
import { IEmailService, EmailSummary } from '../email/types/email.types.js';
import { CalendarProvider } from '../providers/CalendarProvider.js';
import { IEmailMemoryService } from '../email/services/IEmailMemoryService.js';
import { ActionExecutor } from '../core/ActionExecutor.js';
import { MemoryClient } from '@ellipsa/shared';

import { TokenService } from '../services/oauth/TokenService.js';

export class RoutineService {
    private jobs: schedule.Job[] = [];

    constructor(
        private emailService: IEmailService,
        private calendarProvider: CalendarProvider,
        private memoryService: IEmailMemoryService,
        private actionExecutor: ActionExecutor,
        private memoryClient: MemoryClient,
        private tokenService: TokenService
    ) { }

    public start() {
        console.log('[RoutineService] Starting routines...');

        // Start of Day Routine (e.g., 9:00 AM)
        this.scheduleRoutine('Start of Day', '0 9 * * *', async () => {
            await this.runStartOfDay();
        });

        // End of Day Routine (e.g., 5:00 PM)
        this.scheduleRoutine('End of Day', '0 17 * * *', async () => {
            await this.runEndOfDay();
        });

        console.log('[RoutineService] Routines scheduled.');

        // Initial sweep to populate pending actions immediately
        setTimeout(async () => {
            console.log('[RoutineService] Running initial email sweep...');
            try {
                // Ensure we have a user context before sweeping if possible, 
                // but performSweep internally uses the service which has the token logic now.
                // We'll trust the service's fallback logic.
                await this.emailService.performSweep({ unreadOnly: true, limit: 10 });
                console.log('[RoutineService] Initial sweep completed.');
            } catch (error) {
                console.error('[RoutineService] Initial sweep failed:', error);
            }
        }, 5000); // Wait 5s for services to stabilize
    }

    public stop() {
        this.jobs.forEach(job => job.cancel());
        this.jobs = [];
        console.log('[RoutineService] Routines stopped.');
    }

    private scheduleRoutine(name: string, cron: string, callback: () => Promise<void>) {
        const job = schedule.scheduleJob(cron, async () => {
            console.log(`[RoutineService] Starting ${name} routine...`);
            try {
                await callback();
                console.log(`[RoutineService] Completed ${name} routine.`);
            } catch (error) {
                console.error(`[RoutineService] Error in ${name} routine:`, error);
            }
        });
        this.jobs.push(job);
    }

    private async runStartOfDay() {
        // 0. Determine Active User (Local single-user mode)
        let userId = 'user';
        const user = await this.tokenService.findUserWithProvider('google');
        if (user) {
            userId = user.userId;
            console.log(`[RoutineService] Generatng briefing for user: ${userId}`);
        }

        // 1. Get Urgent Emails
        // We'll perform a sweep for unread emails and check for 'high' priority
        const sweepResult = await this.emailService.performSweep({
            unreadOnly: true,
            limit: 20
        });

        const urgentEmails = sweepResult.summaries.filter(s => s.priority === 'high');

        // 2. Get Today's Events
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        let todaysEvents: any[] = [];
        try {
            todaysEvents = await this.calendarProvider.getEventsForRange(now, endOfDay);
            console.log(`[RoutineService] Found ${todaysEvents.length} events for today.`);
        } catch (e) {
            console.warn('Failed to fetch calendar events', e);
        }

        // 3. Create a Briefing Note in Memory
        const briefing = {
            type: 'daily_briefing',
            date: now.toISOString(),
            urgentEmails: urgentEmails.map(e => ({ subject: e.subject, from: e.from.address })),
            eventsCount: todaysEvents.length,
            status: 'generated',
            user_id: userId // Add to metadata
        };

        // Store in memory (using a generic store method if available, or just logging for now)
        // Store as a Task in Memory Service so it appears in Briefing UI
        try {
            await this.memoryClient.createTask({
                title: `Daily Briefing - ${now.toLocaleDateString()}`,
                description: `
**Urgent Emails (${urgentEmails.length})**:
${urgentEmails.map(e => `- ${e.subject} (from ${e.from.address})`).join('\n')}

**Today's Events (${todaysEvents.length})**:
${todaysEvents.slice(0, 5).map(e => `- ${e.summary} at ${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day'}`).join('\n')}
                `.trim(),
                status: 'pending',
                priority: 'high',
                source: 'assistant',
                due_date: endOfDay.toISOString(),
                metadata: {
                    ...briefing,
                    assignee_id: userId // Store inside metadata if not supported at top level
                }
            });
            console.log('[RoutineService] Daily Briefing Task created.');
        } catch (error) {
            console.error('[RoutineService] Failed to create Briefing Task:', error);
        }

        console.log('[RoutineService] Daily Briefing Generated:', JSON.stringify(briefing, null, 2));

        // Suggest actions for urgent emails (if not already handled)
        if (urgentEmails.length > 0) {
            console.log(`[RoutineService] You have ${urgentEmails.length} urgent emails to review.`);
        }
    }

    private async runEndOfDay() {
        // 1. Check for tomorrow's first meeting
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = new Date(tomorrow);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(12, 0, 0, 0); // Check morning only

        console.log('[RoutineService] End of Day check running.');
        // Logic to check first meeting would go here
    }
}
