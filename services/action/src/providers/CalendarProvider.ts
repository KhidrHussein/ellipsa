// @ts-nocheck
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
import { MemoryClient } from '@ellipsa/shared';
// OLD: import { oauthService } from '../email/services/OAuthService';
import { TokenService } from '../services/oauth/TokenService';

/**
 * CalendarProvider handles Google Calendar integrations
 * Uses existing Google OAuth from Gmail/TokenService
 */
export class CalendarProvider implements IActionProvider {
    readonly name = 'calendar';
    private calendar: calendar_v3.Calendar | null = null;
    private oauth2Client: OAuth2Client | null = null;
    private initialized = false;
    private memoryClient: MemoryClient | null = null;

    private activeUserId: string;

    constructor(
        private tokenService?: TokenService,
        private userId: string = 'user'
    ) {
        this.activeUserId = userId;
    }

    /**
     * Set the Memory Client for persisting calendar events
     */
    setMemoryClient(client: MemoryClient): void {
        this.memoryClient = client;
        console.log('[CalendarProvider] MemoryClient configured');
    }

    /**
     * Initialize with optional OAuth client or rely on TokenService
     */
    async initialize(oauth2Client?: OAuth2Client): Promise<void> {
        if (oauth2Client) {
            this.oauth2Client = oauth2Client;
            console.log('[CalendarProvider] Initialized with provided OAuth client');
        } else if (this.tokenService) {
            // Try to initialize from TokenService
            let tokenData = await this.tokenService.getToken(this.userId, 'google');

            // Fallback: If no token for current user (and it is default 'user'), look for ANY valid google token
            if (!tokenData && this.userId === 'user') {
                const found = await this.tokenService.findUserWithProvider('google');
                if (found) {
                    console.log(`[CalendarProvider] No token for '${this.userId}'. Found token for '${found.userId}', using it.`);
                    tokenData = found.token;
                    this.activeUserId = found.userId;
                }
            }

            if (tokenData && tokenData.accessToken) {
                const clientId = process.env.GOOGLE_CLIENT_ID;
                const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
                const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4004/oauth2callback';

                if (clientId && clientSecret) {
                    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
                    this.oauth2Client.setCredentials({
                        access_token: tokenData.accessToken,
                        refresh_token: tokenData.refreshToken,
                        expiry_date: tokenData.expiresAt,
                        token_type: tokenData.tokenType,
                        scope: tokenData.scope,
                    });
                    console.log(`[CalendarProvider] Initialized with TokenService for user ${this.activeUserId}`);
                }
            }
        }

        if (this.oauth2Client) {
            this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            this.initialized = true;
        } else {
            console.log('[CalendarProvider] No OAuth client available yet, will initialize when needed/connected');
        }

        // Auto-initialize MemoryClient if not set
        if (!this.memoryClient) {
            this.memoryClient = new MemoryClient(process.env.MEMORY_SERVICE_URL || 'http://localhost:4001');
        }
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
        // Optimization: Check if we have token service or are initialized
        // We can't always check async status here, so we lean towards allowing if configured
        const hasAuth = this.initialized || !!this.tokenService;

        if (!hasAuth) {
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
        // Try to initialize if not already
        if (!this.initialized && this.tokenService) {
            await this.initialize();
        }

        if (!this.calendar || !this.initialized) {
            throw new Error('Authentication required. Please log in to Google to use Calendar features.');
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
            // One last try
            if (this.tokenService) await this.initialize();
            if (!this.calendar) throw new Error('Calendar not initialized');
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
            // Ensure datetime has timezone. If not, assume local timezone
            const ensureTimezone = (dt: string): string => {
                // If already has timezone (ends with Z or +/-HH:MM), return as-is
                if (/Z$/.test(dt) || /[+-]\d{2}:\d{2}$/.test(dt)) {
                    return dt;
                }
                // Otherwise, append local timezone offset
                const offset = new Date().getTimezoneOffset();
                const sign = offset <= 0 ? '+' : '-';
                const hours = String(Math.abs(Math.floor(offset / 60))).padStart(2, '0');
                const mins = String(Math.abs(offset % 60)).padStart(2, '0');
                return `${dt}${sign}${hours}:${mins}`;
            };

            const startWithTz = ensureTimezone(start);
            const endWithTz = ensureTimezone(end);

            const event = await this.calendar.events.insert({
                calendarId: 'primary',
                requestBody: {
                    summary,
                    description,
                    location,
                    start: { dateTime: startWithTz },
                    end: { dateTime: endWithTz },
                    attendees: attendees?.map(email => ({ email })),
                },
            });

            // Store the meeting in Memory Service so it appears in Briefing/Timeline
            if (this.memoryClient && event.data.id) {
                try {
                    // Build participants list from attendees
                    const participants = (attendees || []).map((email, index) => ({
                        entity_id: `attendee_${index}`,
                        name: email.split('@')[0],  // Use email prefix as name
                        role: 'attendee',
                        metadata: { email }
                    }));

                    // Build the event data object
                    const eventData = {
                        user_id: this.activeUserId,     // Ensure we attribute to the correct user
                        type: 'meeting' as const,      // Required - must be 'meeting' for Briefing
                        title: summary || 'Untitled Meeting',  // Required - fallback to prevent null
                        description: description || `Calendar event: ${summary || 'Meeting'}`,
                        content: description || `Calendar event: ${summary || 'Meeting'}`, // Required field
                        tasks: [], // Required field
                        start_time: startWithTz,       // Required
                        end_time: endWithTz,
                        source: 'google_calendar',
                        participants,
                        metadata: {
                            user_id: this.activeUserId, // Redundant but safe
                            google_event_id: event.data.id,
                            htmlLink: event.data.htmlLink,
                            location: location || null,
                            created_by: 'ellipsa',
                            summary: summary || 'Meeting',
                        }
                    };

                    // Validate required fields before sending
                    const requiredFields = ['type', 'title', 'start_time'] as const;
                    const missingFields = requiredFields.filter(field => !eventData[field]);

                    if (missingFields.length > 0) {
                        console.error('[CalendarProvider] Missing required fields:', missingFields);
                        console.error('[CalendarProvider] Event data:', JSON.stringify(eventData, null, 2));
                        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
                    }

                    // Log the data being sent for debugging
                    console.log('[CalendarProvider] Storing event with data:', {
                        type: eventData.type,
                        title: eventData.title,
                        start_time: eventData.start_time,
                        end_time: eventData.end_time,
                        participantCount: participants.length
                    });

                    await this.memoryClient.storeEvent(eventData);
                    console.log(`[CalendarProvider] Successfully stored meeting in Memory: ${eventData.title}`);
                } catch (memoryError) {
                    // Don't fail the calendar creation if memory storage fails
                    console.error('[CalendarProvider] Failed to store meeting in Memory:', memoryError);
                }
            }

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
                    summary: 'string (Event title)',
                    start: 'string (Start time ISO 8601 or YYYY-MM-DDTHH:mm:ss)',
                    end: 'string (End time ISO 8601 or YYYY-MM-DDTHH:mm:ss)',
                    attendees: 'string[] (Optional: List of email addresses)',
                    description: 'string (Optional: Event description)',
                    location: 'string (Optional: Location)',
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
                    timeMin: 'string (Optional: Start range ISO 8601, defaults to now)',
                    timeMax: 'string (Optional: End range ISO 8601)',
                    maxResults: 'number (Optional: Max events to return, default 10)',
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
                    eventId: 'string (ID of event to update)',
                    summary: 'string (Optional: New title)',
                    start: 'string (Optional: New start time ISO 8601)',
                    end: 'string (Optional: New end time ISO 8601)',
                    description: 'string (Optional: New description)',
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
                    eventId: 'string (ID of event to delete)',
                },
                requiresApproval: true,
                destructive: true,
                category: 'api',
            },
        ];
    }
    async getEventsForRange(start: Date, end: Date): Promise<any[]> {
        if (!this.calendar) {
            console.warn('[CalendarProvider] Calendar not initialized, returning empty list');
            return [];
        }

        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            return response.data.items || [];
        } catch (error) {
            console.error('[CalendarProvider] Error fetching events for range:', error);
            return [];
        }
    }
}
