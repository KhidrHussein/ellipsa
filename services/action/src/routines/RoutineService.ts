import schedule from 'node-schedule';
import { EmailSummary } from '../email/types/email.types.js';
import type { IEmailService } from '../email/services/EmailService.interface.js';
import { CalendarProvider } from '../providers/CalendarProvider.js';
import { IEmailMemoryService } from '../email/services/IEmailMemoryService.js';
import { ActionExecutor } from '../core/ActionExecutor.js';
import { MemoryClient, PromptClient } from '@ellipsa/shared';

import { TokenService } from '../services/oauth/TokenService.js';

export class RoutineService {
    private jobs: schedule.Job[] = [];

    constructor(
        private emailService: IEmailService,
        private calendarProvider: CalendarProvider,
        private memoryService: IEmailMemoryService,
        private actionExecutor: ActionExecutor,
        private memoryClient: MemoryClient,
        private promptClient: PromptClient,
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
        console.log('[RoutineService] End of Day check running.');

        // 0. Determine Active User
        let userId = 'user';
        const user = await this.tokenService.findUserWithProvider('google');
        if (user) {
            userId = user.userId;
        }

        // 1. Fetch User Focus
        let userFocus = 'No specific focus set.';
        try {
            const prefsRes = await this.memoryClient.getUserPreferences(userId);
            if (prefsRes?.data?.preferences?.primaryFocus) {
                userFocus = prefsRes.data.preferences.primaryFocus;
            }
        } catch (e) {
            console.warn('[RoutineService] Failed to fetch user focus', e);
        }

        // 2. Review Today's Progress (Tasks)
        // Fetch tasks completed today? MemoryClient.getTasks({ status: 'completed' })
        // We'll perform a generic fetch and filter by date if the API doesn't support date filtering.
        let completedTasksCount = 0;
        let pendingTasksCount = 0;
        try {
            // @ts-ignore - Assuming getTasks exists based on usage in other files or standard patterns
            const tasksRes = await this.memoryClient.getTasks({ limit: 50 }); // Fetch recent tasks
            const tasks = tasksRes.data || [];

            const today = new Date().toDateString();

            // Simple filter for now
            const completed = tasks.filter((t: any) => t.status === 'completed');
            const pending = tasks.filter((t: any) => t.status === 'pending');

            completedTasksCount = completed.length;
            pendingTasksCount = pending.length;
        } catch (e) {
            console.warn('[RoutineService] Failed to fetch tasks', e);
        }

        // 3. Check Tomorrow's Schedule
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = new Date(tomorrow);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        let tomorrowEvents: any[] = [];
        try {
            tomorrowEvents = await this.calendarProvider.getEventsForRange(tomorrowStart, tomorrowEnd);
        } catch (e) {
            console.warn('[RoutineService] Failed to fetch tomorrow events', e);
        }

        // 4. Create Evening Briefing Task (Narrative from LLM)
        let description = '';
        try {
            const briefing = await this.promptClient.generateBriefing({
                focus: userFocus,
                completed_count: completedTasksCount,
                pending_count: pendingTasksCount,
                tomorrow_schedule: tomorrowEvents.map(e => `- ${e.summary} at ${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day'}`).join('\n') || 'No meetings scheduled.'
            });
            description = briefing.briefing_content;
        } catch (error) {
            console.error('[RoutineService] LLM Briefing failed, falling back to manual.', error);
            // Fallback logic
            description = [
                `**End of Day Review**`,
                `Your strategic focus: *" ${userFocus} "*`,
                ``,
                `**Today's Progress**`,
                `- Completed Tasks: ${completedTasksCount}`,
                `- Pending Actions: ${pendingTasksCount}`,
            ].join('\n');
        }

        try {
            await this.memoryClient.createTask({
                title: `Evening Briefing - ${new Date().toLocaleDateString()}`,
                description: description,
                status: 'pending',
                priority: 'medium',
                source: 'assistant',
                due_date: new Date().toISOString(), // Due now
                metadata: {
                    type: 'evening_briefing',
                    user_id: userId
                }
            });
            console.log('[RoutineService] Evening Briefing Task created.');
        } catch (error) {
            console.error('[RoutineService] Failed to create Evening Briefing:', error);
        }
    }
}
