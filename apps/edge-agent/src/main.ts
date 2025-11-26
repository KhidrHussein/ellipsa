import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, nativeTheme, dialog, desktopCapturer } from 'electron';
import type { Display } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { realtimeService } from './services/RealtimeService';
import { EventService } from './services/EventService';
import { ScreenCapture } from './capture/screenCapture';
import { processorClient } from './services/ProcessorClient.js';
import { memoryClient } from './services/MemoryClient.js';
import { initializeLLMService } from './services/LLMService';
import { setupLLMHandlers } from './services/llmHandlers';

// Initialize screen capture
const screenCapture = new ScreenCapture();

// Main process class
export class MainProcess {
  async start() {
    console.log('Main process started');

    // Create the main window
    createWindow();

    // Create system tray
    createTray();

    // Initialize services
    try {
      // Initialize your services here
      console.log('Services initialized');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      throw error;
    }
  }
}

// Initialize the main process
const mainProcess = new MainProcess();

// Start the app
app.whenReady().then(() => {
  // Initialize screen-related functionality after app is ready
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    console.log('Primary display:', primaryDisplay.id, primaryDisplay.size);
  } catch (error) {
    console.error('Error initializing screen:', error);
  }

  return mainProcess.start();
}).catch(error => {
  console.error('Failed to start application:', error);
  app.quit();
});

// For resolving paths in the app
const appRoot = path.join(__dirname, '..');

// Application state
let mainWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let observeMode = false;
let debugMode = false;
let windowPosition = { x: 0, y: 0 };

// Services
let eventService: EventService | null = null;

// Audio capture state
let audioCaptureCleanup: (() => void) | null = null;

// Handle audio level updates from renderer
ipcMain.on('audio-level-update', (_, { level }) => {
  // Forward to all windows that might be interested
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('audio-level', { level });
    }
  });
});

