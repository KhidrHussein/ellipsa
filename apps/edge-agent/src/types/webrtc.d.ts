// Type definitions for WebRTC and related APIs

export {}; // This makes the file a module

declare global {
  interface MediaStreamTrack {
    // Add any additional properties or methods here
    // These will be merged with the existing MediaStreamTrack interface
    _customId?: string;
  }
}
