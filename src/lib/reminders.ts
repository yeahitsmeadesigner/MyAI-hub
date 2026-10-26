import type { TaskItem } from '../types';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Requests browser notification permission ONLY in response to an explicit user click.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return getNotificationPermissionState();
  }
}

export async function triggerBrowserNotification(title: string, body: string): Promise<boolean> {
  if (getNotificationPermissionState() !== 'granted') {
    return false;
  }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: `myaihub-${Date.now()}`,
        });
        return true;
      }
    }
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks open tasks for due reminders that haven't fired yet.
 */
export function findDueReminders(tasks: TaskItem[], now: Date = new Date()): TaskItem[] {
  const nowMs = now.getTime();
  return tasks.filter((task) => {
    if (task.completed || task.reminderFired || !task.reminderAt) return false;
    const reminderMs = new Date(task.reminderAt).getTime();
    if (Number.isNaN(reminderMs)) return false;
    // Trigger if reminder time has arrived within the last 24 hours
    return reminderMs <= nowMs && nowMs - reminderMs < 24 * 60 * 60 * 1000;
  });
}
