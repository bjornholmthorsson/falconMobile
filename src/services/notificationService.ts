import { Platform } from 'react-native';
import { registerDeviceToken } from './api';
import { useAppStore } from '../store/appStore';

/**
 * Requests notification permission and registers the APNs device token
 * with the backend. Call once after the user is authenticated.
 *
 * Uses a lazy require so the native module is only accessed when actually
 * needed — prevents a crash on simulators where APNs is unavailable.
 */
export async function setupPushNotifications(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  let PushNotificationIOS: any;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.requestPermissions) return;
  } catch {
    return; // native module unavailable (e.g. simulator)
  }

  let permissions: any;
  try {
    permissions = await PushNotificationIOS.requestPermissions({
      alert: true,
      badge: true,
      sound: true,
    });
  } catch {
    return;
  }

  if (!permissions?.alert) return;

  // Listen for the device token issued by APNs
  PushNotificationIOS.addEventListener('register', async (token: string) => {
    try {
      await registerDeviceToken(userId, token);
    } catch {
      // Non-critical — will retry on next launch
    }
  });

  // Handle incoming notifications (foreground + when app is opened from one)
  PushNotificationIOS.addEventListener('notification', (notification: any) => {
    addNotificationFromPayload(notification);
    notification.finish(PushNotificationIOS.FetchResult.NoData);
  });

  // Check for notification that launched the app (tapped while app was killed)
  PushNotificationIOS.getInitialNotification().then((notification: any) => {
    if (notification) addNotificationFromPayload(notification);
  });
}

function addNotificationFromPayload(notification: any): void {
  const alert = notification.getAlert?.();
  if (alert) {
    const title = typeof alert === 'string' ? alert : alert.title ?? '';
    const body = typeof alert === 'string' ? '' : alert.body ?? '';
    useAppStore.getState().addNotification({
      id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      title,
      body,
      receivedAt: Date.now(),
    });
  }
}

/**
 * Pull any notifications still in the iOS Notification Center into the
 * in-app notification list, then clear them from the system tray.
 * Called when app comes to foreground so the user sees them as cards.
 */
export function syncDeliveredNotifications(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    const PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.getDeliveredNotifications) return;
    PushNotificationIOS.getDeliveredNotifications((notifications: any[]) => {
      if (!notifications?.length) return;
      const store = useAppStore.getState();
      for (const n of notifications) {
        const title = n.title ?? '';
        const body = n.body ?? '';
        // Avoid duplicates by checking if we already have a notification with same title+body
        const isDuplicate = store.notifications.some(
          existing => existing.title === title && existing.body === body,
        );
        if (!isDuplicate) {
          store.addNotification({
            id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
            title,
            body,
            receivedAt: Date.now(),
          });
        }
      }
      // Clear from notification center now that they're shown in-app
      const ids = notifications.map((n: any) => n.identifier).filter(Boolean);
      if (ids.length) PushNotificationIOS.removeDeliveredNotifications(ids);
    });
  } catch {
    // ignore
  }
}

/** Clear the app badge (called when app comes to foreground). */
export function clearBadge(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    const PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.setApplicationIconBadgeNumber) return;
    PushNotificationIOS.setApplicationIconBadgeNumber(0);
  } catch {
    // ignore
  }
}

/** Decrease the app badge by 1 (called when user dismisses an in-app notification). */
export function decrementBadge(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    const PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.getApplicationIconBadgeNumber) return;
    PushNotificationIOS.getApplicationIconBadgeNumber((count: number) => {
      const next = Math.max(0, count - 1);
      PushNotificationIOS.setApplicationIconBadgeNumber(next);
    });
  } catch {
    // ignore
  }
}

export function teardownPushNotifications(): void {
  if (Platform.OS !== 'ios') return;
  let PushNotificationIOS: any;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.removeEventListener) return;
  } catch {
    return;
  }
  PushNotificationIOS.removeEventListener('register');
  PushNotificationIOS.removeEventListener('notification');
}