// Start audio capture in the renderer
ipcMain.handle('start-audio-capture', async (event) => {
  try {
    // Clean up any existing capture
    if (audioCaptureCleanup) {
      audioCaptureCleanup();
      audioCaptureCleanup = null;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window not available');
    }

    // The actual capture happens in the renderer, we just handle the IPC
    return { success: true };
  } catch (error) {
    console.error('Error in start-audio-capture:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Stop audio capture
ipcMain.handle('stop-audio-capture', () => {
  try {
    // Clean up any existing capture
    if (audioCaptureCleanup) {
      audioCaptureCleanup();
      audioCaptureCleanup = null;
    }
    return { success: true };
  } catch (error) {
    console.error('Error in stop-audio-capture:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Handle audio processing from renderer
ipcMain.handle('process-audio', async (event, { audioData, timestamp, size, sampleRate }) => {
  try {
    if (!eventService) {
      // Initialize event service if not already done
      eventService = new EventService({
        wsUrl: 'ws://localhost:4001',
        onError: (error) => console.error('EventService error:', error)
      });
    }

    // Send to backend
    await eventService.captureEvent({
      type: 'process_audio',
      source: 'audio',
      data: {
        content: audioData, // Base64 encoded audio
        metadata: {
          timestamp: new Date(timestamp).toISOString(),
          size,
          sampleRate,
          format: 'webm/opus'
        }
      }
    });

    return true;
  } catch (error) {
    console.error('Error processing audio in main process:', error);
    return false;
  }
});

// Clean up on app quit
app.on('will-quit', () => {
  if (audioCaptureCleanup) {
    audioCaptureCleanup();
    audioCaptureCleanup = null;
  }
});

// Helper function to get the path to the assets directory
const getAssetsPath = (...paths: string[]): string => {
  // Go up one level from the app directory to reach the project root
  return path.join(process.cwd(), '..', '..', 'assets', ...paths);
};

// Get the path to the icon based on the theme
const getIconPath = (): string => {
  try {
    // Check if the system is in dark mode
    const isDarkMode = nativeTheme.shouldUseDarkColors;
    const iconName = isDarkMode ? 'icon-white.png' : 'icon-black.png';
    const iconPath = getAssetsPath(iconName);

    // Only log the icon name, not the full path which might contain system paths
    console.log(`Using ${isDarkMode ? 'dark' : 'light'} mode icon`);

    return iconPath;
  } catch (error) {
    console.error('Error getting icon path:', error.message);
    return '';
  }
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
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      webviewTag: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      allowRunningInsecureContent: false,
      webgl: false,
      plugins: false,
      backgroundThrottling: false,
      experimentalFeatures: false,
      sandbox: true
    },
    show: false // Don't show until ready
  });

  // Set up CSP for the main window
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: file:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' ws://localhost:* http://localhost:*",
      "media-src 'self' blob:"
    ].join('; ');

    const responseHeaders = {
      ...details.responseHeaders,
      'Content-Security-Policy': csp
    };

    callback({ responseHeaders });
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
  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  // Initialize FloatingAssistant when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Window loaded, waiting for renderer to initialize...');
  });

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
      nodeIntegration: true, // Match main window settings
      contextIsolation: false, // Required when nodeIntegration is true
      preload: path.join(__dirname, 'preload.js'), // Fix path to preload script
      webSecurity: true,
      webviewTag: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      allowRunningInsecureContent: false,
      webgl: false,
      plugins: true,
      backgroundThrottling: false,
      disableBlinkFeatures: 'OutOfBlinkCors',
      experimentalFeatures: false
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
        try {
          await mainWindow.webContents.executeJavaScript('window.ellipsa.stopAudioCapture()');
        } catch (error) {
          console.warn('Error stopping audio capture in renderer:', error);
        }

        // The actual screen capture stop logic is handled in the ScreenCapture class
        screenCapture.stopCapture();
      }
      observeMode = false;
      // Notify renderer about the status change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('observe-status', {
          observing: false,
          error: null
        });
      }
      console.log('Observation stopped');
    } catch (error) {
      console.error('Error stopping observation:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('observe-status', {
          observing: false,
          error: error instanceof Error ? error.message : 'Failed to stop observation'
        });
      }
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
        // Check microphone permission
        try {
          const hasPermission = await mainWindow.webContents.executeJavaScript(`
            new Promise((resolve) => {
              navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                  // Stop all tracks to release the device
                  stream.getTracks().forEach(track => track.stop());
                  resolve(true);
                })
                .catch(err => {
                  console.error('Microphone permission check failed:', err);
                  resolve(false);
                });
            })
          `);

          if (!hasPermission) {
            throw new Error('Microphone permission denied. Please check your system permissions.');
          }
        } catch (error) {
          console.error('Error checking microphone permission:', error);
          throw error;
        }

        // Test screen capture capabilities
        try {
          const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
          if (!sources || sources.length === 0) {
            throw new Error('No screen capture sources available');
          }
          console.log('[Main] Screen capture test successful');
        } catch (error) {
          console.error('[Main] Screen capture test failed with error:', error);
          throw error;
        }

        // Start audio capture in the renderer
        try {
          await mainWindow.webContents.executeJavaScript('window.ellipsa.startAudioCapture()');
          console.log('[Main] Audio capture started in renderer');
        } catch (error) {
          console.error('[Main] Error starting audio capture in renderer:', error);
          throw error;
        }

        // Start screen capture
        try {
          // The actual capture logic is handled in the ScreenCapture class
          const started = await screenCapture.startCapture(5000, mainWindow);
          if (!started) {
            throw new Error('Failed to start screen capture service');
          }
          console.log('[Main] Screen capture started successfully');
        } catch (error) {
          console.error('[Main] Failed to start screen capture:', error);
          // Try to stop audio capture if screen capture fails
          try {
            await mainWindow.webContents.executeJavaScript('window.ellipsa.stopAudioCapture()');
          } catch (e) {
            console.error('[Main] Error stopping audio capture after screen capture failure:', e);
          }
          throw error;
        }
      }
      observeMode = true;
      // Notify renderer about the status change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('observe-status', {
          observing: true,
          error: null
        });
      }
      console.log('Observation started successfully');
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Send error to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('observe-status', {
          observing: false,
          error: errorMessage
        });
      }
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

// Screen size handler
ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.workAreaSize.width,
    height: primaryDisplay.workAreaSize.height,
    x: primaryDisplay.workArea.x,
    y: primaryDisplay.workArea.y
  };
});


ipcMain.on('move-window', (event, { x, y }) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Ensure we have valid numbers
    const posX = typeof x === 'number' ? Math.round(x) : windowPosition.x;
    const posY = typeof y === 'number' ? Math.round(y) : windowPosition.y;

    // Get the display that will contain the window
    const { screen } = require('electron');
    const display = screen.getDisplayNearestPoint({ x: posX, y: posY });
    const { workArea } = display;

    // Keep window within screen bounds
    const [windowWidth, windowHeight] = mainWindow.getSize();
    const boundedX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - windowWidth, posX));
    const boundedY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - windowHeight, posY));

    // Only update if position changed
    if (boundedX !== windowPosition.x || boundedY !== windowPosition.y) {
      windowPosition = { x: boundedX, y: boundedY };
      mainWindow.setPosition(boundedX, boundedY);
    }
  } catch (error) {
    console.error('Error moving window:', error);
  }
});

