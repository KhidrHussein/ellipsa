import { desktopCapturer, BrowserWindow, nativeImage, app, DesktopCapturerSource } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createWorker, Worker } from 'tesseract.js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

// Remove global declaration as it's not needed

interface CaptureOptions {
  types?: ('screen' | 'window')[];
  thumbnailSize?: { width: number; height: number };
  fetchWindowIcons?: boolean;
}

export interface CaptureResult {
  id: string;
  filePath: string;
  windowTitle: string;
  appName: string;
  url?: string;
  textContent?: string;
  metadata: {
    timestamp: string;
    windowId: number | null;
    displayId: string;
    bounds: Electron.Rectangle;
    dpiScale: number;
  };
  processedAt?: string;
}

interface ApplicationContext {
  windowTitle: string;
  appName: string;
  url?: string;
  windowId: number | null;
  lastActive: Date;
}

export class ScreenCapture {
  private activeWindowId: number | null = null;
  private captureInterval: NodeJS.Timeout | null = null;
  private readonly capturePath: string;
  private isCapturing: boolean = false;
  private applicationContext: ApplicationContext | null = null;
  private worker: any = null; // Using any due to Tesseract.js type issues
  private readonly OCR_ENGINE = 'eng';
  private readonly MIN_CAPTURE_INTERVAL = 1000; // 1 second
  private lastCaptureTime: number = 0;

  constructor() {
    this.capturePath = join(app.getPath('userData'), 'screenshots');
    console.log('Screenshots will be saved to:', this.capturePath);
    this.initializeOCR();
  }

  private async initializeOCR() {
    try {
      console.log('Initializing Tesseract.js...');
      
      // Import Tesseract.js with proper typing
      const { createWorker, PSM } = await import('tesseract.js');
      
      // Create worker with English language
      this.worker = await createWorker('eng');
      
      // Set up logging
      // @ts-ignore - Tesseract.js worker has a logger property in runtime
      if (this.worker.logger) {
        // @ts-ignore
        this.worker.logger = (m: { status: string }) => console.log(`Tesseract: ${m.status}`);
      }
      
      // Set error handler
      // @ts-ignore - Tesseract.js worker has an errorHandler property in runtime
      this.worker.errorHandler = (err: Error) => console.error('Tesseract error:', err);
      
      // Set page segmentation mode
      console.log('Setting OCR parameters...');
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
      });
      
