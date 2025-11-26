import { contextBridge, ipcRenderer } from 'electron';
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
    // Window controls
    window: {
        minimize: () => ipcRenderer.send('window-minimize'),
        maximize: () => ipcRenderer.send('window-maximize'),
        close: () => ipcRenderer.send('window-close'),
        move: (x, y) => ipcRenderer.send('move-window', { x, y })
    },
    // Real-time communication
    realtime: {
        on: (channel, callback) => {
            // Whitelist channels
            const validChannels = [
                'connected',
                'disconnected',
                'message',
                'transcript',
                'action',
                'suggestion',
                'error'
            ];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender` 
                ipcRenderer.on(channel, (_, ...args) => callback(...args));
            }
        },
        send: (channel, data) => {
            // Whitelist channels
            const validChannels = ['message', 'command'];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        invoke: (channel, ...args) => {
            // Whitelist channels
            const validChannels = ['get-status', 'toggle-observe'];
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, ...args);
            }
            return Promise.reject(new Error('Invalid channel'));
        }
    },
    // System information
    system: {
        platform: process.platform,
        arch: process.arch,
        version: process.versions.electron
    }
});
// Add any other preload functionality here
document.addEventListener('DOMContentLoaded', () => {
    // Preload complete
});
//# sourceMappingURL=index.js.map