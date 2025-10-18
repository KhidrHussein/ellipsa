import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, nativeTheme, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { startAudioCapture, stopAudioCapture } from './audio/capture';
import { screenCapture } from './capture/screenCapture';
import { initializeServices, memoryClient, processorClient } from './services/api';

// For resolving paths in the app
const appRoot = path.join(__dirname, '..');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let observeMode = false;
let debugMode = false; // Set to true for debugging, false for production
let isCapturing = false;

// Helper function to get the path to the assets directory
const getAssetsPath = (...paths: string[]): string => {
  // Go up one level from the app directory to reach the project root
  return path.join(process.cwd(), '..', '..', 'assets', ...paths);
};

// Get the path to the icon based on the theme
const getIconPath = (): string => {
  // Check if the system is in dark mode
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const iconName = isDarkMode ? 'icon-white.png' : 'icon-black.png';
  const iconPath = getAssetsPath(iconName);
  console.log(`Using ${isDarkMode ? 'dark' : 'light'} mode icon:`, iconPath);
  return iconPath;
};

function createWindow(): void {
  const size = debugMode ? 400 : 64;
  
  mainWindow = new BrowserWindow({
    width: size,
    height: size,
    frame: debugMode,
    resizable: debugMode,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      webgl: false,
      plugins: true
    }
  });

  // Handle preload script errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Preload ${level}] ${message} (${sourceId}:${line})`);
  });

  // Handle preload errors
  ipcMain.on('error-in-preload', (event, error) => {
    console.error('Error in preload script:', error);
    dialog.showErrorBox('Preload Script Error', String(error));
  });

  // Handle audio capture errors
  ipcMain.on('audio-capture-error', (event, error) => {
    console.error('Audio capture error:', error);
    dialog.showErrorBox('Audio Capture Error', String(error));
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(process.cwd(), 'index.html'));

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Open the DevTools in debug mode
  if (debugMode) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets/icon-black.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: observeMode ? 'Stop Observing' : 'Start Observing',
      click: toggleObserve
    },
    {
      label: debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode',
      click: toggleDebugMode
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Ellipsa Edge Agent');
}

function toggleDebugMode(): void {
  debugMode = !debugMode;
  if (mainWindow) {
    mainWindow.close();
    createWindow();
  }
  updateTrayMenu();
}

