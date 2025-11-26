import { Notification, ElectronAPI } from '@ellipsa/shared/electron';

export class NotificationService {
  private notifications: Notification[] = [];
  private static instance: NotificationService;
  private updateCallbacks: (() => void)[] = [];
  private electronConnected = false;
  private static readonly STORAGE_KEY = 'notifications';

  private constructor() {
    this.loadNotifications();
    this.setupElectronListeners();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }


  private setupElectronListeners() {
    // Type assertion to access electronAPI
    const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;
    
    if (electronAPI?.onNotification) {
      this.electronConnected = true;
      
      // Listen for new notifications from main process
      electronAPI.onNotification((notification: Notification) => {
        // Convert timestamp if it's a string
        const normalizedNotification = {
          ...notification,
          timestamp: typeof notification.timestamp === 'string' 
            ? new Date(notification.timestamp) 
            : notification.timestamp
        };
        
        // Add to local state
        this.notifications.unshift(normalizedNotification);
        this.triggerUpdate();
      });

      // Initial sync
      this.syncWithMainProcess();
    }
  }

  private async syncWithMainProcess() {
    const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;
    
    if (electronAPI?.getNotifications) {
      try {
        const notifications = await electronAPI.getNotifications(50);
        this.notifications = notifications.map(n => ({
          ...n,
          timestamp: typeof n.timestamp === 'string' ? new Date(n.timestamp) : n.timestamp
        }));
        this.triggerUpdate();
      } catch (error) {
        console.error('Failed to sync notifications with main process:', error);
      }
    }
  }

  public addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): string {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false
    };

    this.notifications.unshift(newNotification);
    this.triggerUpdate();
    return newNotification.id;
  }

  public async markAsRead(id: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === id);
    if (!notification) return;

    notification.read = true;
    
    const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;
    if (electronAPI?.markNotificationAsRead) {
      try {
        await electronAPI.markNotificationAsRead(id);
      } catch (error) {
        console.error('Failed to mark notification as read in main process:', error);
      }
    }
    
    this.triggerUpdate();
  }

  public async markAllAsRead(): Promise<void> {
    this.notifications = this.notifications.map(n => ({
      ...n,
      read: true
    }));
    
    const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;
    if (electronAPI?.markAllNotificationsAsRead) {
      try {
        await electronAPI.markAllNotificationsAsRead();
      } catch (error) {
        console.error('Failed to mark all notifications as read in main process:', error);
      }
    }
    
    this.triggerUpdate();
  }

  public clearAll(): void {
    this.notifications = [];
    this.triggerUpdate();
  }

  public getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  public getNotifications(limit: number = 50): Notification[] {
    return this.notifications.slice(0, limit);
  }

  public onUpdate(callback: () => void): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
    };
  }

  private triggerUpdate(): void {
    this.saveNotifications();
    this.updateCallbacks.forEach(callback => callback());
  }

  private saveNotifications(): void {
    try {
      const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;
      if (electronAPI?.send) {
        electronAPI.send('save-notifications', this.notifications);
      }
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }

  private loadNotifications(): void {
    try {
      const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;
      if (electronAPI?.invoke) {
        electronAPI.invoke('load-notifications')
          .then((notifications: Notification[]) => {
            if (Array.isArray(notifications)) {
              this.notifications = notifications.map(n => ({
                ...n,
                timestamp: typeof n.timestamp === 'string' ? new Date(n.timestamp) : n.timestamp
              }));
              this.triggerUpdate();
            }
          })
          .catch(error => {
            console.error('Failed to load notifications:', error);
          });
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }
}

export const notificationService = NotificationService.getInstance();