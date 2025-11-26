import { EventEmitter } from 'events';

export interface ProcessAudioOptions {
  sampleRate?: number;
  channels?: number;
  format?: string;
  timestamp?: string;
  source?: string;
  [key: string]: any; // Allow additional properties
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

class ProcessorClient extends EventEmitter {
  constructor() {
    super();
  }

  async processAudio(
    audioData: Buffer | Float32Array,
    options: ProcessAudioOptions = {}
  ): Promise<ProcessAudioResult> {
    try {
      console.log('Processing audio data with options:', options);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        event: {
          type: 'audio_processed',
          data: { length: audioData.length },
          metadata: { ...options, timestamp: Date.now() }
        }
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      return {
        event: {
          type: 'processing_error',
          data: { error: error instanceof Error ? error.message : 'Unknown error' }
        },
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }
}

export const processorClient = new ProcessorClient();
