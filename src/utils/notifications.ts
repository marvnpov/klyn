export type NotificationPermissionResult = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermissionState(): NotificationPermissionResult {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission ?? 'default';
  }
}

export async function sendKlynNotification(
  title: string,
  body: string,
  tag = 'klyn-alert',
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/klyn-logo.png',
          badge: '/klyn-logo.png',
          tag,
        });
        return true;
      }
    }
  } catch {
    // Fall through to Notification constructor
  }

  try {
    new Notification(title, {
      body,
      icon: '/klyn-logo.png',
      tag,
    });
    return true;
  } catch {
    return false;
  }
}
