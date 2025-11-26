import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { ElectronAPI } from '../types/electron';

// Audio capture state
let audioCleanup: (() => void) | null = null;

// Get screen size helper
const getScreenSize = (): Promise<{ width: number; height: number; x: number; y: number }> => {
  return ipcRenderer.invoke('get-screen-size');
};

// Only expose the API once
if (!window.electron) {
  // Audio capture function
  const startAudioCapture = async (): Promise<() => void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Level monitoring
      let isMonitoring = true;
      const checkAudioLevel = () => {
        if (!isMonitoring) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedLevel = Math.min(1, average / 255);

        // Send level update to main process
        ipcRenderer.send('audio-level-update', { level: normalizedLevel });

        // Continue monitoring
        requestAnimationFrame(checkAudioLevel);
      };

      // Start monitoring
      requestAnimationFrame(checkAudioLevel);

      // MediaRecorder for actual audio capture
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const blob = event.data;
          const buffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          ipcRenderer.invoke('process-audio', {
            audioData: base64,
            timestamp: new Date().toISOString(),
            size: blob.size,
            sampleRate: audioContext.sampleRate
          }).catch(err => console.error('Error sending audio chunk:', err));
        }
      };

      // Start recording with 5 second chunks
      mediaRecorder.start(5000);

      // Return cleanup function
      return () => {
        isMonitoring = false;
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        stream.getTracks().forEach(track => track.stop());
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      };
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  };

  // Expose a single API object to the renderer
  const api: ElectronAPI = {
    // Window controls
    window: {
      move: (x: number, y: number) => {
        const intX = Math.round(Number(x));
        const intY = Math.round(Number(y));
        ipcRenderer.send('move-window', { x: intX, y: intY });
      },
      minimize: () => ipcRenderer.send('minimize-window'),
      maximize: () => ipcRenderer.send('maximize-window'),
      close: () => ipcRenderer.send('close-window'),
      setSize: (width: number, height: number) => ipcRenderer.send('set-window-size', { width, height })
    },

    // Real-time communication
    realtime: {
      on: (channel: string, callback: Function) => {
        const validChannels = ['assistant_message', 'suggestion', 'error', 'connected', 'disconnected'];
        if (validChannels.includes(channel)) {
          const handler = (_: any, ...args: any[]) => callback(...args);
          ipcRenderer.on(channel, handler);
          return () => ipcRenderer.removeListener(channel, handler);
        }
        return () => { };
      },
      send: (channel: string, data: any) => {
        const validChannels = ['user_message', 'command'];
        if (validChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
        }
      },
      invoke: async (channel: string, ...args: any[]) => {
        const validChannels = ['get-context', 'set-context'];
        if (validChannels.includes(channel)) {
          return await ipcRenderer.invoke(channel, ...args);
        }
        return null;
      }
    },

    // System information
    system: {
      platform: process.platform,
      arch: process.arch,
      versions: process.versions
    },

    // Window position management
    getWindowPos: () => ipcRenderer.invoke('get-window-pos') as Promise<{ x: number; y: number }>,
    setWindowPos: (x: number, y: number) => ipcRenderer.send('set-window-pos', { x, y }),

    // Observe status
    getObserveStatus: () => ipcRenderer.invoke('get-observe-status') as Promise<{ observing: boolean }>,
    setObserveStatus: (observing: boolean) => ipcRenderer.invoke('set-observe-status', observing) as Promise<void>,
    onObserveStatus: (callback: (status: boolean) => void) => {
      const handler = (_: IpcRendererEvent, status: boolean) => callback(status);
      ipcRenderer.on('observe-status', handler);
      return () => ipcRenderer.removeListener('observe-status', handler);
    },

    // Icon handling
    getIconData: (path: string) => ipcRenderer.invoke('get-icon-data', path) as Promise<string>,
    getIconPath: (name: string) => ipcRenderer.invoke('get-icon-path', name) as Promise<string>,

    // Screen
    getScreenSize,

    // Audio
    startAudioCapture: async (): Promise<void> => {
      if (audioCleanup) {
        audioCleanup();
      }
      audioCleanup = await startAudioCapture();
    },
    stopAudioCapture: () => {
      if (audioCleanup) {
        audioCleanup();
        audioCleanup = null;
      }
    },
    onAudioLevel: (callback: (level: number) => void) => {
      const handler = (_: IpcRendererEvent, { level }: { level: number }) => callback(level);
      ipcRenderer.on('audio-level', handler);
      return () => ipcRenderer.removeListener('audio-level', handler);
    },
    showContextMenu: () => ipcRenderer.send('show-context-menu')
  };

  try {
    // Expose the API to the renderer
    contextBridge.exposeInMainWorld('ellipsa', api);
    // Also expose as electron for backward compatibility if needed, or just use ellipsa
    contextBridge.exposeInMainWorld('electron', api);
    console.log('Electron API exposed successfully as ellipsa');
  } catch (error) {
    console.error('Failed to expose Electron API:', error);
  }
}
