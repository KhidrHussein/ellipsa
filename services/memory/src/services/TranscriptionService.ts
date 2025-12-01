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

    async transcribe(audioData: string | Buffer): Promise<string> {
        let tempFilePath: string | null = null;

        try {
            const buffer = typeof audioData === 'string'
                ? Buffer.from(audioData, 'base64')
                : audioData;

            // PRE-FLIGHT CHECK: Validate WebM Header (1A 45 DF A3)
            // This prevents sending malformed audio to OpenAI (400 Invalid File Format)
            const header = buffer.subarray(0, 4).toString('hex').toLowerCase();
            if (header !== '1a45dfa3') {
                // We throw a specific error so the caller knows it wasn't an API failure, but bad data
                throw new Error(`Invalid audio format detected. Header: ${header}. Expected WebM (1a45dfa3).`);
            }

            const tempDir = os.tmpdir();
            tempFilePath = path.join(tempDir, `audio-${Date.now()}.webm`);

            await fs.promises.writeFile(tempFilePath, buffer);

            logger.info(`Audio file written to ${tempFilePath}, size: ${buffer.length} bytes`);

            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                language: 'en',
            });

            return transcription.text;
        } catch (error) {
            logger.error('Error transcribing audio:', error);
            throw error;
        } finally {
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