import { Transform } from 'stream';
export interface AudioPreprocessorOptions {
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
    noiseReduction?: boolean;
    voiceActivityDetection?: boolean;
    silenceThreshold?: number;
    silenceDuration?: number;
}
/**
 * Processes audio data to improve ASR accuracy
 */
export declare class AudioPreprocessor {
    private options;
    private silenceCounter;
    private isTalking;
    private audioContext;
    constructor(options?: AudioPreprocessorOptions);
    /**
     * Process audio data with the configured preprocessing steps
     * @param audioData Raw audio data buffer
     * @returns Processed audio data buffer
     */
    process(audioData: Buffer): Promise<Buffer>;
    /**
     * Create a transform stream for processing audio in real-time
     * @returns Transform stream that processes audio chunks
     */
    createTransformStream(): Transform;
    /**
     * Apply noise reduction to the audio samples
     * @param samples Audio samples as Float32Array
     * @returns Processed samples with reduced noise
     */
    private applyNoiseReduction;
    /**
     * Apply voice activity detection to the audio samples
     * @param samples Audio samples as Float32Array
     * @returns Processed samples with silence removed
     */
    private applyVoiceActivityDetection;
    /**
     * Convert Buffer to Float32Array
     * @param buffer Input audio buffer
     * @returns Float32Array of audio samples
     */
    private bufferToFloat32;
    /**
     * Convert Float32Array to Buffer
     * @param samples Float32Array of audio samples
     * @returns Buffer containing the audio data
     */
    private float32ToBuffer;
}
export declare const audioPreprocessor: AudioPreprocessor;
//# sourceMappingURL=audioPreprocessor.d.ts.map