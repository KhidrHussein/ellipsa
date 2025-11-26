import type { CaptureResult } from '../capture/screenCapture';
declare const screenCaptureAPI: {
    startCapture: (interval?: number) => Promise<any>;
    stopCapture: () => Promise<any>;
    captureActiveWindow: () => Promise<CaptureResult | null>;
    getCaptureStatus: () => Promise<any>;
    onCaptureUpdate: (callback: (result: CaptureResult) => void) => () => void;
};
declare global {
    interface Window {
        screenCapture: typeof screenCaptureAPI;
    }
}
export {};
//# sourceMappingURL=screenCapture.d.ts.map