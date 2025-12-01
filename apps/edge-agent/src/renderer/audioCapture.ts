// Audio capture module with continuous recording via timeslice
import { ipcRenderer } from 'electron';

export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private isCapturing = false;
  private stream: MediaStream | null = null;
  private readonly segmentDuration = 10000; // 10 seconds


  async start(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('[AudioCapture] Already running');
      return true;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000
        },
        video: false
      }).catch(error => {
        console.error('[AudioCapture] Error getting audio stream:', error);
        throw new Error('Could not access microphone. Please ensure microphone permissions are granted.');
      });

      this.isCapturing = true;
      this.startNewSegment();
      console.log(`[AudioCapture] Started recording with ${this.segmentDuration}ms segments`);
      return true;
    } catch (error) {
      console.error('[AudioCapture] Error starting audio capture:', error);
      return false;
    }
  }

  private startNewSegment(): void {
    if (!this.isCapturing || !this.stream) return;

    const options = { mimeType: 'audio/webm;codecs=opus' };
    let recorder: MediaRecorder;

    try {
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
        recorder = new MediaRecorder(this.stream, { ...options, audioBitsPerSecond: 16000 });
      } else {
        console.warn('[AudioCapture] audio/webm;codecs=opus not supported, using default');
        recorder = new MediaRecorder(this.stream, { audioBitsPerSecond: 16000 });
      }
    } catch (e) {
      console.error('[AudioCapture] Failed to create MediaRecorder:', e);
      return;
    }

    this.mediaRecorder = recorder;

    // FIX: Process each blob immediately as it arrives from timeslice
    // Each blob will have a complete WebM header, making it transcribable
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        // Each blob from timeslice is a complete, valid WebM file
        this.processAudioSegment(event.data);
      }
    };

    recorder.onerror = (event) => {
      console.error('[AudioCapture] MediaRecorder error:', event);
    };

    // Only used when actually stopping capture, not for segment boundaries
    recorder.onstop = () => {
      console.log('[AudioCapture] MediaRecorder stopped');
    };

    // FIX: Use timeslice parameter instead of manual stop/start
    // This makes MediaRecorder automatically emit complete WebM files every segmentDuration
    recorder.start(this.segmentDuration);
    console.log(`[AudioCapture] Started continuous recording with ${this.segmentDuration}ms timeslice`);
  }

  stop(): void {
    this.isCapturing = false;

    // Stop the MediaRecorder if it's recording
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    this.mediaRecorder = null;

    // Stop all audio tracks to release the microphone
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    console.log('[AudioCapture] Audio capture stopped');
  }

  private async processAudioSegment(audioBlob: Blob): Promise<void> {
    if (audioBlob.size < 1000) {
      return; // Skip empty/tiny blobs
    }

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const headerHex = Array.from(uint8Array.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      // Using console.error to ensure visibility in terminal logs during debugging
      console.error(`[AudioCapture] Processing segment. Size: ${audioBlob.size}, Type: ${audioBlob.type}, Header: ${headerHex}`);

      // WebM signature is 1A 45 DF A3
      if (headerHex.toLowerCase() !== '1a45dfa3') {
        console.error(`[AudioCapture] Skipping malformed audio segment. Header: ${headerHex}`);
        return;
      }

      // Use FileReader for reliable base64 conversion in renderer
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to convert blob to base64'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      await ipcRenderer.invoke('process-audio', {
        audioData: base64data,
        timestamp: Date.now(),
        size: audioBlob.size,
        sampleRate: 16000,
        mimeType: audioBlob.type
      });

    } catch (error) {
      console.error('Error processing audio segment:', error);
    }
  }
}

export const audioCapture = new AudioCapture();