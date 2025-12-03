import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Action, StepResult } from '../schemas/action.schema.js';
import {
    IActionProvider,
    ExecutionContext,
    ProviderResult,
    ValidationResult,
    ActionCapability,
} from '../core/ActionProvider.interface.js';

/**
 * CalendarProvider handles Google Calendar integrations
 * Uses existing Google OAuth from Gmail
 */
export class CalendarProvider implements IActionProvider {
    readonly name = 'calendar';
    private calendar: calendar_v3.Calendar | null = null;
    private oauth2Client: OAuth2Client | null = null;
    private initialized = false;

    /**
     * Initialize with OAuth client (shared with Gmail)
     */
    async initialize(oauth2Client?: OAuth2Client): Promise<void> {
        if (!oauth2Client) {
            console.log('[CalendarProvider] No OAuth client provided, will initialize when needed');
            return;
        }

        this.oauth2Client = oauth2Client;
        this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        this.initialized = true;
        console.log('[CalendarProvider] Initialized with OAuth');
    }

    async cleanup(): Promise<void> {
        this.calendar = null;
        console.log('[CalendarProvider] Cleaned up');
    }

    supports(action: Action): boolean {
        return [
            'create_calendar_event',
            'list_calendar_events',
            'update_calendar_event',
            'delete_calendar_event',
        ].includes(action.op);
    }

