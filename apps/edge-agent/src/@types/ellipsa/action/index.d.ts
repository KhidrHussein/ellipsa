// Type definitions for @ellipsa/action

declare module '@ellipsa/action' {
  // Import the notification bridge and re-export it
  import { notificationBridge, NotificationBridge, INotification, INotificationService, NotificationType, NotificationData } from './notification-bridge';
  
  // Re-export everything from the notification bridge
  export {
    notificationBridge,
    NotificationBridge,
    INotification,
    INotificationService,
    NotificationType,
    NotificationData
  };
}

// Define the notification bridge in a separate module to avoid circular dependencies
declare module '@ellipsa/action/notification-bridge' {
  // Define minimal interfaces to avoid external dependencies
  export interface INotification {
    id?: string;
    type: string;
    title: string;
    message: string;
    timestamp?: number | Date;
    read?: boolean;
    data?: any;
  }

  export interface INotificationService {
    addNotification(notification: INotification): Promise<string>;
    markAsRead(id: string): Promise<void>;
    markAllAsRead(): Promise<void>;
    getUnreadCount(): Promise<number>;
    getNotifications(limit?: number): Promise<INotification[]>;
    onNotification(callback: (notification: INotification) => void): () => void;
  }

  export type NotificationType = 'email' | 'reminder' | 'action' | 'draft' | 'error' | string;

  export interface NotificationData {
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

  export class NotificationBridge implements INotificationService {
    private static instance: NotificationBridge;
    private constructor();
    
    public static getInstance(): NotificationBridge;
    public setNotificationWindow(window: any): void;
    public setNotificationService(service: INotificationService): void;
    public createNotification(type: NotificationType, title: string, message: string, data?: NotificationData): any;
    public addNotification(notification: INotification): Promise<string>;
    public notifyNewEmails(emails: any[]): Promise<void>;
    public notify(notification: INotification): Promise<void>;
    public notifyEmailReceived(email: any): Promise<void>;
    public notifyActionRequired(email: any, action: string): Promise<void>;
    public notifyDraftReady(draft: any): Promise<void>;
    public notifyError(error: Error, context?: Record<string, unknown>): Promise<void>;
    public markAsRead(id: string): Promise<void>;
    public markAllAsRead(): Promise<void>;
    public getUnreadCount(): Promise<number>;
    public getNotifications(limit?: number): Promise<INotification[]>;
    public onNotification(callback: (notification: INotification) => void): () => void;
  }

  export const notificationBridge: NotificationBridge;
}

// For backward compatibility
declare module '@ellipsa/action/email/services/NotificationBridge' {
  export * from '@ellipsa/action/notification-bridge';
}

declare module '@ellipsa/action/email' {
  export * from '@ellipsa/action/notification-bridge';
}
