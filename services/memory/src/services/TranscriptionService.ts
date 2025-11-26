import OpenAI from 'openai';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class TranscriptionService {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
    }

    /**
     * Transcribe audio content
     * @param audioData Base64 encoded audio data or Buffer
     * @returns Transcribed text
     */
    async transcribe(audioData: string | Buffer): Promise<string> {
        let tempFilePath: string | null = null;

        try {
            // Convert base64 to buffer if needed
            const buffer = typeof audioData === 'string'
                ? Buffer.from(audioData, 'base64')
                : audioData;

            // Create a temporary file for the audio
            // OpenAI API requires a file object or a read stream
            const tempDir = os.tmpdir();
            tempFilePath = path.join(tempDir, `audio-${Date.now()}.webm`);

            await fs.promises.writeFile(tempFilePath, buffer);

            logger.info(`Audio file written to ${tempFilePath}, size: ${buffer.length} bytes`);
            logger.info(`Audio header (hex): ${buffer.subarray(0, 20).toString('hex')}`);

            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
            });

            return transcription.text;
        } catch (error) {
            logger.error('Error transcribing audio:', error);
            throw error;
        } finally {
            // Clean up temp file
            if (tempFilePath) {
                try {
                    await fs.promises.unlink(tempFilePath);
                } catch (cleanupError) {
                    logger.warn('Failed to cleanup temp audio file:', cleanupError);
                }
            }
        }
    }
}
