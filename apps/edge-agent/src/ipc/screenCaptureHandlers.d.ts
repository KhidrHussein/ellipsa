import { BrowserWindow } from 'electron';
export declare class ScreenCaptureHandlers {
    private screenCapture;
    private mainWindow;
    private isCapturing;
    constructor();
    setMainWindow(window: BrowserWindow): void;
    private setupHandlers;
    cleanup(): void;
}
export declare const screenCaptureHandlers: ScreenCaptureHandlers;
//# sourceMappingURL=screenCaptureHandlers.d.ts.map