ipcMain.on('set-window-pos', (_, pos: { x: number, y: number }) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Ensure we have valid numbers
      const posX = typeof pos.x === 'number' ? Math.round(pos.x) : windowPosition.x;
      const posY = typeof pos.y === 'number' ? Math.round(pos.y) : windowPosition.y;

      // Get the display that will contain the window
      const { screen } = require('electron');
      const display = screen.getDisplayNearestPoint({ x: posX, y: posY });
      const { workArea } = display;

      // Keep window within screen bounds
      const [windowWidth, windowHeight] = mainWindow.getSize();
      const boundedX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - windowWidth, posX));
      const boundedY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - windowHeight, posY));

      windowPosition = { x: boundedX, y: boundedY };
      mainWindow.setPosition(boundedX, boundedY);
    }
  } catch (error) {
    console.error('Error setting window position:', error);
  }
});

ipcMain.on('set-window-size', (_, { width, height }) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const w = Math.round(width);
      const h = Math.round(height);
      mainWindow.setSize(w, h);
    }
  } catch (error) {
    console.error('Error setting window size:', error);
  }
});

// Set up IPC handlers for observe status
ipcMain.handle('get-observe-status', async () => {
  return { observing: observeMode };
});

// Handle icon data requests
ipcMain.handle('get-icon-data', async (event, iconName: string) => {
  try {
    const iconPath = getIconPath();
    if (!iconPath) {
      console.error('No icon path available');
      return null;
    }

    const data = await fs.promises.readFile(iconPath, 'base64');
    return `data:image/png;base64,${data}`;
  } catch (error) {
    console.error('Error loading icon file:', error.message);
    return null;
  }
});

// Handle icon path requests
ipcMain.handle('get-icon-path', async () => {
  return getIconPath();
});

ipcMain.handle('set-observe-status', async (_, observing: boolean) => {
  if (observing === observeMode) {
    return { success: true };
  }

  try {
    await toggleObserve();
    return { success: true };
  } catch (error) {
    console.error('Error setting observe status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Chat window controls
ipcMain.on('toggle-chat', () => {
  toggleChatWindow();
});

ipcMain.on('show-context-menu', (event) => {
  const template = [
    {
      label: observeMode ? 'Stop Observing' : 'Start Observing',
      click: () => {
        toggleObserve();
      }
    },
    {
      label: 'Open Chat',
      click: () => {
        toggleChatWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ] as Electron.MenuItemConstructorOptions[];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
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
ipcMain.on('move-window', (event, data) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    let x: number, y: number;

    // Handle both object and direct coordinate formats
    if (data && typeof data === 'object' && 'x' in data && 'y' in data) {
      x = Number(data.x);
      y = Number(data.y);
    } else {
      console.error('Invalid data format for move-window:', data);
      return;
    }

    // Validate coordinates
    if (isNaN(x) || isNaN(y)) {
      console.error('Invalid coordinates received in move-window handler:', { x, y });
      return;
    }

    // Round coordinates to integers
    x = Math.round(x);
    y = Math.round(y);

    // Get the screen dimensions
    const display = getDisplayAt({ x, y });
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

  } catch (error) {
    console.error('Error in move-window handler:', error);
  }
});

// Handle get-window-pos
ipcMain.handle('get-window-pos', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { x: 0, y: 0 };
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

// Handle set-window-pos
ipcMain.on('set-window-pos', (_, { x, y }: { x: number; y: number }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setPosition(Math.round(x), Math.round(y));
});

// Function to get display at point
function getDisplayAt(point: { x: number; y: number }): Display {
  return screen.getDisplayMatching({
    x: Math.round(point.x),
    y: Math.round(point.y),
    width: 1,
    height: 1
  });
}

// ... (rest of the code remains the same)

// Handle app shutdown
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app cleanup when quitting
app.on('will-quit', async () => {
  try {
    // Stop audio capture if window exists
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.executeJavaScript('window.ellipsa.stopAudioCapture()');
      } catch (error) {
        console.error('Error stopping audio capture on app quit:', error);
      }
    }

    // Clean up services
    if (eventService) {
      // The WebSocketClient used by EventService will handle cleanup
      eventService = null;
    }
  } catch (error) {
    console.error('Error during app cleanup:', error);
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
