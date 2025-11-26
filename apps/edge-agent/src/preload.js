const { contextBridge, ipcRenderer } = window.require('electron');
const path = window.require('path');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, ...args) => {
      // Whitelist channels that the renderer can send messages to
      const validChannels = ['toMain'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    on: (channel, func) => {
      const validChannels = ['fromMain'];
      if (validChannels.includes(channel)) {
        // Strip event as it includes `sender` and is a security risk
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeListener: (channel, func) => {
      const validChannels = ['fromMain'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, func);
      }
    },
    invoke: (channel, ...args) => {
      const validChannels = ['invoke-action'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    }
  },
  path: {
    join: (...args) => path.join(...args),
    basename: (path) => path.split(/[\\/]/).pop(),
    dirname: (path) => path.split(/[\\/]/).slice(0, -1).join('/'),
    extname: (path) => {
      const match = /\.[^.\\/]+$/.exec(path);
      return match ? match[0] : '';
    },
    resolve: (...args) => path.resolve(...args)
  },
  env: {
    NODE_ENV: process.env.NODE_ENV,
    PLATFORM: process.platform,
    IS_DEV: process.env.NODE_ENV === 'development'
  }
});

// Add a global error handler for uncaught exceptions in the renderer process
window.addEventListener('error', (event) => {
  console.error('Uncaught error in renderer:', event.error || event.message || event);
});

// Log that preload script has been loaded
console.log('Preload script loaded');
