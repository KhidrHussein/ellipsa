import type { INotification as SharedNotification } from '@ellipsa/shared/notification/INotificationService';

export type Notification = SharedNotification;

export type NotificationType = SharedNotification['type'];
