import { contextBridge, ipcRenderer } from 'electron';
// Define the API that will be exposed to the renderer process
const screenCaptureAPI = {
    // Start screen capture
    startCapture: (interval = 5000) => ipcRenderer.invoke('start-screen-capture', interval),
    // Stop screen capture
    stopCapture: () => ipcRenderer.invoke('stop-screen-capture'),
    // Capture a single window
    captureActiveWindow: () => ipcRenderer.invoke('capture-active-window'),
    // Get current capture status
    getCaptureStatus: () => ipcRenderer.invoke('get-capture-status'),
    // Listen for capture events
    onCaptureUpdate: (callback) => {
        const handler = (_, result) => callback(result);
        ipcRenderer.on('screenshot-captured', handler);
        return () => {
            ipcRenderer.off('screenshot-captured', handler);
        };
    }
};
// Expose the API to the renderer process
contextBridge.exposeInMainWorld('screenCapture', screenCaptureAPI);
//# sourceMappingURL=screenCapture.js.map