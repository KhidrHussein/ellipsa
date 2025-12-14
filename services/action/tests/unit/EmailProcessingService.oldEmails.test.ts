import { EmailProcessingService } from '../../src/email/services/EmailProcessingService.js';
import { IEmailMemoryService } from '../../src/email/services/IEmailMemoryService.js';
import { EmailLLMService } from '../../src/email/services/EmailLLMService.js';
import { EmailMessage } from '../../src/email/types/email.types.js';

// Mock dependencies
const mockPromptService = {
    extractStructuredData: jest.fn(),
    summarizeContent: jest.fn(),
    generateText: jest.fn(),
} as any;

const mockMemoryService = {
    storeEmail: jest.fn(),
    storeEmailSummary: jest.fn(),
    getConversationHistory: jest.fn(),
    updateEmailStatus: jest.fn(),
} as unknown as IEmailMemoryService;

const mockEmailLLMService = {
    evaluateAction: jest.fn(),
} as unknown as EmailLLMService;

describe('EmailProcessingService - Old Emails', () => {
    let service: EmailProcessingService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new EmailProcessingService(
            mockPromptService,
            mockMemoryService,
            mockEmailLLMService
        );
    });

    it('should skip AI processing for emails older than 1 year', async () => {
        // Create a date 366 days ago
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 366);

        const oldEmail: EmailMessage = {
            id: 'old-email-123',
            threadId: 'thread-123',
            subject: 'Ancient History',
            from: { address: 'ancestor@example.com', name: 'Ancestor' },
            to: [{ address: 'me@example.com' }],
            date: oldDate,
            text: 'This is a very old email.',
            isRead: false,
            labels: [],
        };

        const summary = await service.processEmail(oldEmail);

        // Verify AI services were NOT called
        expect(mockPromptService.extractStructuredData).not.toHaveBeenCalled();
        expect(mockPromptService.summarizeContent).not.toHaveBeenCalled();
        expect(mockEmailLLMService.evaluateAction).not.toHaveBeenCalled();

        // Verify memory service WAS called (to store the summary)
        expect(mockMemoryService.storeEmailSummary).toHaveBeenCalled();

        // Verify summary content
        expect(summary.summary).toContain('older than 1 year');
        expect(summary.actionRequired).toBe(false);
        expect(summary.priority).toBe('low');
        expect(summary.suggestedActions).toContain('ARCHIVE');
        expect(summary.recommendation?.action).toBe('ARCHIVE');
    });

    it('should process recent emails normally', async () => {
        // Create a date 1 day ago
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 1);

        const recentEmail: EmailMessage = {
            id: 'new-email-123',
            threadId: 'thread-123',
            subject: 'Recent Update',
            from: { address: 'friend@example.com', name: 'Friend' },
            to: [{ address: 'me@example.com' }],
            date: recentDate,
            text: 'This is a recent email.',
            isRead: false,
            labels: [],
        };

        // Mock successful AI responses
        (mockPromptService.extractStructuredData as jest.Mock).mockResolvedValue({});
        (mockPromptService.summarizeContent as jest.Mock).mockResolvedValue('Recent summary');
        (mockEmailLLMService.evaluateAction as jest.Mock).mockResolvedValue({ action: 'NONE' });

        await service.processEmail(recentEmail);

        // Verify AI services WERE called
        expect(mockPromptService.extractStructuredData).toHaveBeenCalled();
        expect(mockPromptService.summarizeContent).toHaveBeenCalled();
    });
});
