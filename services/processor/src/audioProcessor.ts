import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
const envPath = path.resolve(process.cwd(), '../../.env');
console.log(`[audioProcessor] Current working directory: ${process.cwd()}`);
console.log(`[audioProcessor] Loading environment variables from: ${envPath}`);

try {
  dotenv.config({ path: envPath, override: true });
  console.log('[audioProcessor] Environment variables loaded successfully');
} catch (error) {
  console.error('[audioProcessor] Error loading .env file:', error);
}

// Debug: Log if OPENAI_API_KEY is loaded
console.log('[audioProcessor] OPENAI_API_KEY loaded:', process.env.OPENAI_API_KEY ? 'Yes' : 'No');

import { OpenAI } from 'openai';
import type { Ingest as IngestType } from './server.js';

interface AudioProcessingResult {
  text: string;
  duration?: number;
  language?: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Supported audio formats by OpenAI Whisper
const SUPPORTED_AUDIO_FORMATS = [
  'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'
];

/**
 * Process audio data using OpenAI's Whisper API
 */
export async function processAudio(ingest: IngestType): Promise<AudioProcessingResult> {
  const { audio_ref, meta = {} } = ingest;
  
  if (!audio_ref) {
    throw new Error('No audio reference provided');
  }

  try {
    console.log('Processing audio with OpenAI Whisper API...');
    
    // Extract audio data from the reference
    const audioData = extractAudioData(audio_ref);
    if (!audioData) {
      throw new Error('Invalid audio data format');
    }
    
    // Transcribe the audio using OpenAI Whisper API
    const transcription = await transcribeWithWhisper(audioData.data, audioData.mimeType);
    
    return {
      text: transcription.text,
      duration: meta.duration as number || 0,
      language: transcription.language || (meta.language as string) || 'en'
    };
  } catch (error: any) {
    console.error('Audio processing error:', error);
    
    // Return a more descriptive error message
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    
    return {
      text: `Error transcribing audio: ${errorMessage}`,
      duration: 0,
      language: (meta.language as string) || 'en'
    };
  }
}

/**
 * Extract audio data from the audio reference
 */
function extractAudioData(audioRef: string): { data: string; mimeType: string } | null {
  // Handle data URL format: data:audio/wav;base64,...
  const dataUrlMatch = audioRef.match(/^data:(audio\/[^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      data: dataUrlMatch[2]
    };
  }
  
  // Handle direct base64 data
  if (audioRef.match(/^[A-Za-z0-9+/=]+$/)) {
    return {
      mimeType: 'audio/wav', // Default to WAV if format is not specified
      data: audioRef
    };
  }
  
  return null;
}

/**
 * Transcribe audio using OpenAI's Whisper API
 */
async function transcribeWithWhisper(
  base64Audio: string,
  mimeType: string
): Promise<{ text: string; language: string }> {
  // Convert MIME type to file extension
  const fileExt = mimeType.split('/')[1] || 'wav';
  
  // Convert base64 to buffer
  const audioBuffer = Buffer.from(base64Audio, 'base64');
  
  // Create a file-like object for the OpenAI API
  const file = new File([audioBuffer], `audio.${fileExt}`, { type: mimeType });
  
  try {
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en', // Optional: specify the language if known
      response_format: 'json',
    });
    
    // The Whisper API doesn't return the language in the response
    // We'll use the language we specified in the request
    return {
      text: transcription.text,
      language: 'en' // Use the language from the request
    };
  } catch (error: any) {
    console.error('OpenAI Whisper API error:', error);
    throw error;
  }
}
