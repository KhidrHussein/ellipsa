import { desktopCapturer, BrowserWindow, nativeImage, DesktopCapturerSource } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

interface CaptureOptions {
  types?: ('screen' | 'window')[];
  thumbnailSize?: { width: number; height: number };
  fetchWindowIcons?: boolean;
}

interface CaptureResult {
  filePath: string;
  windowTitle: string;
}

export class ScreenCapture {
  private activeWindowId: number | null = null;
  private captureInterval: NodeJS.Timeout | null = null;
  private readonly capturePath: string;
  private isCapturing: boolean = false;

  constructor() {
    this.capturePath = join(app.getPath('userData'), 'screenshots');
  }

  /**
   * Get available screen and window sources
   */
  private async getSources(
    options: CaptureOptions = {}
  ): Promise<DesktopCapturerSource[]> {
    const defaultOptions: Electron.SourcesOptions = {
      types: options.types || ['screen', 'window'],
      thumbnailSize: options.thumbnailSize || { width: 0, height: 0 },
      fetchWindowIcons: options.fetchWindowIcons || false
    };

    try {
      return await desktopCapturer.getSources({
        types: defaultOptions.types as ('screen' | 'window')[],
        thumbnailSize: defaultOptions.thumbnailSize,
        fetchWindowIcons: defaultOptions.fetchWindowIcons
      });
    } catch (error) {
      console.error('Error getting screen sources:', error);
      throw error;
    }
  }

  /**
   * Start periodic screen capture
   * @param interval Capture interval in milliseconds
   * @param mainWindow Optional window reference for IPC communication
   */
  public startCapture(interval: number = 5000, mainWindow?: BrowserWindow): boolean {
    if (this.isCapturing) {
      console.warn('Screen capture is already running');
      return false;
    }
    
    this.isCapturing = true;
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    this.captureInterval = setInterval(async () => {
      if (!this.isCapturing) return;
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_${timestamp}.png`;
        const filePath = join(this.capturePath, filename);
        
        // Get the active window
        const activeWindow = BrowserWindow.getFocusedWindow();
        const windowId = activeWindow?.id;
        
        // Only capture if the window has changed or it's the first capture
        if (windowId !== this.activeWindowId) {
          this.activeWindowId = windowId || null;
          
          // Capture the screen
          const sources = await this.getSources({
            types: ['window'],
            thumbnailSize: { width: 1280, height: 720 }
          });

          // Find the active window in the sources
          const activeSource = sources.find(source => {
            return source.id === `window:${windowId}` || 
                   source.name === activeWindow?.getTitle();
          });

          if (activeSource?.thumbnail) {
            const pngData = nativeImage.createFromDataURL(activeSource.thumbnail.toDataURL()).toPNG();
            await writeFile(filePath, pngData);
            
            // Notify the main window if provided
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('screenshot-captured', {
                filePath,
                windowTitle: activeSource.name || 'Untitled Window',
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
        console.error('Error capturing screen:', error);
      }
    }, interval);
    
    return true;
  }

  /**
   * Stop the periodic screen capture
   */
  public stopCapture(): void {
    if (!this.isCapturing) {
      return;
    }
    
    this.isCapturing = false;
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  /**
   * Capture the active window
   */
  public async captureActiveWindow(): Promise<CaptureResult | null> {
    // Ensure directory exists
    await mkdir(this.capturePath, { recursive: true });
    try {
      const activeWindow = BrowserWindow.getFocusedWindow();
      if (!activeWindow) return null;

      const windowId = activeWindow.id;
      const windowTitle = activeWindow.getTitle();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `window_${windowId}_${timestamp}.png`;
      const filePath = join(this.capturePath, filename);

      const sources = await this.getSources({
        types: ['window'],
        thumbnailSize: { width: 1280, height: 720 }
      });

      const activeSource = sources.find(source => 
        source.id === `window:${windowId}` || 
        source.name === windowTitle
      );

      if (activeSource?.thumbnail) {
        const pngData = nativeImage.createFromDataURL(activeSource.thumbnail.toDataURL()).toPNG();
        await writeFile(filePath, pngData);
        return { filePath, windowTitle };
      }
      
      return null;
    } catch (error) {
      console.error('Error capturing active window:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const screenCapture = new ScreenCapture();
