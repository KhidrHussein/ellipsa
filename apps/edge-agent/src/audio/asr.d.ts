import { Readable } from 'stream';
export interface ASROptions {
    modelPath?: string;
    language?: string;
    temperature?: number;
    initialPrompt?: string;
}
export interface TranscriptionResult {
    text: string;
    language: string;
    segments: {
        id: number;
        start: number;
        end: number;
        text: string;
        tokens: number[];
        temperature: number;
        avgLogProb: number;
        compressionRatio: number;
        noSpeechProb: number;
    }[];
}
export declare class WhisperASR {
    private static readonly DEFAULT_MODEL;
    private static readonly DEFAULT_TEMPERATURE;
    private static readonly DEFAULT_LANGUAGE;
    private modelPath;
    private language;
    private temperature;
    private initialPrompt;
    private isProcessing;
    constructor(options?: ASROptions);
    private getDefaultModelPath;
    /**
     * Transcribes audio data to text using Whisper
     * @param audioData Buffer containing audio data in WAV format
     * @returns Promise that resolves to the transcription result
     */
    transcribe(audioData: Buffer): Promise<TranscriptionResult>;
    private executeWhisper;
    /**
     * Processes a stream of audio data and returns a stream of transcriptions
     * @param audioStream Readable stream of audio data
     * @returns Async generator that yields transcription results
     */
    transcribeStream(audioStream: Readable): AsyncGenerator<TranscriptionResult>;
}
export declare const whisperASR: WhisperASR;
//# sourceMappingURL=asr.d.ts.map