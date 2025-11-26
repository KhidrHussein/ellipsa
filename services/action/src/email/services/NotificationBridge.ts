import type { EmailSummary } from '../types/email.types.js';
import type { 
  INotification, 
  INotificationService, 
  DraftResponseData,
  NotificationType 
} from '../../../../../packages/shared/src/notification/INotificationService.js';

// Add type for require
interface NodeRequire {
  (id: string): any;
}

declare const require: NodeRequire;

// Define the interface for notification data
interface NotificationData {
  emailId?: string;
  threadId?: string;
  from?: string;
  subject?: string;
  actionRequired?: boolean;
  priority?: string;
  categories?: string[];
  error?: string;
  context?: Record<string, unknown>;
}

declare const console: {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
};

type IpcHandler = (event: any, ...args: any[]) => Promise<any>;

type IpcMain = {
  handle: (channel: string, handler: (event: any, ...args: any[]) => Promise<any>) => void;
};

type BrowserWindow = {
  webContents: {
    send: (channel: string, ...args: any[]) => void;
  };
};

let ipcMain: IpcMain | undefined;

// Wrap in an async IIFE to handle top-level await
(async () => {
  try {
    // Try to import electron only in main process
    const electron = await import('electron');
    if (electron.ipcMain) {
      ipcMain = electron.ipcMain as IpcMain;
    }
  } catch (e) {
    // Running in non-electron environment
    console.warn('Running in non-electron environment, notifications will be logged to console');
  }
})();

declare global {
  interface Window {
    electronAPI?: {
      sendNotification: (notification: INotification) => void;
    };
  }
}

// Extend INotification to include required properties
interface ExtendedNotification extends INotification {
  id: string;
  timestamp: number;
  read: boolean;
  data?: NotificationData;
}

export class NotificationBridge implements INotificationService {
  private static instance: NotificationBridge;
  private notifications: Map<string, ExtendedNotification> = new Map();
  private nextId = 1;

  private generateId(): string {
    return `notif-${Date.now()}-${this.nextId++}`;
  }

  private createNotification(
    type: NotificationType,
    title: string,
    message: string,
    data?: NotificationData
  ): ExtendedNotification {
    return {
      id: this.generateId(),
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      data
    };
  }
  private notificationWindow: BrowserWindow | null = null;
  private notificationService: INotificationService | null = null;
  private subscribers: Array<(notification: INotification) => void> = [];

  private constructor() {
    this.setupIpcHandlers();
  }

  public static getInstance(): NotificationBridge {
    if (!NotificationBridge.instance) {
      NotificationBridge.instance = new NotificationBridge();
    }
    return NotificationBridge.instance;
  }

  public setNotificationWindow(window: BrowserWindow): void {
    this.notificationWindow = window;
  }

  public setNotificationService(service: INotificationService): void {
    this.notificationService = service;
  }

  private setupIpcHandlers(): void {
    if (!ipcMain) {
      console.warn('IPC not available, running in non-Electron environment');
      return;
    }

    type IpcHandler = (event: any, ...args: any[]) => Promise<any>;
    const wrapHandler = (handler: (...args: any[]) => any): IpcHandler => 
      async (event: any, ...args: any[]) => {
        try {
          return await handler(...args);
        } catch (error) {
          console.error('Error in IPC handler:', error);
          throw error;
        }
      };

    ipcMain.handle('notification:add', wrapHandler(async (notification: INotification) => {
      return this.addNotification(notification);
    }));

    ipcMain.handle('notification:markAsRead', wrapHandler(async (id: string) => {
      await this.markAsRead(id);
    }));

    ipcMain.handle('notification:markAllAsRead', wrapHandler(async () => {
      await this.markAllAsRead();
    }));

    ipcMain.handle('notification:getUnreadCount', wrapHandler(async () => {
      return this.getUnreadCount();
    }));

    ipcMain.handle('notification:getAll', wrapHandler(async (limit?: number) => {
      return this.getNotifications(limit);
    }));
  }