    async undo(actionId: string): Promise<void> {
        // This is a simplified undo implementation
        // In a real system, we would need to look up the action in history to know what to undo
        // For this POC, we'll assume the actionId IS the eventId for creation actions
        // or we would need a way to store the inverse action.

        // Since we don't have easy access to the action history here without circular deps or extra lookup,
        // we will implement a basic "delete event" undo if the actionId looks like a calendar event ID.

        if (!this.calendar) throw new Error('Calendar not initialized');

        try {
            console.log(`[CalendarProvider] Attempting to undo action/event: ${actionId}`);
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: actionId,
            });
            console.log(`[CalendarProvider] Undid action (deleted event): ${actionId}`);
        } catch (error) {
            console.error(`[CalendarProvider] Failed to undo action ${actionId}:`, error);
            throw error;
        }
    }

    validate(action: Action): ValidationResult {
        if (!this.initialized || !this.calendar) {
            return {
                allowed: false,
                reason: 'Calendar provider not initialized (requires Google OAuth)',
            };
        }

        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `Calendar provider does not support action: ${action.op}`,
            };
        }

        return { allowed: true };
    }

    async execute(actions: Action[], context: ExecutionContext): Promise<ProviderResult> {
        if (!this.calendar) {
            throw new Error('Calendar not initialized');
        }

        const results: StepResult[] = [];

        for (const action of actions) {
            const actionStart = Date.now();

            try {
                const result = await this.executeAction(action, context);
                result.duration_ms = Date.now() - actionStart;
                results.push(result);

                console.log(`[CalendarProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                if (result.status === 'failed' && !context.continueOnError) {
                    break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[CalendarProvider] Error executing ${action.op}:`, errorMessage);

                results.push({
                    op: action.op,
                    status: 'failed',
                    error: errorMessage,
                    duration_ms: Date.now() - actionStart,
                });

                if (!context.continueOnError) {
                    break;
                }
            }
        }

        return { results };
    }

    private async executeAction(
        action: Action,
        context: ExecutionContext
    ): Promise<StepResult> {
        if (!this.calendar) {
            throw new Error('Calendar not initialized');
        }

        switch (action.op) {
            case 'create_calendar_event':
                return await this.createEvent(action);

            case 'list_calendar_events':
                return await this.listEvents(action);

            case 'update_calendar_event':
                return await this.updateEvent(action);

            case 'delete_calendar_event':
                return await this.deleteEvent(action);

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    /**
     * Create a calendar event
     */
    private async createEvent(action: Action): Promise<StepResult> {
        if (!this.calendar) throw new Error('Calendar not initialized');

        if (!('summary' in action.args) || !('start' in action.args) || !('end' in action.args)) {
            throw new Error('Missing required arguments: summary, start, end');
        }

        const summary = action.args.summary as string;
        const start = action.args.start as string;
        const end = action.args.end as string;
        const attendees = 'attendees' in action.args ? (action.args.attendees as string[]) : undefined;
        const description = 'description' in action.args ? (action.args.description as string) : undefined;
        const location = 'location' in action.args ? (action.args.location as string) : undefined;

        try {
            const event = await this.calendar.events.insert({
                calendarId: 'primary',
                requestBody: {
                    summary,
                    description,
                    location,
                    start: { dateTime: start },
                    end: { dateTime: end },
                    attendees: attendees?.map(email => ({ email })),
                },
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    eventId: event.data.id,
                    htmlLink: event.data.htmlLink,
                    summary: event.data.summary,
                },
            };
        } catch (error) {
            throw new Error(`Failed to create calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List calendar events
     */
    private async listEvents(action: Action): Promise<StepResult> {
        if (!this.calendar) throw new Error('Calendar not initialized');

        const timeMin = 'timeMin' in action.args ? (action.args.timeMin as string) : new Date().toISOString();
        const timeMax = 'timeMax' in action.args ? (action.args.timeMax as string) : undefined;
        const maxResults = 'maxResults' in action.args ? (action.args.maxResults as number) : 10;

        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin,
                timeMax,
                maxResults,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items || [];

            return {
                op: action.op,
                status: 'success',
                output: {
                    count: events.length,
                    events: events.map(e => ({
                        id: e.id,
                        summary: e.summary,
                        start: e.start?.dateTime || e.start?.date,
                        end: e.end?.dateTime || e.end?.date,
                        htmlLink: e.htmlLink,
                    })),
                },
            };
        } catch (error) {
            throw new Error(`Failed to list events: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update a calendar event
     */
    private async updateEvent(action: Action): Promise<StepResult> {
        if (!this.calendar) throw new Error('Calendar not initialized');

        if (!('eventId' in action.args)) {
            throw new Error('Missing required argument: eventId');
        }

        const eventId = action.args.eventId as string;
        const updates: any = {};

        if ('summary' in action.args) updates.summary = action.args.summary;
        if ('start' in action.args) updates.start = { dateTime: action.args.start };
        if ('end' in action.args) updates.end = { dateTime: action.args.end };
        if ('description' in action.args) updates.description = action.args.description;

        try {
            const event = await this.calendar.events.patch({
                calendarId: 'primary',
                eventId,
                requestBody: updates,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    eventId: event.data.id,
                    summary: event.data.summary,
                },
            };
        } catch (error) {
            throw new Error(`Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete a calendar event
     */
    private async deleteEvent(action: Action): Promise<StepResult> {
        if (!this.calendar) throw new Error('Calendar not initialized');

        if (!('eventId' in action.args)) {
            throw new Error('Missing required argument: eventId');
        }

        const eventId = action.args.eventId as string;

        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId,
            });

            return {
                op: action.op,
                status: 'success',
                output: { eventId },
            };
        } catch (error) {
            throw new Error(`Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'create_calendar_event',
                provider: this.name,
                description: 'Create a Google Calendar event',
                argsSchema: {
                    summary: 'string (event title)',
                    start: 'string (ISO 8601 datetime)',
                    end: 'string (ISO 8601 datetime)',
                    attendees: 'string[] (optional, email addresses)',
                    description: 'string (optional)',
                    location: 'string (optional)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'list_calendar_events',
                provider: this.name,
                description: 'List upcoming calendar events',
                argsSchema: {
                    timeMin: 'string (optional, ISO 8601)',
                    timeMax: 'string (optional, ISO 8601)',
                    maxResults: 'number (optional, default 10)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'update_calendar_event',
                provider: this.name,
                description: 'Update a calendar event',
                argsSchema: {
                    eventId: 'string',
                    summary: 'string (optional)',
                    start: 'string (optional, ISO 8601)',
                    end: 'string (optional, ISO 8601)',
                    description: 'string (optional)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'delete_calendar_event',
                provider: this.name,
                description: 'Delete a calendar event',
                argsSchema: {
                    eventId: 'string',
                },
                requiresApproval: true,
                destructive: true,
                category: 'api',
            },
        ];
    }
}
