type RequestOptions = {
    method: string;
    url: string;
    data?: any;
    headers?: Record<string, string>;
};
declare class ServiceClient {
    protected client: any;
    protected serviceName: string;
    protected baseUrl: string;
    makeRequest(options: RequestOptions): Promise<any>;
    constructor(serviceName: string, baseUrl: string);
    protected createHttpClient(): {
        request: (options: {
            method: string;
            url: string;
            data?: any;
            headers?: Record<string, string>;
        }) => Promise<any>;
    };
    protected request(options: {
        method: string;
        url: string;
        data?: any;
        headers?: Record<string, string>;
    }): Promise<any>;
}
export declare class MemoryClient extends ServiceClient {
    constructor(baseUrl: string);
    storeEvent(event: any): Promise<any>;
    retrieveEvents(query: string): Promise<any>;
}
export declare const memoryClient: MemoryClient;
export declare class ProcessorClient extends ServiceClient {
    constructor();
    processAudio(audioData: ArrayBuffer, metadata: any): Promise<any>;
    processScreenshot(imageData: string, metadata: any): Promise<any>;
}
export declare const processorClient: ProcessorClient;
export declare class ActionClient extends ServiceClient {
    constructor();
    executeAction(actionType: string, params: Record<string, any>): Promise<any>;
    getAvailableActions(): Promise<any>;
}
export declare const actionClient: ActionClient;
export declare function initializeServices(): Promise<boolean>;
export {};
//# sourceMappingURL=api.d.ts.map