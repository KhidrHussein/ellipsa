import { NativeImage } from 'electron';

declare global {
  namespace Electron {
    interface DesktopCapturerSource {
      /**
       * An identifier that can be used as a chromeMediaSourceId constraint when calling
       * [navigator.webkitGetUserMedia]. The format of the identifier will be `window:XX` or `screen:XX`
       * where `XX` is a random number.
       */
      id: string;

      /**
       * The screen or window name that will be used to the end user.
       */
      name: string;

      /**
       * A thumbnail image of the display or window. The image's size is not specified and depends on the
       * capabilities of the platform.
       */
      thumbnail: NativeImage;

      /**
       * A unique identifier for the window or screen that can be used with the `desktopCapturer` module.
       */
      display_id?: string;

      /**
       * The application icon of the window that the thumbnail is for.
       */
      appIcon?: NativeImage;
    }

    interface SourcesOptions {
      /**
       * An array of strings that lists the types of desktop sources to be captured.
       * Valid types are 'screen' and 'window'.
       */
      types: ('screen' | 'window')[];

      /**
       * The size that the media source thumbnail should be scaled to.
       */
      thumbnailSize?: { width: number; height: number };

      /**
       * Set to true to enable fetching window icons. The default is false.
       */
      fetchWindowIcons?: boolean;
    }

    interface DesktopCapturer {
      /**
       * Get available desktop windows and screens that can be captured.
       */
      getSources(options: SourcesOptions): Promise<DesktopCapturerSource[]>;
    }
  }
}
