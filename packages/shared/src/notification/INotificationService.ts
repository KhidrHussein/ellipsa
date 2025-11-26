export type NotificationType = 
  | 'email'
  | 'email:received'
  | 'email:action-required'
  | 'draft:ready'
  | 'error'
  | 'reminder'
  | 'system'
  | 'alert'
  | 'draft_response';

export interface INotification<T = any> {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp?: number;
  read?: boolean;
  data?: T;
}

export interface DraftResponseData {
  threadId: string;
  to: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
  emailId?: string;
}

export interface INotificationService {
  addNotification(notification: INotification): Promise<string>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  getUnreadCount(): Promise<number>;
  getNotifications(limit?: number): Promise<INotification[]>;
  onNotification(callback: (notification: INotification) => void): () => void;
}

export const NOTIFICATION_CHANNEL = 'notification';
