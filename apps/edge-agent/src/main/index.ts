import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { realtimeService } from '../services/RealtimeService';
import { exec } from 'child_process';
import axios from 'axios';

export class MainProcess {
  private mainWindow: BrowserWindow | null = null;
  private isDevelopment = process.env.NODE_ENV === 'development';

  public async start() {
    try {
      await app.whenReady();
      this.initializeIpcHandlers();
      await this.createWindow();
      this.setupAppEventListeners();

      // Start window monitor
      this.startWindowMonitor();

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

  private lastWindowTitle = '';
  private monitorInterval: NodeJS.Timeout | null = null;
  private processorUrl = 'http://localhost:4002/processor/v1/ingest';

  private startWindowMonitor() {
    console.log('[Main] Starting window monitor...');

    // Poll every 5 seconds
    this.monitorInterval = setInterval(() => {
      console.log('[Main] Running monitor check...');
      this.checkActiveWindow();
    }, 5000);
  }

  private checkActiveWindow() {
    // PowerShell command to get active window title
    const psCommand = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class WindowHelper {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          
          public static string GetActiveWindowTitle() {
            IntPtr handle = GetForegroundWindow();
            StringBuilder title = new StringBuilder(256);
            GetWindowText(handle, title, 256);
            return title.ToString();
          }
        }
"@
      [WindowHelper]::GetActiveWindowTitle()
    `;

    exec(`powershell.exe -Command "${psCommand.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('[Main] Window monitor exec error:', error);
        console.error('[Main] Window monitor stderr:', stderr);
        return;
      }
      // console.log('[Main] Raw active window stdout:', stdout);

      const currentTitle = stdout.trim();

      // Only send if title changed and is not empty
      if (currentTitle && currentTitle !== this.lastWindowTitle) {
        console.log(`[Main] Active window changed: "${this.lastWindowTitle}" -> "${currentTitle}"`);
        this.lastWindowTitle = currentTitle;
        this.sendWindowIngest(currentTitle);
      }
    });
  }

  private async sendWindowIngest(windowTitle: string) {
    try {
      await axios.post(this.processorUrl, {
        id: `ingest_${Date.now()}`,
        type: 'window',
        content: windowTitle,
        timestamp: new Date().toISOString(),
        active_window: windowTitle,
        segment_ts: Date.now(),
        meta: {
          source: 'edge-agent-monitor'
        }
      });
    } catch (error) {
      console.error('[Main] Failed to send window ingest:', error instanceof Error ? error.message : String(error));
    }
  }
}

// Start the application
const mainProcess = new MainProcess();
mainProcess.start().catch(console.error);
