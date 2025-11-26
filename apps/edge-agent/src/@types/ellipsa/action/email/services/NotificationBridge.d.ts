import { INotificationService, INotification, NotificationType } from '@ellipsa/shared';

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

declare class NotificationBridge implements INotificationService {
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
