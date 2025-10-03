const { contextBridge, ipcRenderer } = require('electron');

// Helper function to create a promise-based event listener
const createListener = (channel) => {
  const listeners = new Set();
  
  ipcRenderer.on(channel, (_, ...args) => {
    listeners.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in ${channel} listener:`, error);
      }
    });
  });
  
  return {
    addListener: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    removeListener: (callback) => {
      listeners.delete(callback);
    },
    removeAllListeners: () => {
      listeners.clear();
    }
  };
};

// Create event listeners
const audioLevelListener = createListener('audio-level-update');

contextBridge.exposeInMainWorld('ellipsa', {
  // Audio related
  startAudioCapture: () => ipcRenderer.invoke('start-audio-capture'),
  stopAudioCapture: () => ipcRenderer.invoke('stop-audio-capture'),
  onAudioLevel: (callback) => {
    const wrappedCallback = (_, level) => callback(level);
    audioLevelListener.addListener(wrappedCallback);
    return () => audioLevelListener.removeListener(wrappedCallback);
  },
  
  // Existing functions
  toggleObserve: () => ipcRenderer.send('toggle-observe'),
  getObserveStatus: () => ipcRenderer.invoke('get-observe-status'),
  onObserveStatus: (callback) => {
    const wrappedCallback = (_, status) => callback(status);
    ipcRenderer.on('observe-status', wrappedCallback);
    return () => ipcRenderer.off('observe-status', wrappedCallback);
  },
  getIconPath: () => ipcRenderer.invoke('get-icon-path'),
  getIconData: () => ipcRenderer.invoke('get-icon-data'),
  moveWindow: (x, y) => ipcRenderer.send('move-window', { x, y }),
  getWindowPos: () => ipcRenderer.invoke('get-window-pos'),
  
  // Cleanup function
  cleanup: () => {
    audioLevelListener.removeAllListeners();
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (window.ellipsa.cleanup) {
    window.ellipsa.cleanup();
  }
});
