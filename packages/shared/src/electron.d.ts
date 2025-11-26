// Export the Notification interface
export interface Notification {
  id: string;
  type: 'email' | 'reminder' | 'system' | 'alert' | 'draft_response';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: any;
}

// Define the ElectronAPI interface
export interface ElectronAPI {
  // Notification methods
  onNotification: (callback: (notification: Notification) => void) => void;
  markNotificationAsRead: (id: string) => Promise<{ success: boolean }>;
  markAllNotificationsAsRead: () => Promise<{ success: boolean }>;
  getNotifications: (limit?: number) => Promise<Notification[]>;
  
  // Email methods
  openEmail: (id: string) => void;
  
  // Reminder methods
  showReminder: (data: any) => void;
  
  // Generic methods
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {}; // This file needs to be a module
