import { Transform } from 'stream';
/**
 * Processes audio data to improve ASR accuracy
 */
export class AudioPreprocessor {
    constructor(options = {}) {
        this.silenceCounter = 0;
        this.isTalking = false;
        this.audioContext = null;
        this.options = {
            sampleRate: options.sampleRate || 16000,
            channels: options.channels ?? 1,
            bitDepth: options.bitDepth ?? 16,
            noiseReduction: options.noiseReduction ?? true,
            voiceActivityDetection: options.voiceActivityDetection ?? true,
            silenceThreshold: options.silenceThreshold ?? 0.05, // 5% of max amplitude
            silenceDuration: options.silenceDuration ?? 2000, // 2 seconds
        };
    }
    /**
     * Process audio data with the configured preprocessing steps
     * @param audioData Raw audio data buffer
     * @returns Processed audio data buffer
     */
    async process(audioData) {
        // Convert buffer to Float32Array for processing
        const samples = this.bufferToFloat32(audioData);
        // Apply processing steps
        let processedSamples = samples;
        if (this.options.noiseReduction) {
            processedSamples = await this.applyNoiseReduction(processedSamples);
        }
        if (this.options.voiceActivityDetection) {
            processedSamples = this.applyVoiceActivityDetection(processedSamples);
        }
        // Convert back to the original format
        return this.float32ToBuffer(processedSamples);
    }
    /**
     * Create a transform stream for processing audio in real-time
     * @returns Transform stream that processes audio chunks
     */
    createTransformStream() {
        return new Transform({
            transform: async (chunk, encoding, callback) => {
                try {
                    const processed = await this.process(chunk);
                    callback(null, processed);
                }
                catch (error) {
                    callback(error);
                }
            },
        });
    }
    /**
     * Apply noise reduction to the audio samples
     * @param samples Audio samples as Float32Array
     * @returns Processed samples with reduced noise
     */
    async applyNoiseReduction(samples) {
        // Simple noise gate implementation
        const threshold = 0.01; // Adjust based on your audio levels
        const processed = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            processed[i] = Math.abs(samples[i]) > threshold ? samples[i] : 0;
        }
        return processed;
    }
    /**
     * Apply voice activity detection to the audio samples
     * @param samples Audio samples as Float32Array
     * @returns Processed samples with silence removed
     */
    applyVoiceActivityDetection(samples) {
        const { silenceThreshold, silenceDuration } = this.options;
        const sampleRate = this.options.sampleRate;
        const samplesPerMs = sampleRate / 1000;
        const minSilenceSamples = Math.floor(silenceDuration * samplesPerMs);
        let isSilent = true;
        const result = [];
        for (let i = 0; i < samples.length; i++) {
            const amplitude = Math.abs(samples[i]);
            if (amplitude > silenceThreshold) {
                isSilent = false;
                this.silenceCounter = 0;
                result.push(samples[i]);
            }
            else {
                this.silenceCounter++;
                // Only add silence if it's not too long
                if (this.silenceCounter < minSilenceSamples) {
                    result.push(samples[i]);
                }
                else if (!isSilent) {
                    // Add a small amount of silence when transitioning from speech to silence
                    result.push(0);
                    isSilent = true;
                }
            }
        }
        return new Float32Array(result);
    }
    /**
     * Convert Buffer to Float32Array
     * @param buffer Input audio buffer
     * @returns Float32Array of audio samples
     */
    bufferToFloat32(buffer) {
        const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0; // Convert to range [-1, 1]
        }
        return float32Array;
    }
    /**
     * Convert Float32Array to Buffer
     * @param samples Float32Array of audio samples
     * @returns Buffer containing the audio data
     */
    float32ToBuffer(samples) {
        const int16Array = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            // Clamp to [-1, 1] and scale to 16-bit range
            const sample = Math.max(-1, Math.min(1, samples[i]));
            int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        return Buffer.from(int16Array.buffer);
    }
}
// Export a singleton instance
export const audioPreprocessor = new AudioPreprocessor();
//# sourceMappingURL=audioPreprocessor.js.map