      console.log('Tesseract.js worker initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Tesseract.js:', error);
      return false;
    }
  }

  /**
   * Start periodic screen capture
   * @param interval Capture interval in milliseconds
   * @param mainWindow Optional window reference for IPC communication
   */
  public async startCapture(interval: number = 5000, mainWindow?: BrowserWindow): Promise<boolean> {
    console.log(`[ScreenCapture] Starting screen capture with interval: ${interval}ms`);
    
    if (this.isCapturing) {
      console.warn('[ScreenCapture] Screen capture is already running');
      return false;
    }
    
    if (!mainWindow) {
      console.error('[ScreenCapture] No mainWindow provided, cannot start capture');
      return false;
    }
    
    console.log('[ScreenCapture] Initializing first capture...');
    this.isCapturing = true;
    
    // Clear any existing interval
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    
    // Do an immediate capture first
    try {
      const result = await this.captureActiveWindow();
      console.log('[ScreenCapture] First capture result:', result ? 'success' : 'failed');
    } catch (error) {
      console.error('[ScreenCapture] Error during first capture:', error);
    }

    this.captureInterval = setInterval(async () => {
      if (!this.isCapturing) return;
      try {
        const result = await this.captureActiveWindow();
        if (result && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('screenshot-captured', result);
        }
      } catch (error) {
        console.error('Error in capture interval:', error);
      }
    }, interval);

    return true;
  }

  private async getSources(options: Electron.SourcesOptions): Promise<Electron.DesktopCapturerSource[]> {
    try {
      console.log('[ScreenCapture] Getting desktop sources with options:', {
        ...options,
        // Don't log the actual thumbnail size as it's not relevant and makes logs noisy
        thumbnailSize: options.thumbnailSize ? 'specified' : 'not specified'
      });
      
      // Set default options
      const defaultOptions = {
        types: ['window'],
        thumbnailSize: options.thumbnailSize || { width: 0, height: 0 },
        fetchWindowIcons: options.fetchWindowIcons || false
      };

      const sources = await desktopCapturer.getSources({
        types: defaultOptions.types as ('screen' | 'window')[],
        thumbnailSize: defaultOptions.thumbnailSize,
        fetchWindowIcons: defaultOptions.fetchWindowIcons
      });
      
      console.log(`[ScreenCapture] Desktop capturer returned ${sources.length} sources`);
      if (sources.length > 0) {
        console.log('[ScreenCapture] First source details:', {
          id: sources[0].id,
          name: sources[0].name,
          displayId: sources[0].display_id,
          appIcon: sources[0].appIcon ? 'available' : 'not available',
          thumbnail: sources[0].thumbnail ? 'available' : 'not available'
        });
        // Note: The 'types' property is not available in the TypeScript definition
        // but may be available at runtime. We'll log what we can.
        console.log('[ScreenCapture] Source details:', sources.map((source, i) => ({
          index: i,
          id: source.id,
          name: source.name,
          displayId: source.display_id,
          hasThumbnail: !!source.thumbnail,
          hasAppIcon: 'appIcon' in source ? !!source.appIcon : 'n/a'
        })));
      }
      
      return sources;
    } catch (error) {
      console.error('[ScreenCapture] Error getting desktop sources:', error);
      return [];
    }
  }

  public async captureActiveWindow(): Promise<CaptureResult | null> {
    console.log('[ScreenCapture] Attempting to capture screen...');
    
    // Ensure OCR is initialized
    if (!this.worker) {
      console.warn('[ScreenCapture] OCR worker not initialized, retrying...');
      const initialized = await this.initializeOCR();
      if (!initialized) {
        console.error('[ScreenCapture] OCR initialization failed, skipping capture');
        return null;
      }
    }
    
    // Ensure directory exists
    try {
      await mkdir(this.capturePath, { recursive: true });
      console.log(`[ScreenCapture] Screenshot directory: ${this.capturePath}`);
    } catch (error) {
      console.error(`[ScreenCapture] Failed to create screenshot directory:`, error);
      return null;
    }
    
    try {
      // Get all screens
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      
      if (displays.length === 0) {
        console.error('[ScreenCapture] No displays found');
        return null;
      }
      
      // Use the primary display by default
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height, x, y } = primaryDisplay.bounds;
      
      console.log(`[ScreenCapture] Primary display: ${width}x${height} at (${x},${y})`);
      
      // Get all windows that we might want to capture
      const windows = BrowserWindow.getAllWindows();
      console.log(`[ScreenCapture] Found ${windows.length} windows`);
      
      // Find the active window (not our own window)
      const activeWindow = BrowserWindow.getFocusedWindow();
      let targetWindow = activeWindow;
      
      // If the active window is our app's window, try to find another window
      if (activeWindow && activeWindow.id === BrowserWindow.getFocusedWindow()?.id) {
        targetWindow = windows.find(w => w.id !== activeWindow.id) || null;
      }
      
      // If we found a target window, capture that, otherwise capture the whole screen
      let captureBounds = targetWindow 
        ? targetWindow.getBounds() 
        : { x, y, width, height };
      
      console.log(`[ScreenCapture] Capturing: ${
        targetWindow 
          ? `window "${targetWindow.getTitle()}" (${captureBounds.width}x${captureBounds.height})`
          : `full screen (${captureBounds.width}x${captureBounds.height})`
      }`);
      
      // Capture the screen or window
      const sources = await desktopCapturer.getSources({
        types: targetWindow ? ['window'] : ['screen'],
        thumbnailSize: {
          width: captureBounds.width * primaryDisplay.scaleFactor,
          height: captureBounds.height * primaryDisplay.scaleFactor
        },
        fetchWindowIcons: true
      });
      
      // Find the source that matches our target
      let source = sources[0]; // Default to first source
      
      if (targetWindow) {
        // Try to find the specific window
        const sourceId = targetWindow.getNativeWindowHandle()?.readUInt32LE(0);
        source = sources.find(s => 
          s.id === `window:${sourceId}` || 
          s.name === targetWindow.getTitle()
        ) || source;
      }
      
      if (!source || !source.thumbnail) {
        console.error('[ScreenCapture] Could not capture screen or window');
        return null;
      }
      
      // Save the image
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `capture_${timestamp}.png`;
      const filePath = join(this.capturePath, filename);
      
      console.log(`[ScreenCapture] Saving screenshot to: ${filePath}`);
      await writeFile(filePath, source.thumbnail.toPNG());
      
      // Extract text using OCR
      let textContent = '';
      if (this.worker) {
        try {
          console.log('[ScreenCapture] Running OCR on screenshot...');
          const { data } = await this.worker.recognize(filePath);
          textContent = data.text;
          console.log('[ScreenCapture] OCR completed successfully');
        } catch (error) {
          console.error('Error during OCR:', error);
        }
      }
      
      const result: CaptureResult = {
        id: uuidv4(),
        filePath,
        windowTitle: targetWindow ? targetWindow.getTitle() : 'Full Screen',
        appName: targetWindow ? targetWindow.getTitle().split(' - ').pop() || 'Unknown App' : 'Screen',
        textContent,
        metadata: {
          timestamp: new Date().toISOString(),
          windowId: targetWindow?.id || 0,
          displayId: 'primary',
          bounds: captureBounds,
          dpiScale: primaryDisplay.scaleFactor
        },
        processedAt: new Date().toISOString()
      };
      
      console.log(`[ScreenCapture] Successfully captured ${targetWindow ? 'window' : 'screen'}`);
      return result;
    } catch (error) {
      console.error('Error capturing active window:', error);
      return null;
    }
  }

  public getCurrentContext(): ApplicationContext | null {
    return this.applicationContext;
  }

  public async stopCapture(): Promise<void> {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    
    this.isCapturing = false;
    
    // Clean up OCR worker
    if (this.worker) {
      try {
        // @ts-ignore - Tesseract.js types are incomplete
        await this.worker.terminate();
        this.worker = null;
      } catch (error) {
        console.error('Error terminating Tesseract.js worker:', error);
      }
    }
  }
}

// Export a singleton instance
export const screenCapture = new ScreenCapture();
