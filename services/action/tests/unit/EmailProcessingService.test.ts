import { EmailProcessingService } from '../../src/email/services/EmailProcessingService';
import { EmailMemoryService } from '../../src/email/services/EmailMemoryService';
import { PromptService } from '@ellipsa/prompt';
import { EmailMessage, EmailSummary } from '../../src/email/types';

describe('EmailProcessingService', () => {
  let service: EmailProcessingService;
  let mockPromptService: jest.Mocked<PromptService>;
  let mockMemoryService: jest.Mocked<EmailMemoryService>;

  beforeEach(() => {
    mockPromptService = {
      extractStructuredData: jest.fn(),
      summarizeContent: jest.fn(),
      generateText: jest.fn()
    } as any;

    mockMemoryService = {
      storeEmail: jest.fn().mockResolvedValue(undefined),
      storeEmailSummary: jest.fn().mockResolvedValue(undefined),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      updateEmailStatus: jest.fn().mockResolvedValue(undefined)
    } as any;

    service = new EmailProcessingService(mockPromptService, mockMemoryService);
  });

  describe('processEmail', () => {
    it('should process an email and return a summary', async () => {
      const testEmail: EmailMessage = {
        id: 'test-123',
        threadId: 'thread-123',
        subject: 'Test Email',
        from: { address: 'test@example.com' },
        to: [{ address: 'me@example.com' }],
        date: new Date(),
        text: 'This is a test email with a question?',
        isRead: false,
        labels: ['INBOX']
      };

      mockPromptService.extractStructuredData.mockResolvedValue({
        categories: ['test'],
        requiresAction: true
      });
      mockPromptService.summarizeContent.mockResolvedValue('Test summary');

      const result = await service.processEmail(testEmail);

      expect(result).toBeDefined();
      expect(result.id).toBe('test-123');
      expect(mockMemoryService.storeEmail).toHaveBeenCalledWith(testEmail);
      expect(mockMemoryService.storeEmailSummary).toHaveBeenCalled();
    });
  });

  describe('determineActionRequired', () => {
    it('should detect action required for questions', () => {
      const result = (service as any).determineActionRequired(
        {},
        'Can you please help with this?'
      );
      expect(result).toBe(true);
    });

    it('should detect action required from extracted data', () => {
      const result = (service as any).determineActionRequired(
        { requiresAction: true },
        'Some content'
      );
      expect(result).toBe(true);
    });
  });

  describe('determinePriority', () => {
    it('should detect high priority emails', () => {
      const result = (service as any).determinePriority(
        {},
        'URGENT: Need this done ASAP!'
      );
      expect(result).toBe('high');
    });

    it('should respect priority from extracted data', () => {
      const result = (service as any).determinePriority(
        { priority: 'high' },
        'Some content'
      );
      expect(result).toBe('high');
    });
  });

  describe('extractCategories', () => {
    it('should extract categories from content', () => {
      const result = (service as any).extractCategories(
        {},
        'Let\'s schedule a meeting for next week.'
      );
      expect(result).toContain('meeting');
    });

    it('should include categories from extracted data', () => {
      const result = (service as any).extractCategories(
        { categories: ['important'] },
        'Some content'
      );
      expect(result).toContain('important');
    });
  });
});
