// Re-export all types from email.types.ts
export * from './types/email.types.js';

// Extend types if needed
declare global {
  interface EmailMessage {
    // Extended fields are already defined in email.types.ts
  }
}
