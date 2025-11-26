// Global type declarations
declare module 'googleapis' {
  export * from 'googleapis/build/src/apis/gmail';
  export * from 'googleapis/build/src/apis/oauth2';
  // Add other Google APIs as needed
}

declare module 'google-auth-library' {
  export * from 'google-auth-library/build/src/auth/oauth2client';
  // Add other auth exports as needed
}

// Ensure Buffer is available globally
declare const Buffer: typeof globalThis.Buffer;

// Console type for Node.js
declare const console: Console;
