import { ipcRenderer } from 'electron';

export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isCapturing = false;
  private segmentInterval: NodeJS.Timeout | null = null;
  private readonly segmentDuration = 10000; // 10 seconds per segment for faster feedback
  private stream: MediaStream | null = null;

  async start(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('Audio capture is already running');
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000
        },
        video: false
      }).catch(error => {
        console.error('Error getting audio stream:', error);
        throw new Error('Could not access microphone. Please ensure microphone permissions are granted.');
      });

      this.stream = stream; // Store the stream
      this.audioChunks = [];
      this.isCapturing = true;

      const startRecordingSegment = () => {
        if (!this.isCapturing || !this.stream) return;

        const options = { mimeType: 'audio/webm' };
        let recorder: MediaRecorder;

        try {
          if (MediaRecorder.isTypeSupported(options.mimeType)) {
            recorder = new MediaRecorder(this.stream, {
              ...options,
              audioBitsPerSecond: 16000
            });
          } else {
            console.warn('Requested MIME type not supported, using default');
            recorder = new MediaRecorder(this.stream, {
              audioBitsPerSecond: 16000
            });
          }
        } catch (e) {
          console.error('Failed to create MediaRecorder:', e);
          return;
        }

        this.mediaRecorder = recorder;
        this.audioChunks = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          this.processAudioSegment();
          if (this.isCapturing) {
            startRecordingSegment();
          }
        };

        recorder.onerror = (event) => {
          console.error('MediaRecorder error:', event);
          this.stop();
        };

        recorder.start();
        console.log('Audio segment recording started');

        // Schedule stop
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, this.segmentDuration);
      };

      // Start the first segment
      startRecordingSegment();
      console.log('Audio capture started');

      return true;
    } catch (error) {
      console.error('Error starting audio capture:', error);
      return false;
    }
  }

  stop(): void {
    if (this.isCapturing) {
      this.isCapturing = false;

      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }

      this.mediaRecorder = null;

      // Stop all tracks from the original stream
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      console.log('Audio capture stopped');
    }
  }

  private async processAudioSegment(): Promise<void> {
    if (!this.audioChunks.length) return;

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    if (audioBlob.size < 1000) { // Skip very small chunks
      return;
    }

    // Keep a reference to the chunks we're about to process
    // Note: audioChunks are cleared in onstop before restart, but for the final stop, we need to handle it.
    // Actually, onstop calls processAudioSegment.
    // In onstop, we clear audioChunks AFTER processAudioSegment returns? No, processAudioSegment is async.
    // We should pass the blob to processAudioSegment or use local variable.
    // The current logic creates audioBlob from this.audioChunks.

    try {
      console.log(`Processing audio segment (${audioBlob.size} bytes)`);

      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      console.log('Audio header (first 4 bytes):', Array.from(uint8Array.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' '));

      const base64data = Buffer.from(uint8Array).toString('base64');

      const success = await ipcRenderer.invoke('process-audio', {
        audioData: base64data,
        timestamp: Date.now(),
        size: audioBlob.size,
        sampleRate: 16000
      });

      if (!success) {
        throw new Error('Failed to process audio in main process');
      }

      console.log('Audio segment processed successfully');

    } catch (error) {
      console.error('Error processing audio segment:', error);
    }
  }
}

export const audioCapture = new AudioCapture();
