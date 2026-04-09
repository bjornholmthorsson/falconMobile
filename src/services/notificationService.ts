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
    notification.finish(PushNotificationIOS.FetchResult.NoData);
  });
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
