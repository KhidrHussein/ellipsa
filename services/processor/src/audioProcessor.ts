import { spawn } from 'child_process';
import { unlink } from 'fs/promises';
import type { Ingest as IngestType } from "@ellipsa/shared";

export interface AudioProcessingResult {
  text: string;
  duration?: number;
  language?: string;
}

export async function processAudio(ingest: IngestType): Promise<AudioProcessingResult> {
  const { audio_ref } = ingest;
  
  if (!audio_ref) {
    throw new Error('No audio reference provided');
  }

  try {
    const wavPath = await convertToWav(audio_ref);
    const transcription = await transcribeAudio(wavPath);
    
    // Clean up temporary files
    await unlink(wavPath);
    if (audio_ref !== ingest.audio_ref) {
      await unlink(audio_ref);
    }

    return {
      text: transcription,
      duration: ingest.meta?.duration as number | undefined,
      language: 'en'
    };
  } catch (error) {
    console.error('Audio processing error:', error);
    throw error;
  }
}

async function convertToWav(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = `${audioPath}.wav`;
    const ffmpeg = spawn('ffmpeg', [
      '-i', audioPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

async function transcribeAudio(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const whisper = spawn('whisper', [
      audioPath,
      '--model', 'base',
      '--language', 'en',
      '--output_format', 'json',
      '--fp16', 'False'
    ]);

    let transcription = '';
    let errorOutput = '';

    whisper.stdout.on('data', (data) => {
      transcription += data.toString();
    });

    whisper.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    whisper.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(transcription);
          resolve(result.text || '');
        } catch (e) {
          console.error('Error parsing transcription:', e);
          resolve(transcription);
        }
      } else {
        reject(new Error(`Whisper process failed: ${errorOutput}`));
      }
    });
  });
}