async function toggleObserve(): Promise<void> {
  if (observeMode) {
    // Stop observing
    try {
      if (mainWindow) {
        console.log('Stopping audio capture...');
        const success = await mainWindow.webContents.executeJavaScript('window.ellipsa.stopAudioCapture()');
        if (!success) {
          console.warn('Audio capture may not have stopped cleanly');
        }
      }
      observeMode = false;
      isCapturing = false;
      mainWindow?.webContents.send('observe-status', { 
        observing: false,
        error: null
      });
      console.log('Observation stopped');
    } catch (error) {
      console.error('Error stopping observation:', error);
      dialog.showErrorBox(
        'Stop Capture Error',
        `Failed to stop audio capture: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // Start observing
    try {
      console.log('Starting audio capture...');
      if (mainWindow) {
        // Ensure we have permissions
        const hasPermission = await mainWindow.webContents.executeJavaScript(`
          new Promise(resolve => {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then(stream => {
                // Stop all tracks to release the device
                stream.getTracks().forEach(track => track.stop());
                resolve(true);
              })
              .catch(err => {
                console.error('Permission check failed:', err);
                resolve(false);
              });
          });
        `);

        if (!hasPermission) {
          throw new Error('Microphone permission denied. Please check your system permissions.');
        }

        const success = await mainWindow.webContents.executeJavaScript('window.ellipsa.startAudioCapture()');
        if (!success) {
          throw new Error('Failed to start audio capture in renderer');
        }
      }
      
      observeMode = true;
      isCapturing = true;
      mainWindow?.webContents.send('observe-status', { 
        observing: true,
        error: null 
      });
      console.log('Observation started successfully');
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Send error to renderer
      mainWindow?.webContents.send('observe-status', { 
        observing: false,
        error: errorMessage
      });
      
      // Show error dialog
      dialog.showErrorBox(
        'Capture Error',
        `Failed to start audio capture: ${errorMessage}`
      );
      
      // Reset state
      observeMode = false;
      isCapturing = false;
      return;
    }
  }
  updateTrayMenu();
}

// Set up IPC handlers
ipcMain.handle('get-observe-status', async () => {
  return { observing: observeMode };
});

// Audio processing handler
ipcMain.handle('process-audio', async (event, audioData: ArrayBuffer) => {
  try {
    // Process the audio data (e.g., send to processor service)
    const result = await processorClient.processAudio(audioData, {
      timestamp: new Date().toISOString(),
      source: 'microphone'
    });
    
    // Store the processed result in memory
    if (result.event) {
      await memoryClient.storeEvent(result.event);
    }
    
    return { success: true, result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error processing audio:', error);
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('get-icon-path', async () => {
  try {
    const iconPath = getIconPath();
    console.log('Getting icon path:', iconPath);
    return iconPath;
  } catch (error) {
    console.error('Error getting icon path:', error);
    return '';
  }
});

ipcMain.handle('get-icon-data', async () => {
  try {
    const iconPath = getIconPath();
    console.log('Loading icon from path:', iconPath);
    
    // Read the file as a Buffer and convert to base64
    const data = await fs.promises.readFile(iconPath);
    return {
      base64: data.toString('base64'),
      mime: 'image/png' // Assuming the icon is a PNG file
    };
  } catch (error) {
    console.error('Error loading icon:', error);
    // Return null if the icon can't be loaded
    return null;
  }
});

ipcMain.handle('get-window-pos', async () => {
  if (!mainWindow) return { x: 0, y: 0 };
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

// Handle window movement
ipcMain.on('move-window', (event, data) => {
  try {
    if (!data || typeof data !== 'object') {
      console.error('Invalid data received in move-window handler:', data);
      return;
    }
    
    let { x, y } = data;
    
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      console.error('Invalid coordinates received in move-window handler:', { x, y });
      return;
    }
    
    // Ensure we're working with integers
    x = Math.round(x);
    y = Math.round(y);
    
    if (mainWindow) {
      // Get the screen dimensions
      const display = screen.getDisplayNearestPoint({ x, y });
      const { width, height } = display.workArea;
      
      // Ensure window stays within screen bounds
      const windowSize = mainWindow.getSize();
      x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + width - windowSize[0]));
      y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + height - windowSize[1]));
      
      // Only set position if it's different from current position
      const [currentX, currentY] = mainWindow.getPosition();
      if (currentX !== x || currentY !== y) {
        mainWindow.setPosition(x, y, false);
      }
    }
  } catch (error) {
    console.error('Error in move-window handler:', error);
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Initialize services
  const servicesReady = await initializeServices();
  if (!servicesReady) {
    dialog.showErrorBox(
      'Service Connection Error',
      'Failed to connect to one or more required services. Please ensure all services are running and try again.'
    );
    app.quit();
    return;
  }
  createWindow();
  createTray();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle IPC calls from the renderer process
ipcMain.handle('toggle-observation', async () => {
  await toggleObserve();
  return { observing: observeMode };
});

ipcMain.handle('toggle-debug', () => {
  toggleDebugMode();
  return { debug: debugMode };
});

// Handle screen capture request
ipcMain.handle('capture-screen', async () => {
  if (!mainWindow) return null;
  
  try {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 800, height: 600 } });
    
    if (sources && sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
    return null;
  } catch (error) {
    console.error('Failed to capture screen:', error);
    return null;
  }
});

// Handle app commands (for Windows)
app.on('browser-window-created', (_, window) => {
  // Handle media keys
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'd') {
      toggleDebugMode();
    }
  });
});

// Handle the app before it quits
app.on('before-quit', async (e) => {
  if (isCapturing) {
    e.preventDefault();
    await stopAudioCapture(mainWindow);
    app.quit();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
