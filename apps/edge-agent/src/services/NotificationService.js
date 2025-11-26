export class NotificationService {
    constructor() {
        this.notifications = [];
        this.updateCallbacks = [];
        this.electronConnected = false;
        this.loadNotifications();
        this.setupElectronListeners();
    }
    static getInstance() {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }
    setupElectronListeners() {
        // Type assertion to access electronAPI
        const electronAPI = window.electronAPI;
        if (electronAPI?.onNotification) {
            this.electronConnected = true;
            // Listen for new notifications from main process
            electronAPI.onNotification((notification) => {
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
    async syncWithMainProcess() {
        const electronAPI = window.electronAPI;
        if (electronAPI?.getNotifications) {
            try {
                const notifications = await electronAPI.getNotifications(50);
                this.notifications = notifications.map(n => ({
                    ...n,
                    timestamp: typeof n.timestamp === 'string' ? new Date(n.timestamp) : n.timestamp
                }));
                this.triggerUpdate();
            }
            catch (error) {
                console.error('Failed to sync notifications with main process:', error);
            }
        }
    }
    addNotification(notification) {
        const newNotification = {
            ...notification,
            id: Date.now().toString(),
            timestamp: new Date(),
            read: false
        };
        this.notifications.unshift(newNotification);
        this.triggerUpdate();
        return newNotification.id;
    }
    async markAsRead(id) {
        const notification = this.notifications.find(n => n.id === id);
        if (!notification)
            return;
        notification.read = true;
        const electronAPI = window.electronAPI;
        if (electronAPI?.markNotificationAsRead) {
            try {
                await electronAPI.markNotificationAsRead(id);
            }
            catch (error) {
                console.error('Failed to mark notification as read in main process:', error);
            }
        }
        this.triggerUpdate();
    }
    async markAllAsRead() {
        this.notifications = this.notifications.map(n => ({
            ...n,
            read: true
        }));
        const electronAPI = window.electronAPI;
        if (electronAPI?.markAllNotificationsAsRead) {
            try {
                await electronAPI.markAllNotificationsAsRead();
            }
            catch (error) {
                console.error('Failed to mark all notifications as read in main process:', error);
            }
        }
        this.triggerUpdate();
    }
    clearAll() {
        this.notifications = [];
        this.triggerUpdate();
    }
    getUnreadCount() {
        return this.notifications.filter(n => !n.read).length;
    }
    getNotifications(limit = 50) {
        return this.notifications.slice(0, limit);
    }
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
        return () => {
            this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
        };
    }
    triggerUpdate() {
        this.saveNotifications();
        this.updateCallbacks.forEach(callback => callback());
    }
    saveNotifications() {
        try {
            const electronAPI = window.electronAPI;
            if (electronAPI?.send) {
                electronAPI.send('save-notifications', this.notifications);
            }
        }
        catch (error) {
            console.error('Failed to save notifications:', error);
        }
    }
    loadNotifications() {
        try {
            const electronAPI = window.electronAPI;
            if (electronAPI?.invoke) {
                electronAPI.invoke('load-notifications')
                    .then((notifications) => {
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
        }
        catch (error) {
            console.error('Error loading notifications:', error);
        }
    }
}
NotificationService.STORAGE_KEY = 'notifications';
export const notificationService = NotificationService.getInstance();
//# sourceMappingURL=NotificationService.js.map