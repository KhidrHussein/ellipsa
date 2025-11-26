import { FloatingAssistantUI } from './components/FloatingAssistant';
import { realtimeService } from '../services/RealtimeService';

// Expose the FloatingAssistantUI class to the window object
declare global {
  interface Window {
    FloatingAssistantUI: typeof FloatingAssistantUI;
    ellipsaAssistant?: FloatingAssistantUI;
  }
}

// Assign the FloatingAssistantUI class to the window object
window.FloatingAssistantUI = FloatingAssistantUI;

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('[Renderer] DOM fully loaded, initializing...');

    // Initialize the floating assistant
    console.log('[Renderer] Creating FloatingAssistantUI instance...');
    window.ellipsaAssistant = new FloatingAssistantUI();
    console.log('[Renderer] FloatingAssistantUI instance created');

    // Connect to the realtime service
    console.log('[Renderer] Connecting to RealtimeService...');
    realtimeService.connect();
    console.log('[Renderer] RealtimeService connection initiated');

    console.log('[Renderer] Ellipsa Edge Agent initialized successfully');
  } catch (error) {
    console.error('[Renderer] Failed to initialize:', error);
    console.error('[Renderer] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
  }
});

// Handle window unload
window.addEventListener('beforeunload', () => {
  // Clean up resources
  realtimeService.disconnect();
  console.log('[Renderer] Cleaning up resources before unload');
});

// Log that the renderer script has been loaded
console.log('[Renderer] Renderer script loaded');
