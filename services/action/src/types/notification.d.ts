export interface INotification {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface INotificationService {
  addNotification(notification: INotification): Promise<void>;
}
