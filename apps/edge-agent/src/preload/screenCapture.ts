import { contextBridge, ipcRenderer } from 'electron';
import type { CaptureResult } from '../capture/screenCapture';

// Define the API that will be exposed to the renderer process
const screenCaptureAPI = {
  // Start screen capture
  startCapture: (interval: number = 5000) => 
    ipcRenderer.invoke('start-screen-capture', interval),
    
  // Stop screen capture
  stopCapture: () => 
    ipcRenderer.invoke('stop-screen-capture'),
    
  // Capture a single window
  captureActiveWindow: (): Promise<CaptureResult | null> => 
    ipcRenderer.invoke('capture-active-window'),
    
  // Get current capture status
  getCaptureStatus: () => 
    ipcRenderer.invoke('get-capture-status'),
    
  // Listen for capture events
  onCaptureUpdate: (callback: (result: CaptureResult) => void) => {
    const handler = (_: any, result: CaptureResult) => callback(result);
    ipcRenderer.on('screenshot-captured', handler);
    return () => {
      ipcRenderer.off('screenshot-captured', handler);
    };
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('screenCapture', screenCaptureAPI);

// Type declarations for TypeScript support
declare global {
  interface Window {
    screenCapture: typeof screenCaptureAPI;
  }
}
