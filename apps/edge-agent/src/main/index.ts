import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { realtimeService } from '../services/RealtimeService';

export class MainProcess {
  private mainWindow: BrowserWindow | null = null;
  private isDevelopment = process.env.NODE_ENV === 'development';

  public async start() {
    try {
      await app.whenReady();
      this.initializeIpcHandlers();
      await this.createWindow();
      this.setupAppEventListeners();
      
      // Start the realtime service
      realtimeService.connect();
      
      console.log('Ellipsa Edge Agent started');
    } catch (error) {
      console.error('Failed to start application:', error);
      app.quit();
    }
  }

  private async createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        nodeIntegrationInWorker: true,
        nodeIntegrationInSubFrames: true,
        webSecurity: !this.isDevelopment,
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      },
      show: false
    });

    // Load the app
    if (this.isDevelopment) {
      await this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
      }
    });
  }

  private initializeIpcHandlers() {
    // Handle window movement
    ipcMain.on('move-window', (_, { x, y }) => {
      if (this.mainWindow) {
        this.mainWindow.setPosition(x, y);
      }
    });

    // Handle observe mode toggle
    ipcMain.handle('toggle-observe', async () => {
      try {
        // Add your observe mode logic here
        return { success: true };
      } catch (error) {
        console.error('Error toggling observe mode:', error);
        return { success: false, error: String(error) };
      }
    });

    // Handle realtime service status
    ipcMain.handle('get-realtime-status', () => {
      return {
        isConnected: realtimeService.getConnectionStatus(),
        lastError: null
      };
    });
  }

  private setupAppEventListeners() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    app.on('will-quit', () => {
      // Clean up resources
      realtimeService.disconnect();
    });
  }
}

// Start the application
const mainProcess = new MainProcess();
mainProcess.start().catch(console.error);
