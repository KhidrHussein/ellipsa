import { IpcRendererEvent } from 'electron';

// Main Electron API interface - matches preload.js exports
export interface ElectronAPI {
  // External links
  openExternal(url: string): Promise<void>;

  // Window management
  window?: {
    move: (x: number, y: number) => void;
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    setSize: (width: number, height: number) => void;
  };
  realtime?: {
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
    send: (channel: string, data: any) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
  system?: {
    platform: string;
    arch: string;
    versions: NodeJS.ProcessVersions;
  };

  // Window position and resize
  getWindowPos: () => Promise<{ x: number; y: number }>;
  setWindowPos?: (x: number, y: number) => void;
  moveWindow?: (x: number, y: number) => void;
  resizeWindow: (width: number, height: number) => void;
  getScreenSize?: () => Promise<{ width: number; height: number; x?: number; y?: number }>;

  // Observe mode
  toggleObserve?: () => void;
  getObserveStatus: () => Promise<{ observing: boolean }>;
  setObserveStatus?: (observing: boolean) => Promise<void>;
  onObserveStatus: (callback: (status: boolean) => void) => () => void;

  // Icon handling
  getIconData?: (path: string) => Promise<string>;
  getIconPath?: (name: string) => Promise<string>;

  // Audio capture
  startAudioCapture: () => Promise<void>;
  stopAudioCapture: () => void;
  onAudioLevel: (callback: (level: number) => void) => () => void;

  // Context menu and chat
  showContextMenu?: () => void;
  toggleChat: () => void;
  closeChat?: () => void;
  minimizeChat?: () => void;

  // Click-through control for draggable floating button
  setIgnoreMouseEvents?: (ignore: boolean) => void;

  // Messaging
  sendMessage?: (message: any) => void;
  onMessage?: (callback: (message: any) => void) => () => void;

  // App control
  quitApp?: () => void;
  cleanup?: () => void;

  // Additional properties from preload.js that may be present
  showReminder?: (data: any) => void;
  openEmail?: (id: string) => void;

  // Auth
  startGoogleLogin: () => Promise<void>;
  onLoginSuccess: (callback: (userId: string) => void) => () => void;
  setUserId: (userId: string) => void;
}

// FloatingAssistantUI class interface
interface FloatingAssistantUIClass {
  new(): any;
}

// Extend the Window interface
declare global {
  interface Window {
    electron: ElectronAPI;
    ellipsa: ElectronAPI;
    FloatingAssistantUI?: FloatingAssistantUIClass;
    ellipsaAssistant?: any;
  }
}
