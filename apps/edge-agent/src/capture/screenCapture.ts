import { desktopCapturer, BrowserWindow, nativeImage, app, DesktopCapturerSource } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createWorker, Worker } from 'tesseract.js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { EventService } from '../services/EventService';
import { LLMService } from '../services/LLMService';

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
  private _applicationContext: ApplicationContext | null = null;

  public get applicationContext(): ApplicationContext | null {
    return this._applicationContext;
  }

  private worker: any = null; // Using any due to Tesseract.js type issues
  private readonly OCR_ENGINE = 'eng';
  private readonly MIN_CAPTURE_INTERVAL = 1000; // 1 second
  private lastCaptureTime: number = 0;
  private eventService: EventService;
  private llmService: typeof LLMService;
  private onScreenshot?: (result: CaptureResult) => void;

  constructor() {
    this.capturePath = join(app.getPath('userData'), 'screenshots');
    console.log('Screenshots will be saved to:', this.capturePath);

    // Initialize services
    this.eventService = new EventService({
      wsUrl: 'ws://localhost:4001',
      onEventProcessed: (event) => {
        console.log('Screen capture event processed:', event);
      },
      onError: (error) => {
        console.error('Screen capture event error:', error);
      }
    });

    this.llmService = LLMService;
    this.initializeOCR();
  }

  /**
   * Extract text from a base64-encoded image using Tesseract.js
   * @param base64Image Base64-encoded image data
   * @returns Extracted text content
   */
  private async extractText(base64Image: string): Promise<string> {
    if (!this.worker) {
      console.warn('Tesseract worker not initialized');
      return '';
    }

    try {
      // console.log('Starting OCR processing...');

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(base64Image, 'base64');

      // Use Tesseract to recognize text
      const { data: { text } } = await this.worker.recognize(imageBuffer);

      // console.log('OCR completed successfully');
      return text.trim();
    } catch (error) {
      console.error('Error during OCR processing:', error);
      return '';
    }
  }

  /**
   * Update the application context with the latest window and text information
   * @param metadata Window metadata
   * @param textContent Extracted text content
   */
  private updateApplicationContext(
    metadata: {
      windowTitle: string;
      appName: string;
      url?: string;
      windowId: number | null;
    },
    textContent: string
  ): void {
    this._applicationContext = {
      windowTitle: metadata.windowTitle,
      appName: metadata.appName,
      url: metadata.url,
      windowId: metadata.windowId,
      lastActive: new Date()
    };

    // console.log('Updated application context:', {
    //   ...this._applicationContext,
    //   textPreview: textContent.substring(0, 50) + '...'
    // });
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

  /**
   * Get available desktop sources (windows/screens) for screen capture
   * @param options Options for source capture
   * @returns Array of desktop capturer sources
   */
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
        types: (defaultOptions.types || ['window']) as ('screen' | 'window')[],
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

        // Log all sources for debugging
        console.log('[ScreenCapture] All sources:', sources.map((source, i) => ({
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

  /**
   * Stop the screen capture process
   * @returns boolean indicating if the capture was successfully stopped
   */
  public stopCapture(): boolean {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
      this.isCapturing = false;
      console.log('[ScreenCapture] Screen capture stopped');
      return true;
    }
    return false;
  }

  /**
   * Capture the currently active window or screen
   * @returns Capture result with metadata and extracted text, or null if capture failed
   */
  public async captureActiveWindow(): Promise<CaptureResult | null> {
    // console.log('[ScreenCapture] Attempting to capture screen...');

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

      console.log(`[ScreenCapture] Capturing: ${targetWindow
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

      // console.log(`[ScreenCapture] Saving screenshot to: ${filePath}`);
      await writeFile(filePath, source.thumbnail.toPNG());

      // Convert the thumbnail to base64 for text extraction
      const imageData = source.thumbnail.toPNG().toString('base64');

      // Extract text from the screenshot
      const textContent = await this.extractText(imageData);

      // Prepare metadata for the capture
      const captureMetadata = {
        windowTitle: source.name || 'Unknown',
        appName: source.name.split(' - ').pop() || 'Unknown',
        windowId: targetWindow?.id || null,
        displayId: primaryDisplay.id.toString(),
        bounds: captureBounds,
        dpiScale: primaryDisplay.scaleFactor,
        url: ''
      };

      // Update the application context
      this.updateApplicationContext(captureMetadata, textContent);

      try {
        // Send to event service for processing by the backend
        // This triggers the real AI processing in the Memory Service
        await this.eventService.captureEvent({
          type: 'process_event',
          source: 'screen',
          data: {
            content: textContent,
            metadata: {
              timestamp: new Date().toISOString(),
              windowId: captureMetadata.windowId,
              displayId: captureMetadata.displayId,
              bounds: captureMetadata.bounds,
              dpiScale: captureMetadata.dpiScale,
              windowTitle: captureMetadata.windowTitle,
              appName: captureMetadata.appName
            }
          }
        });

        // Also process locally with LLMService for immediate feedback if needed
        // But the real heavy lifting is now done by the backend
        const processed = await this.llmService.processScreenContent(textContent, {
          windowTitle: captureMetadata.windowTitle,
          appName: captureMetadata.appName,
          timestamp: new Date().toISOString()
        });

        // Create the event data for local consumers
        const eventData: CaptureResult = {
          id: uuidv4(),
          filePath,
          windowTitle: captureMetadata.windowTitle,
          appName: captureMetadata.appName,
          url: captureMetadata.url,
          textContent,
          metadata: {
            timestamp: new Date().toISOString(),
            windowId: captureMetadata.windowId,
            displayId: captureMetadata.displayId,
            bounds: captureMetadata.bounds,
            dpiScale: captureMetadata.dpiScale
          },
          ...processed
        };

        // Emit the screenshot event for any local listeners
        if (this.onScreenshot) {
          this.onScreenshot(eventData);
        }

        return eventData;
      } catch (error) {
        console.error('Error processing screenshot with LLM:', error);
        return null;
      }
    } catch (error) {
      console.error('Error processing screenshot:', error);
      return null;
    }
  }
}

// Export a singleton instance
export const screenCapture = new ScreenCapture();