  private notifySubscribers(notification: INotification): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(notification);
      } catch (error) {
        console.error('Error in notification subscriber:', error);
      }
    }
  }

  public async addNotification(notification: INotification): Promise<string> {
    const id = Date.now().toString();
    const fullNotification: INotification = {
      ...notification,
      id,
      timestamp: notification.timestamp || Date.now(),
      read: false
    };

    // Forward to renderer if window is available
    if (this.notificationWindow) {
      this.notificationWindow.webContents.send('notification:new', fullNotification);
    }

    // Notify subscribers
    this.notifySubscribers(fullNotification);

    return id;
  }

  public async notifyNewEmails(emails: EmailSummary[]): Promise<void> {
    for (const email of emails) {
      await this.addNotification({
        type: 'email',
        title: `New Email: ${email.subject}`,
        message: `From: ${email.from.name || email.from.address}\n${email.summary}`,
      });
    }
  }

  public async notify(notification: INotification): Promise<void> {
    const fullNotification: ExtendedNotification = {
      ...notification,
      id: notification.id || this.generateId(),
      timestamp: notification.timestamp || Date.now(),
      read: notification.read || false,
    };

    this.notifications.set(fullNotification.id, fullNotification);
    await this.sendToRenderer(fullNotification);
  }

  public async notifyEmailReceived(email: EmailSummary): Promise<void> {
    const fromText = email.from.name 
      ? `${email.from.name} <${email.from.address}>` 
      : email.from.address;
      
    const notification = this.createNotification(
      'email',
      'New Email Received',
      `From: ${fromText}\nSubject: ${email.subject}`,
      {
        emailId: email.id,
        threadId: email.threadId,
        from: fromText,
        subject: email.subject
      }
    );
    await this.notify(notification);
  }

  public async notifyActionRequired(email: EmailSummary, action: string): Promise<void> {
    const fromText = email.from.name 
      ? `${email.from.name} <${email.from.address}>` 
      : email.from.address;
      
    const notification = this.createNotification(
      'alert',
      'Action Required',
      `Action required for email from ${fromText}: ${email.subject}`,
      {
        emailId: email.id,
        threadId: email.threadId,
        from: fromText,
        subject: email.subject,
        actionRequired: true,
        priority: 'high',
        categories: [action]
      }
    );
    await this.notify(notification);
  }

  public async notifyDraftReady(draft: DraftResponseData): Promise<void> {
    const notification = this.createNotification(
      'draft_response',
      'Draft Email Ready',
      'Your draft response is ready for review',
      draft as unknown as NotificationData
    );
    await this.notify(notification);
  }

  public async notifyError(error: Error, context?: Record<string, unknown>): Promise<void> {
    const notification = this.createNotification(
      'system',
      'An Error Occurred',
      error.message,
      {
        error: error.stack,
        context
      }
    );
    await this.notify(notification);
  }

  public async markAsRead(id: string): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.read = true;
      this.notifications.set(id, notification);
      await this.sendToRenderer(notification);
    }
  }

  public async markAllAsRead(): Promise<void> {
    for (const [id, notification] of this.notifications.entries()) {
      if (!notification.read) {
        notification.read = true;
        this.notifications.set(id, notification);
        await this.sendToRenderer(notification);
      }
    }
  }

  public async getUnreadCount(): Promise<number> {
    return Array.from(this.notifications.values()).filter(n => !n.read).length;
  }

  public async getNotifications(limit?: number): Promise<INotification[]> {
    const notifications = Array.from(this.notifications.values());
    return limit ? notifications.slice(0, limit) : notifications;
  }

  public onNotification(callback: (notification: INotification) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private async sendToRenderer(notification: ExtendedNotification): Promise<void> {
    // Notify all subscribers
    this.subscribers.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in notification subscriber:', error);
      }
    });

    // If running in Electron, send to renderer process
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.sendNotification(notification);
    } else if (ipcMain) {
      // If in main process, broadcast to all windows
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((win: any) => {
        win.webContents.send('notification:new', notification);
      });
    }
  }
}

export const notificationBridge = NotificationBridge.getInstance();
