import { notificationService } from '../services/NotificationService';
import type { INotification } from '@ellipsa/shared/notification/INotificationService';

// Type definitions for the Electron API exposed via preload script
declare global {
  interface Window {
    ellipsa?: {
      // Notification methods
      showReminder: (data: any) => void;
      
      // Email methods
      openEmail: (id: string) => void;
      
      // Other methods from the preload script
      startAudioCapture: () => Promise<void>;
      stopAudioCapture: () => Promise<void>;
      onAudioLevel: (callback: (level: number) => void) => () => void;
      toggleObserve: () => Promise<void>;
      getObserveStatus: () => Promise<{ observing: boolean }>;
      onObserveStatus: (callback: (status: { observing: boolean }) => void) => () => void;
      getIconPath: () => string;
      getIconData: () => Promise<string>;
      moveWindow: (x: number, y: number) => void;
      getWindowPos: () => Promise<{ x: number; y: number }>;
      toggleChat: () => void;
      closeChat: () => void;
      minimizeChat: () => void;
      sendMessage: (message: string) => void;
      onMessage: (callback: (message: string) => void) => () => void;
      quitApp: () => void;
      cleanup: () => void;
    };
  }
}

// Helper type to get timestamp in milliseconds
const getTimestamp = (timestamp: Date | number): number => {
  return typeof timestamp === 'number' ? timestamp : timestamp.getTime();
};

interface Notification extends Omit<INotification<any>, 'timestamp' | 'title' | 'message'> {
  id: string;
  read: boolean;
  timestamp: Date | number;
  data?: any;
  title: string;
  message: string;
}

class NotificationUI {
  private notificationBadge: HTMLElement | null = null;
  private notificationPanel: HTMLElement | null = null;
  private notificationList: HTMLElement | null = null;
  private isPanelOpen = false;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.render();
  }

  private initializeElements(): void {
    // Create notification badge if it doesn't exist
    if (!this.notificationBadge) {
      this.notificationBadge = document.createElement('div');
      this.notificationBadge.id = 'notification-badge';
      this.notificationBadge.className = 'notification-badge';
      this.notificationBadge.style.display = 'none';
      document.getElementById('floating-btn')?.appendChild(this.notificationBadge);
    }

    // Create notification panel if it doesn't exist
    if (!this.notificationPanel) {
      this.notificationPanel = document.createElement('div');
      this.notificationPanel.id = 'notification-panel';
      this.notificationPanel.className = 'notification-panel';
      this.notificationPanel.innerHTML = `
        <div class="notification-header">
          <div class="notification-title">Notifications</div>
          <button id="clear-notifications" class="notification-clear">Clear All</button>
        </div>
        <ul id="notification-list" class="notification-list">
          <li class="notification-empty">No new notifications</li>
        </ul>
      `;
      document.body.appendChild(this.notificationPanel);
      this.notificationList = document.getElementById('notification-list');
    }
  }

  private setupEventListeners(): void {
    // Toggle notification panel when clicking the badge
    this.notificationBadge?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNotificationPanel();
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isPanelOpen && !this.notificationPanel?.contains(e.target as Node)) {
        this.closeNotificationPanel();
      }
    });

    // Clear all notifications
    document.getElementById('clear-notifications')?.addEventListener('click', (e) => {
      e.stopPropagation();
      notificationService.clearAll();
    });

    // Listen for notification updates
    notificationService.onUpdate(() => this.render());
  }

  private toggleNotificationPanel(): void {
    if (this.isPanelOpen) {
      this.closeNotificationPanel();
    } else {
      this.openNotificationPanel();
    }
  }

  private openNotificationPanel(): void {
    if (this.notificationPanel) {
      this.notificationPanel.classList.add('visible');
      this.isPanelOpen = true;
      notificationService.markAllAsRead();
    }
  }

  private closeNotificationPanel(): void {
    if (this.notificationPanel) {
      this.notificationPanel.classList.remove('visible');
      this.isPanelOpen = false;
    }
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  }

  private createNotificationElement(notification: Notification): HTMLElement {
    const notificationElement = document.createElement('div');
    const typeClass = notification.type || 'system';
    notificationElement.className = `notification ${typeClass} ${notification.read ? 'read' : ''}`;
    
    // Ensure we have an ID for the notification
    const notificationId = notification.id || `notif-${Date.now()}`;
    notificationElement.dataset.id = notificationId;

    const title = document.createElement('div');
    title.className = 'notification-title';
    title.textContent = notification.title || 'New Notification';

    const message = document.createElement('div');
    message.className = 'notification-message';
    message.textContent = notification.message || '';

    const timestamp = document.createElement('div');
    timestamp.className = 'notification-timestamp';
    const timestampValue = notification.timestamp ? 
      (typeof notification.timestamp === 'number' ? notification.timestamp : notification.timestamp.getTime()) : 
      Date.now();
    timestamp.textContent = this.formatTimestamp(timestampValue);

    notificationElement.appendChild(title);
    notificationElement.appendChild(message);
    notificationElement.appendChild(timestamp);

    // Add click handler to mark as read and handle the notification
    notificationElement.addEventListener('click', () => {
      const notificationToHandle: Notification = {
        ...notification,
        id: notificationId,
        timestamp: getTimestamp(notification.timestamp)
      };
      this.handleNotificationClick(notificationToHandle);
    });

    return notificationElement;
  }

  private handleNotificationClick(notification: Notification): void {
    // Mark as read when clicked
    notificationService.markAsRead(notification.id);
    
    // Handle the notification action based on type
    switch (notification.type) {
      case 'email':
        // Open email in the app
        window.ellipsa?.openEmail(notification.id);
        break;
      case 'reminder':
        // Show reminder details
        window.ellipsa?.showReminder(notification.data);
        break;
      // Add more cases as needed
    }
    
    // Close the panel after handling
    this.closeNotificationPanel();
  }

  private renderNotificationItem(notification: Notification): HTMLElement {
    const element = document.createElement('div');
    element.className = `notification-item ${notification.read ? 'read' : 'unread'}`;
    
    const title = document.createElement('div');
    title.className = 'notification-title';
    title.textContent = notification.title || 'New Notification';
    
    const message = document.createElement('div');
    message.className = 'notification-message';
    message.textContent = notification.message || '';
    
    const time = document.createElement('div');
    time.className = 'notification-time';
    const timestampValue = notification.timestamp ? 
      getTimestamp(notification.timestamp) : 
      Date.now();
    time.textContent = this.formatTimestamp(timestampValue);
    
    element.appendChild(title);
    element.appendChild(message);
    element.appendChild(time);
    
    element.addEventListener('click', () => this.handleNotificationClick(notification));
    
    return element;
  }

  public render(): void {
    const unreadCount = notificationService.getUnreadCount();
    const notifications = notificationService.getNotifications();

    if (this.notificationList) {
      this.notificationList.innerHTML = ''; // Clear existing notifications
      
      if (notifications.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'notification-empty';
        emptyMsg.textContent = 'No new notifications';
        this.notificationList.appendChild(emptyMsg);
      } else {
        notifications.forEach(notification => {
          this.notificationList?.appendChild(this.renderNotificationItem(notification));
        });
      }
    }
  }
}

// Initialize the notification UI when the DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new NotificationUI());
} else {
  new NotificationUI();
}