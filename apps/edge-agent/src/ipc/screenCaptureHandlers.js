import { ipcMain } from 'electron';
import { ScreenCapture } from '../capture/screenCapture';
export class ScreenCaptureHandlers {
    constructor() {
        this.mainWindow = null;
        this.isCapturing = false;
        this.screenCapture = new ScreenCapture();
        this.setupHandlers();
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    setupHandlers() {
        // Start screen capture
        ipcMain.handle('start-screen-capture', async (_, interval = 5000) => {
            console.log(`[ScreenCapture] Starting screen capture with interval: ${interval}ms`);
            if (this.isCapturing) {
                console.log('[ScreenCapture] Capture already running');
                return { success: false, message: 'Screen capture is already running' };
            }
            try {
                console.log('[ScreenCapture] Initializing screen capture...');
                const started = await this.screenCapture.startCapture(interval, this.mainWindow || undefined);
                if (started) {
                    this.isCapturing = true;
                    console.log('[ScreenCapture] Screen capture started successfully');
                    return { success: true, message: 'Screen capture started' };
                }
                else {
                    console.error('[ScreenCapture] Failed to start screen capture');
                    return { success: false, message: 'Failed to start screen capture' };
                }
            }
            catch (error) {
                console.error('Error starting screen capture:', error);
                return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` };
            }
        });
        // Stop screen capture
        ipcMain.handle('stop-screen-capture', async () => {
            if (!this.isCapturing) {
                return { success: false, message: 'Screen capture is not running' };
            }
            try {
                await this.screenCapture.stopCapture();
                this.isCapturing = false;
                return { success: true, message: 'Screen capture stopped' };
            }
            catch (error) {
                console.error('Error stopping screen capture:', error);
                return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` };
            }
        });
        // Capture a single window
        ipcMain.handle('capture-active-window', async () => {
            console.log('[ScreenCapture] Manual capture requested');
            try {
                const result = await this.screenCapture.captureActiveWindow();
                if (result) {
                    console.log(`[ScreenCapture] Captured window: ${result.windowTitle}`);
                    console.log(`[ScreenCapture] Screenshot saved to: ${result.filePath}`);
                }
                else {
                    console.warn('[ScreenCapture] No result from captureActiveWindow');
                }
                return result;
            }
            catch (error) {
                return null;
            }
        });
        // Get current capture status
        ipcMain.handle('get-capture-status', () => ({
            isCapturing: this.isCapturing,
            lastCapture: this.screenCapture.applicationContext
        }));
    }
    cleanup() {
        if (ipcMain.eventNames().includes('start-screen-capture')) {
            ipcMain.removeHandler('start-screen-capture');
        }
        if (ipcMain.eventNames().includes('stop-screen-capture')) {
            ipcMain.removeHandler('stop-screen-capture');
        }
        if (ipcMain.eventNames().includes('capture-active-window')) {
            ipcMain.removeHandler('capture-active-window');
        }
        if (ipcMain.eventNames().includes('get-capture-status')) {
            ipcMain.removeHandler('get-capture-status');
        }
    }
}
// Export a singleton instance
export const screenCaptureHandlers = new ScreenCaptureHandlers();
//# sourceMappingURL=screenCaptureHandlers.js.map