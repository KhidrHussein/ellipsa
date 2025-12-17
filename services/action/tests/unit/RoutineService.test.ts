import { RoutineService } from '../../src/routines/RoutineService.js';
import { GmailEmailService } from '../../src/email/services/GmailEmailService.js';
import { CalendarProvider } from '../../src/providers/CalendarProvider.js';
import { IEmailMemoryService } from '../../src/email/services/IEmailMemoryService.js';
import { ActionExecutor } from '../../src/core/ActionExecutor.js';
import { EmailSummary } from '../../src/email/types/email.types.js';

import { TokenService } from '../../src/services/oauth/TokenService.js';

// Mock dependencies
const mockEmailService = {
    performSweep: jest.fn(),
    executeActions: jest.fn(),
    isConnected: jest.fn().mockResolvedValue(true)
} as unknown as jest.Mocked<GmailEmailService>;

const mockCalendarProvider = {
    getEventsForRange: jest.fn()
} as unknown as jest.Mocked<CalendarProvider>;

const mockMemoryService = {
    storeEvent: jest.fn()
} as unknown as jest.Mocked<IEmailMemoryService>;

const mockActionExecutor = {
} as unknown as jest.Mocked<ActionExecutor>;

const mockTokenService = {
    findUserWithProvider: jest.fn().mockResolvedValue({ userId: 'user', token: {} })
} as unknown as jest.Mocked<TokenService>;

describe('RoutineService', () => {
    let service: RoutineService;

    const mockMemoryClient = {
        createTask: jest.fn().mockResolvedValue({ task_id: 'task-123' })
    } as any;

    const mockPromptClient = {
        generateBriefing: jest.fn().mockResolvedValue({ briefing_content: 'Mock Briefing' })
    } as any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        service = new RoutineService(
            mockEmailService,
            mockCalendarProvider,
            mockMemoryService,
            mockActionExecutor,
            mockMemoryClient,
            mockPromptClient,
            mockTokenService
        );
    });

    afterEach(() => {
        service.stop();
        jest.useRealTimers();
    });

    describe('start', () => {
        it('should schedule jobs', () => {
            service.start();
            // Implementation detail: node-schedule uses setTimeout/setInterval
            // We can't easily check internal state without exposing it, 
            // but we can check if console.log was called or just rely on no errors.
            // Better: we can inspect the private 'jobs' array if we cast to any or expose it for testing.
            expect((service as any).jobs.length).toBeGreaterThan(0);
        });
    });

    describe('runStartOfDay', () => {
        it('should fetch urgent emails and calendar events', async () => {
            // Setup mocks
            const mockEmails: EmailSummary[] = [
                {
                    id: '1', threadId: 't1', subject: 'Urgent!', from: { address: 'boss@co.com' },
                    date: new Date(), summary: 'Urgent', actionRequired: true, priority: 'high', categories: []
                }
            ];
            mockEmailService.performSweep.mockResolvedValue({
                processed: 1,
                summaries: mockEmails,
                errors: []
            });

            mockCalendarProvider.getEventsForRange.mockResolvedValue([
                { summary: 'Meeting 1', start: { dateTime: new Date().toISOString() } }
            ]);

            // Run private method
            await (service as any).runStartOfDay();

            // Verify interactions
            expect(mockEmailService.performSweep).toHaveBeenCalledWith(expect.objectContaining({
                unreadOnly: true
            }));
            expect(mockCalendarProvider.getEventsForRange).toHaveBeenCalled();
        });
    });
});
