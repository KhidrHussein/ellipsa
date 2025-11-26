export interface ScreenCaptureEvent {
    type: 'screen_capture';
    data: {
        id: string;
        textContent: string;
        metadata: {
            windowTitle: string;
            appName: string;
            timestamp: string;
            url?: string;
        };
    };
}
export declare class ResponsePipeline {
    private static instance;
    private llmService;
    private eventService;
    private realtimeService;
    private activeContextId;
    private constructor();
    static getInstance(): ResponsePipeline;
    private setupEventListeners;
    private handleScreenCapture;
    private handleUserMessage;
    private handleEventProcessed;
    start(): void;
    stop(): void;
}
export declare const responsePipeline: ResponsePipeline;
//# sourceMappingURL=ResponsePipeline.d.ts.map