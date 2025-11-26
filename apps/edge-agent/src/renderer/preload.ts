import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      // Whitelist channels that the renderer can send messages to
      const validChannels = ['toMain'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    on: (channel: string, func: (...args: any[]) => void) => {
      const validChannels = ['fromMain'];
      if (validChannels.includes(channel)) {
        // Strip event as it includes `sender` and is a security risk
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeListener: (channel: string, func: (...args: any[]) => void) => {
      const validChannels = ['fromMain'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, func);
      }
    },
  },
});

// Add any other preload scripts here
console.log('Preload script loaded');
