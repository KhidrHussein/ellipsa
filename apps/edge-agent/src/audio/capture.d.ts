import { BrowserWindow } from 'electron';
declare global {
    interface Window {
        require: NodeRequire;
    }
}
/**
 * Starts audio capture from the desktop
 * @param mainWindow The main browser window for sending IPC messages
 * @returns Promise that resolves to true if capture started successfully
 */
interface ProcessedAudioResult {
    audioData: ArrayBuffer;
    text?: string;
    event?: any;
    error?: Error;
}
type AudioProcessor = (audioData: ArrayBuffer, metadata: Record<string, any>) => Promise<ProcessedAudioResult>;
declare global {
    interface Window {
        require: NodeRequire;
    }
}
export declare function startAudioCapture(mainWindow: BrowserWindow | null, onAudioProcessed?: AudioProcessor): Promise<boolean>;
/**
 * Stops the current audio capture if one is in progress
 * @param mainWindow The main browser window for sending IPC messages
 */
export declare function stopAudioCapture(mainWindow: BrowserWindow | null): void;
export {};
//# sourceMappingURL=capture.d.ts.map