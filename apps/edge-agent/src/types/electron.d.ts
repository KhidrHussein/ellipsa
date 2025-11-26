import { IpcRendererEvent } from 'electron';

// Main Electron API interface
export interface ElectronAPI {
  window: {
    move: (x: number, y: number) => void;
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    setSize: (width: number, height: number) => void;
  };
  realtime: {
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
    send: (channel: string, data: any) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
  system: {
    platform: string;
    arch: string;
    versions: NodeJS.ProcessVersions;
  };
  getWindowPos: () => Promise<{ x: number; y: number }>;
  setWindowPos: (x: number, y: number) => void;
  getObserveStatus: () => Promise<{ observing: boolean }>;
  setObserveStatus: (observing: boolean) => Promise<void>;
  onObserveStatus: (callback: (status: boolean) => void) => () => void;
  getIconData: (path: string) => Promise<string>;
  getIconPath: (name: string) => Promise<string>;
  getScreenSize: () => Promise<{ width: number; height: number; x: number; y: number }>;
  startAudioCapture: () => Promise<void>;
  stopAudioCapture: () => void;
  onAudioLevel: (callback: (level: number) => void) => () => void;
  showContextMenu: () => void;
}

// Extend the Window interface
declare global {
  interface Window {
    electron: ElectronAPI;
    ellipsa: ElectronAPI;
  }
}
