// Export types
export type {
  EmailAddress,
  EmailAttachment,
  EmailMessage,
  EmailSummary,
  DraftResponse,
  EmailSweepOptions,
  EmailSweepResult,
  IEmailService
} from './types/email.types.js';

// Export services
export { GmailEmailService } from './services/GmailEmailService.js';
export { IEmailMemoryService } from './services/IEmailMemoryService.js';
export { EmailProcessingService } from './services/EmailProcessingService.js';
export { NotificationBridge } from './services/NotificationBridge.js';
export { OAuthService } from './services/OAuthService.js';
