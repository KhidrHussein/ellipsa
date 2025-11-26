declare module '@ellipsa/shared/notification/INotificationService' {
  export interface INotification {
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    data?: Record<string, unknown>;
  }

  export interface INotificationService {
    notify(notification: Omit<INotification, 'id' | 'timestamp' | 'read'>): Promise<string>;
    getNotifications(): Promise<INotification[]>;
    markAsRead(id: string): Promise<void>;
    onNotification(callback: (notification: INotification) => void): () => void;
  }

  export interface DraftResponseData {
    threadId?: string;
    to: Array<{ name?: string; email: string }>;
    subject: string;
    body: string;
    attachments?: Array<{
      filename: string;
      content: string | Buffer;
      contentType: string;
    }>;
  }
}

declare module '@ellipsa/shared' {
  export * from './notification/INotificationService';
}
