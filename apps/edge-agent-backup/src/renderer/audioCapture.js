const { ipcRenderer } = require('electron');

class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isCapturing = false;
  }

  async start() {
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

  stop() {
    if (this.mediaRecorder && this.isCapturing) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.isCapturing = false;
    }
  }

  async processAudioSegment() {
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

// Create a singleton instance
const audioCapture = new AudioCapture();

// Expose to renderer
window.audioCapture = audioCapture;

export default audioCapture;
