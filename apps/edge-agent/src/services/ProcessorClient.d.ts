import { EventEmitter } from 'events';
export interface ProcessAudioOptions {
    sampleRate?: number;
    channels?: number;
    format?: string;
    timestamp?: string;
    source?: string;
    [key: string]: any;
}
export interface ProcessAudioResult {
    event: {
        type: string;
        data?: any;
        metadata?: Record<string, any>;
    };
    text?: string;
    error?: Error;
}
declare class ProcessorClient extends EventEmitter {
    constructor();
    processAudio(audioData: Buffer | Float32Array, options?: ProcessAudioOptions): Promise<ProcessAudioResult>;
}
export declare const processorClient: ProcessorClient;
export {};
//# sourceMappingURL=ProcessorClient.d.ts.map