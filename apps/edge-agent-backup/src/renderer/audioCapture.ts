import { ipcRenderer } from 'electron';

export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isCapturing = false;

  async start(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.processAudioSegment();
        }
      };

      this.mediaRecorder.start(5000); // Collect data every 5 seconds
      this.isCapturing = true;
      return true;
    } catch (error) {
      console.error('Error starting audio capture:', error);
      return false;
    }
  }

  stop(): void {
    if (this.mediaRecorder && this.isCapturing) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.isCapturing = false;
    }
  }

  private async processAudioSegment(): Promise<void> {
    if (this.audioChunks.length === 0) return;

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
    this.audioChunks = []; // Clear processed chunks

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      await ipcRenderer.invoke('process-audio', arrayBuffer);
    } catch (error) {
      console.error('Error processing audio segment:', error);
    }
  }
}

export const audioCapture = new AudioCapture();
