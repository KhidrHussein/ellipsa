import { Notification } from '@ellipsa/shared/electron';
export declare class NotificationService {
    private notifications;
    private static instance;
    private updateCallbacks;
    private electronConnected;
    private static readonly STORAGE_KEY;
    private constructor();
    static getInstance(): NotificationService;
    private setupElectronListeners;
    private syncWithMainProcess;
    addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): string;
    markAsRead(id: string): Promise<void>;
    markAllAsRead(): Promise<void>;
    clearAll(): void;
    getUnreadCount(): number;
    getNotifications(limit?: number): Notification[];
    onUpdate(callback: () => void): () => void;
    private triggerUpdate;
    private saveNotifications;
    private loadNotifications;
}
export declare const notificationService: NotificationService;
//# sourceMappingURL=NotificationService.d.ts.map