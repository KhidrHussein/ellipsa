const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { startAudioCapture, stopAudioCapture } = require('./src/audio/capture');
const { screenCapture } = require('./src/capture/screenCapture');

let mainWindow;
let tray;
let observeMode = false;
let debugMode = false; // Set to true for debugging, false for production
let isCapturing = false;

function createWindow() {
  const size = debugMode ? 400 : 64;
  
  mainWindow = new BrowserWindow({
    width: size,
    height: size,
    frame: debugMode,
    resizable: debugMode,
    transparent: !debugMode,
    alwaysOnTop: true,
    skipTaskbar: !debugMode,
    useContentSize: true,
    backgroundColor: debugMode ? '#ffffff' : '#00000000',
    movable: true,
    acceptFirstMouse: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Ensure the window can receive mouse events
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open DevTools in debug mode
  if (debugMode) {
    mainWindow.webContents.openDevTools();
  }
  
  // Log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[edge-agent] Page loaded successfully');
  });
  
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message}`);
  });

  // position bottom-right with margin
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  const x = Math.max(0, width - size - 16);
  const y = Math.max(0, height - size - 16);
  mainWindow.setPosition(x, y);
  
  console.log('[edge-agent] Window created. Debug mode:', debugMode);
  console.log('[edge-agent] Window position:', x, y);
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  updateTrayMenu();
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: observeMode ? 'Stop Observing' : 'Start Observing', 
      click: () => toggleObserve(),
      type: 'checkbox',
      checked: observeMode
    },
    { 
      label: 'Debug Mode', 
      click: () => toggleDebugMode(),
      type: 'checkbox',
      checked: debugMode
    },
    { 
      label: 'Show DevTools', 
      click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }) 
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]);
  
  tray.setToolTip('ellipsa - ' + (observeMode ? 'Observing' : 'Idle'));
  tray.setContextMenu(contextMenu);
}

function toggleDebugMode() {
  debugMode = !debugMode;
  console.log('[edge-agent] Debug mode toggled:', debugMode);
  if (mainWindow) {
    mainWindow.close();
  }
  createWindow();
}

async function toggleObserve() {
  observeMode = !observeMode;
  
  if (observeMode) {
    try {
      // Start both audio and screen capture
      const [audioStarted, screenCaptureStarted] = await Promise.all([
        startAudioCapture(mainWindow),
        screenCapture.startCapture(5000, mainWindow) // Capture every 5 seconds
      ]);
      
      if (!audioStarted || !screenCaptureStarted) {
        console.error('Failed to start audio or screen capture');
        observeMode = false;
        stopAudioCapture(mainWindow);
        screenCapture.stopCapture();
      } else {
        isCapturing = true;
      }
    } catch (error) {
      console.error('Error starting capture:', error);
      observeMode = false;
      stopAudioCapture(mainWindow);
      screenCapture.stopCapture();
    }
  } else {
    // Stop both audio and screen capture
    stopAudioCapture(mainWindow);
    screenCapture.stopCapture();
    isCapturing = false;
  }
  
  // Update tray icon and menu
  updateTrayMenu();
  return { success: true, timestamp: new Date().toISOString() };
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  ipcMain.handle('get-observe-status', () => ({
    observing: observeMode,
    debug: debugMode,
    timestamp: new Date().toISOString()
  }));
  
  ipcMain.on('toggle-observe', () => toggleObserve());
  
  // Update tray menu when observe status changes
  ipcMain.on('observe-status', (_, status) => {
    observeMode = status.observing;
    updateTrayMenu();
  });
  ipcMain.on('move-window', (_e, { x, y }) => {
    if (!mainWindow) return;
    const { workAreaSize } = screen.getPrimaryDisplay();
    const W = 64, H = 64, M = 0; // window size and margin
    const nx = Math.max(M, Math.min(x, workAreaSize.width - W - M));
    const ny = Math.max(M, Math.min(y, workAreaSize.height - H - M));
    mainWindow.setPosition(Math.round(nx), Math.round(ny));
  });
  ipcMain.handle('get-window-pos', () => {
    if (!mainWindow) return { x: 0, y: 0 };
    const [x, y] = mainWindow.getPosition();
    return { x, y };
  });
  ipcMain.handle('get-icon-data', () => {
    console.log('[edge-agent] get-icon-data called');
    // base64 data URL payload for PNG icon
    try {
      // Try multiple paths to find the icon
      const possiblePaths = [
        path.join('C:', 'Users', 'Hp', 'ellipsa', 'assets', 'icon-white.png'), // Absolute path using path.join
        'C:\\Users\\Hp\\ellipsa\\assets\\icon-white.png', // Absolute path with backslashes
        path.resolve(__dirname, '../../assets/icon-white.png'),
        path.resolve(__dirname, '../../../assets/icon-white.png'),
        path.join(process.cwd(), 'assets', 'icon-white.png'),
        path.join(__dirname, 'assets', 'icon-white.png'),
        path.join(app.getAppPath(), 'assets', 'icon-white.png')
      ];
      
      console.log('[edge-agent] __dirname:', __dirname);
      console.log('[edge-agent] process.cwd():', process.cwd());
      console.log('[edge-agent] app.getAppPath():', app.getAppPath());
      console.log('[edge-agent] Trying paths:');
      
      let p = null;
      for (const testPath of possiblePaths) {
        const exists = fs.existsSync(testPath);
        console.log(`  ${exists ? '✓' : '✗'} ${testPath}`);
        if (exists && !p) {
          p = testPath;
        }
      }
      
      if (!p) {
        console.error('[edge-agent] ✗ Icon not found in any path');
        return { mime: 'image/png', base64: '' };
      }
      
      console.log('[edge-agent] ✓ Using icon at:', p);
      const b64 = fs.readFileSync(p).toString('base64');
      console.log('[edge-agent] Icon loaded, base64 length:', b64.length);
      return { mime: 'image/png', base64: b64 };
    } catch (e) {
      console.error('[edge-agent] get-icon-data error:', e);
      return { mime: 'image/png', base64: '' };
    }
  });
  ipcMain.handle('get-icon-path', () => {
    // Try multiple paths to find the icon
    const possiblePaths = [
      'C:\\Users\\Hp\\ellipsa\\assets\\icon-white.png', // Absolute path
      path.resolve(__dirname, '../../assets/icon-white.png'),
      path.resolve(__dirname, '../../../assets/icon-white.png'),
      path.join(process.cwd(), 'assets', 'icon-white.png')
    ];
    
    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        console.log('[edge-agent] icon path resolved to:', iconPath);
        return iconPath;
      }
    }
    
    console.error('[edge-agent] icon path not found');
    return null;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // keep app running in tray
});