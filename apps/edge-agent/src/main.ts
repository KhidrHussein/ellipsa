import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, nativeTheme, dialog, desktopCapturer } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { startAudioCapture, stopAudioCapture } from './audio/capture';
import { screenCapture } from './capture/screenCapture';
import { initializeServices, memoryClient, processorClient } from './services/api';
import { screenCaptureHandlers } from './ipc/screenCaptureHandlers';

// For resolving paths in the app
const appRoot = path.join(__dirname, '..');

let mainWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let isCapturing = false; // Track if we're currently capturing
let tray: Tray | null = null;
let observeMode = false;
let debugMode = false;
// isCapturing is now managed by screenCaptureHandlers
let windowPosition = { x: 0, y: 0 };

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
  
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  // Load saved window position or default to bottom-right
  const defaultX = screenWidth - size - 20;
  const defaultY = screenHeight - size - 60; // 60px from bottom
  
  windowPosition = {
    x: defaultX,
    y: defaultY
  };

  mainWindow = new BrowserWindow({
    width: size,
    height: size,
    x: windowPosition.x,
    y: windowPosition.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      webgl: false,
      plugins: true
    },
    show: false // Don't show until ready
  });

  // Load a blank page with the app's background color
  mainWindow.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            width: 100vw; 
            height: 100vh; 
            background: transparent;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <script>
          window.onload = () => {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('main-window-loaded');
          };
        </script>
      </body>
    </html>
  `);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
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
      label: 'Open Chat',
      click: () => toggleChatWindow()
    },
    { type: 'separator' },
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

async function toggleChatWindow() {
  if (chatWindow) {
    if (chatWindow.isDestroyed()) {
      chatWindow = null;
    } else {
      if (chatWindow.isVisible()) {
        chatWindow.hide();
      } else {
        chatWindow.show();
        chatWindow.focus();
      }
      return;
    }
  }

  const size = debugMode ? 800 : 350;
  const height = debugMode ? 600 : 500;
  
  // Get the current window position and display bounds
  const currentWindow = BrowserWindow.getFocusedWindow();
  const [currentX, currentY] = currentWindow ? currentWindow.getPosition() : [windowPosition.x, windowPosition.y];
  const display = screen.getDisplayNearestPoint({ x: currentX, y: currentY });
  const { workArea } = display;
  
  // Calculate position to ensure it's within the display bounds
  let x = currentX - size - 20;
  let y = currentY;
  
  // Ensure the window is not off-screen
  if (x < workArea.x) x = workArea.x + 10;
  if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height - 10;
  
  chatWindow = new BrowserWindow({
    width: size,
    height: height,
    x: x,
    y: y,
    frame: false,
    alwaysOnTop: true,
    resizable: debugMode,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      webSecurity: true
    },
    backgroundColor: '#2b2b2b',
    show: false
  });

  // Load the chat interface
  const chatHtmlPath = path.join(__dirname, '..', 'chat.html');
  console.log('Loading chat window from:', chatHtmlPath);
  
  chatWindow.loadFile(chatHtmlPath).catch(err => {
    console.error('Failed to load chat window:', err);
    dialog.showErrorBox('Error', 'Failed to load chat interface');
    chatWindow?.destroy();
    chatWindow = null;
  });

  chatWindow.once('ready-to-show', () => {
    chatWindow?.show();
  });

  chatWindow.on('closed', () => {
    chatWindow = null;
  });
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
        
        // Stop screen capture
        screenCapture.stopCapture();
      }
      observeMode = false;
      // isCapturing is managed by screenCaptureHandlers
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
      
      // Start screen capture with 5-second intervals
      if (mainWindow) {
        console.log('[Main] Starting screen capture...');
        const captureStarted = await screenCapture.startCapture(5000, mainWindow);
        console.log('[Main] Screen capture started:', captureStarted);
        
        // Test immediate capture
        console.log('[Main] Testing immediate capture...');
        try {
          const testCapture = await screenCapture.captureActiveWindow();
          console.log('[Main] Test capture result:', testCapture ? 'success' : 'failed');
          if (testCapture) {
            console.log('[Main] Screenshot saved to:', testCapture.filePath);
          }
        } catch (error) {
          console.error('[Main] Test capture failed:', error);
        }
      } else {
        console.error('[Main] Cannot start screen capture: mainWindow is null');
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
      // isCapturing is managed by screenCaptureHandlers
      return;
    }
  }
  updateTrayMenu();
}

// Set up IPC handlers
ipcMain.handle('get-observe-status', async () => {
  return { observing: observeMode };
});

// Chat window controls
ipcMain.on('toggle-chat', () => {
  toggleChatWindow();
});

ipcMain.on('close-chat', () => {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.hide();
  }
});

ipcMain.on('minimize-chat', () => {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.minimize();
  }
});

// Handle chat messages
ipcMain.on('send-message', async (event, message) => {
  try {
    // Process the message (in a real app, this would call your AI service)
    console.log('Message received:', message);
    
    // Simulate a response after a short delay
    setTimeout(() => {
      if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.webContents.send('message-received', 'I received your message: ' + message);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error processing message:', error);
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('message-received', 'Sorry, I encountered an error processing your message.');
    }
  }
});

// Quit application
ipcMain.on('quit-app', () => {
  app.quit();
});

// Handle window movement
ipcMain.on('move-window', (event, data, ...args) => {
  try {
    let x: number, y: number;
    
    // Handle both object and direct coordinate formats
    if (data && typeof data === 'object' && 'x' in data && 'y' in data) {
      x = data.x;
      y = data.y;
    } else if (Array.isArray(data) && data.length === 2) {
      x = data[0];
      y = data[1];
    } else if (args.length >= 2) {
      // Handle case where x, y are passed as separate arguments
      x = args[0];
      y = args[1];
    } else {
      console.error('Invalid data format for move-window:', data);
      return;
    }
    
    // Validate coordinates
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      console.error('Invalid coordinates received in move-window handler:', { x, y });
      return;
    }
    
    // Round coordinates to integers
    x = Math.round(x);
    y = Math.round(y);
    
    if (mainWindow) {
      // Get the screen dimensions
      const display = screen.getDisplayNearestPoint({ x, y });
      const { width, height } = display.workArea;
      
      // Get window size
      const [winWidth, winHeight] = mainWindow.getSize();
      
      // Ensure window stays within screen bounds
      x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + width - winWidth));
      y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + height - winHeight));
      
      // Only set position if it's different from current position
      const [currentX, currentY] = mainWindow.getPosition();
      if (currentX !== x || currentY !== y) {
        mainWindow.setPosition(x, y, false);
      }
      
      // Update window position
      windowPosition = { x, y };
    }
  } catch (error) {
    console.error('Error in move-window handler:', error);
  }
});

ipcMain.handle('get-window-pos', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    return { x, y };
  }
  return windowPosition;
});

ipcMain.on('toggle-chat', () => {
  toggleChatWindow();
});

ipcMain.on('close-chat', () => {
  if (chatWindow) {
    chatWindow.close();
    chatWindow = null;
  }
});

ipcMain.on('toggle-observe', () => {
  toggleObserve();
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Handle main window loaded event
  ipcMain.on('main-window-loaded', () => {
    if (mainWindow) {
      // Load the actual app content
      mainWindow.loadFile(path.join(process.cwd(), 'index.html'));
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
ipcMain.handle('start-screen-capture', async () => {
  try {
    if (mainWindow) {
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
      // Implementation for screen capture
      return { success: true, sources };
    }
    return { success: false, error: 'Main window not available' };
  } catch (error) {
    console.error('Screen capture error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});
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
app.on('before-quit', (e) => {
  if (observeMode) {
    e.preventDefault();
    // Stop any ongoing captures
    if (isCapturing) {
      screenCapture.stopCapture().catch(console.error);
      isCapturing = false;
    }
    stopAudioCapture(mainWindow);
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
