// Type definitions for Electron (renderer process)
declare namespace Electron {
  interface IpcRenderer {
    send(channel: string, ...args: any[]): void;
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    removeListener(channel: string, listener: (...args: any[]) => void): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
  }
}

declare const ipcRenderer: Electron.IpcRenderer;
declare const isElectron: boolean;
