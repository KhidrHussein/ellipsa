import { BrowserWindow } from 'electron';
export interface CaptureResult {
    id: string;
    filePath: string;
    windowTitle: string;
    appName: string;
    url?: string;
    textContent?: string;
    metadata: {
        timestamp: string;
        windowId: number | null;
        displayId: string;
        bounds: Electron.Rectangle;
        dpiScale: number;
    };
    processedAt?: string;
}
interface ApplicationContext {
    windowTitle: string;
    appName: string;
    url?: string;
    windowId: number | null;
    lastActive: Date;
}
export declare class ScreenCapture {
    private activeWindowId;
    private captureInterval;
    private readonly capturePath;
    private isCapturing;
    private _applicationContext;
    get applicationContext(): ApplicationContext | null;
    private worker;
    private readonly OCR_ENGINE;
    private readonly MIN_CAPTURE_INTERVAL;
    private lastCaptureTime;
    private eventService;
    private llmService;
    private onScreenshot?;
    constructor();
    /**
     * Extract text from a base64-encoded image using Tesseract.js
     * @param base64Image Base64-encoded image data
     * @returns Extracted text content
     */
    private extractText;
    /**
     * Update the application context with the latest window and text information
     * @param metadata Window metadata
     * @param textContent Extracted text content
     */
    private updateApplicationContext;
    private initializeOCR;
    /**
     * Start periodic screen capture
     * @param interval Capture interval in milliseconds
     * @param mainWindow Optional window reference for IPC communication
     */
    startCapture(interval?: number, mainWindow?: BrowserWindow): Promise<boolean>;
    /**
     * Get available desktop sources (windows/screens) for screen capture
     * @param options Options for source capture
     * @returns Array of desktop capturer sources
     */
    private getSources;
    /**
     * Stop the screen capture process
     * @returns boolean indicating if the capture was successfully stopped
     */
    stopCapture(): boolean;
    /**
     * Capture the currently active window or screen
     * @returns Capture result with metadata and extracted text, or null if capture failed
     */
    captureActiveWindow(): Promise<CaptureResult | null>;
}
export declare const screenCapture: ScreenCapture;
export {};
//# sourceMappingURL=screenCapture.d.ts.map