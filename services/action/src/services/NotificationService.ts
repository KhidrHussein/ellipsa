type NotificationType = 'email' | 'reminder' | 'system' | 'alert' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: any;
}

export class NotificationService {
  private static instance: NotificationService;
  private notifications: Notification[] = [];
  private updateCallbacks: (() => void)[] = [];
  private static readonly STORAGE_KEY = 'notifications';

  private constructor() {
    this.loadNotifications();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Promise<string> {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false
    };

    this.notifications.unshift(newNotification);
    await this.saveNotifications();
    this.triggerUpdate();
    return newNotification.id;
  }

  public getNotifications(limit: number = 50): Notification[] {
    return this.notifications.slice(0, limit);
  }

  public getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  public async markAsRead(id: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      await this.saveNotifications();
      this.triggerUpdate();
    }
  }

  public async markAllAsRead(): Promise<void> {
    let updated = false;
    this.notifications.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        updated = true;
      }
    });

    if (updated) {
      await this.saveNotifications();
      this.triggerUpdate();
    }
  }

  public async clearAll(): Promise<void> {
    this.notifications = [];
    await this.saveNotifications();
    this.triggerUpdate();
  }

  public onUpdate(callback: () => void): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
    };
  }

  private triggerUpdate(): void {
    try {
      const unreadCount = this.getUnreadCount();
      this.updateCallbacks.forEach(callback => {
        try {
          callback();
        } catch (err) {
          console.error('Error in notification callback:', err);
        }
      });
      
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        try {
          (window as any).electronAPI.send('new-notification', unreadCount);
        } catch (err) {
          console.error('Error sending notification to renderer:', err);
        }
      }
    } catch (error) {
      console.error('Error in triggerUpdate:', error);
    }
  }

  private async saveNotifications(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(NotificationService.STORAGE_KEY, JSON.stringify(this.notifications));
      }
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }

  private loadNotifications(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(NotificationService.STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          this.notifications = parsed.map((n: any) => ({
            ...n,
            timestamp: new Date(n.timestamp)
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }
}

export const notificationService = NotificationService.getInstance();
