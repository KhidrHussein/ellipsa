const { contextBridge, ipcRenderer } = require('electron');

// Enable better error logging
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  ipcRenderer.send('error-in-preload', error.toString());
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  ipcRenderer.send('error-in-preload', 'Unhandled Rejection: ' + (reason instanceof Error ? reason.message : String(reason)));
});

// Helper function to create a promise-based event listener
const createListener = (channel) => {
  const listeners = new Set();
  
  ipcRenderer.on(channel, (_, ...args) => {
    listeners.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in ${channel} listener:`, error);
      }
    });
  });
  
  return {
    addListener: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    removeListener: (callback) => {
      listeners.delete(callback);
    },
    removeAllListeners: () => {
      listeners.clear();
    }
  };
};
// Create event listeners
const audioLevelListener = createListener('audio-level-update');

// Expose audio capture methods
// Audio capture state
let mediaRecorder = null;
let audioChunks = [];
let isCapturing = false;
let audioStream = null;

// Helper function to safely stop tracks
const stopTracks = (stream) => {
  if (!stream) return;
  try {
    const tracks = stream.getTracks();
    tracks.forEach(track => {
      try {
        track.stop();
      } catch (e) {
        console.error('Error stopping track:', e);
      }
    });
  } catch (e) {
    console.error('Error in stopTracks:', e);
  }
};

// Audio capture functions
const startAudioCapture = async () => {
  console.log('Starting audio capture...');
  try {
    // Clean up any existing stream
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    stopTracks(audioStream);

    console.log('Requesting audio permissions...');
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      console.log('Got audio stream:', audioStream);
    } catch (err) {
      console.error('Failed to get audio stream:', err);
      throw new Error(`Could not access microphone: ${err.message}`);
    }

    try {
      console.log('Creating MediaRecorder...');
      mediaRecorder = new MediaRecorder(audioStream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Audio data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        ipcRenderer.send('audio-capture-error', 'MediaRecorder error: ' + (event.error?.message || 'Unknown error'));
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, processing chunks...');
        try {
          if (audioChunks.length > 0) {
            console.log(`Processing ${audioChunks.length} audio chunks`);
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log('Sending audio to main process:', arrayBuffer.byteLength, 'bytes');
            await ipcRenderer.invoke('process-audio', arrayBuffer);
          }
        } catch (err) {
          console.error('Error processing audio chunks:', err);
          ipcRenderer.send('audio-capture-error', 'Error processing audio: ' + err.message);
        } finally {
          audioChunks = [];
        }
      };

      console.log('Starting MediaRecorder...');
      mediaRecorder.start(5000); // Collect data every 5 seconds
      isCapturing = true;
      console.log('Audio capture started successfully');
      return true;
    } catch (err) {
      console.error('Error initializing MediaRecorder:', err);
      stopTracks(audioStream);
      throw new Error(`Failed to initialize MediaRecorder: ${err.message}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error in startAudioCapture:', error);
    ipcRenderer.send('audio-capture-error', errorMsg);
    return false;
  }
};

const stopAudioCapture = () => {
  console.log('Stopping audio capture...');
  try {
    if (mediaRecorder && isCapturing) {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      stopTracks(audioStream);
      isCapturing = false;
      console.log('Audio capture stopped');
    }
    return true;
  } catch (error) {
    console.error('Error stopping audio capture:', error);
    return false;
  }
};

// Expose to renderer
contextBridge.exposeInMainWorld('ellipsa', {
  // Audio capture methods
  startAudioCapture,
  stopAudioCapture,
  onAudioLevel: (callback) => {
    const removeListener = audioLevelListener.addListener(callback);
    return removeListener;
  },
  
  // Existing functions
  toggleObserve: () => ipcRenderer.send('toggle-observe'),
  getObserveStatus: () => ipcRenderer.invoke('get-observe-status'),
  onObserveStatus: (callback) => {
    const wrappedCallback = (_, status) => callback(status);
    ipcRenderer.on('observe-status', wrappedCallback);
    return () => ipcRenderer.off('observe-status', wrappedCallback);
  },
  getIconPath: () => ipcRenderer.invoke('get-icon-path'),
  getIconData: () => ipcRenderer.invoke('get-icon-data'),
  moveWindow: (x, y) => ipcRenderer.send('move-window', { x, y }),
  getWindowPos: () => ipcRenderer.invoke('get-window-pos'),
  
  // Cleanup function
  cleanup: () => {
    audioLevelListener.removeAllListeners();
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (window.ellipsa.cleanup) {
    window.ellipsa.cleanup();
  }
});
