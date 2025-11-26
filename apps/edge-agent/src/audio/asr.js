import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { platform } from 'os';
export class WhisperASR {
    constructor(options = {}) {
        this.isProcessing = false;
        this.modelPath = options.modelPath || this.getDefaultModelPath();
        this.language = options.language || WhisperASR.DEFAULT_LANGUAGE;
        this.temperature = options.temperature ?? WhisperASR.DEFAULT_TEMPERATURE;
        this.initialPrompt = options.initialPrompt || '';
    }
    getDefaultModelPath() {
        const appDataPath = app.getPath('userData');
        return join(appDataPath, 'models', 'ggml-base.en.bin');
    }
    /**
     * Transcribes audio data to text using Whisper
     * @param audioData Buffer containing audio data in WAV format
     * @returns Promise that resolves to the transcription result
     */
    async transcribe(audioData) {
        if (this.isProcessing) {
            throw new Error('ASR is already processing another request');
        }
        this.isProcessing = true;
        const tempFile = join(app.getPath('temp'), `audio_${Date.now()}.wav`);
        try {
            // Write audio data to a temporary file
            await writeFile(tempFile, audioData);
            // Prepare Whisper command
            const args = [
                '--model', this.modelPath,
                '--file', tempFile,
                '--language', this.language,
                '--temperature', this.temperature.toString(),
                '--output-json',
                '--output-file', tempFile + '.json',
                '--print-colors',
            ];
            if (this.initialPrompt) {
                args.push('--prompt', this.initialPrompt);
            }
            // Execute Whisper
            const result = await this.executeWhisper(args);
            // Read and parse the output
            const outputFile = tempFile + '.json';
            const output = await import(outputFile);
            return output;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during ASR processing';
            console.error('ASR Error:', errorMessage);
            throw new Error(`ASR processing failed: ${errorMessage}`);
        }
        finally {
            // Clean up temporary files
            try {
                await unlink(tempFile);
                await unlink(tempFile + '.json');
            }
            catch (e) {
                console.warn('Failed to clean up temporary files:', e);
            }
            this.isProcessing = false;
        }
    }
    async executeWhisper(args) {
        return new Promise((resolve, reject) => {
            const isWindows = platform() === 'win32';
            const command = isWindows ? 'whisper-cpp' : './whisper-cpp';
            const process = spawn(command, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                }
                else {
                    reject(new Error(`Whisper process exited with code ${code}: ${stderr}`));
                }
            });
            process.on('error', (error) => {
                reject(new Error(`Failed to start Whisper: ${error.message}`));
            });
        });
    }
    /**
     * Processes a stream of audio data and returns a stream of transcriptions
     * @param audioStream Readable stream of audio data
     * @returns Async generator that yields transcription results
     */
    async *transcribeStream(audioStream) {
        // Implementation for streaming transcription would go here
        // This is a placeholder for future implementation
        throw new Error('Streaming transcription not yet implemented');
    }
}
WhisperASR.DEFAULT_MODEL = 'base';
WhisperASR.DEFAULT_TEMPERATURE = 0.0;
WhisperASR.DEFAULT_LANGUAGE = 'en';
// Export a singleton instance
export const whisperASR = new WhisperASR();
//# sourceMappingURL=asr.js.map