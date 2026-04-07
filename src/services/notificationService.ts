import { Platform } from 'react-native';
import { registerDeviceToken } from './api';

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
    PushNotificationIOS = require('@react-native-community/push-notification-ios').default;
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

  // Ensure notifications complete when received in background
  PushNotificationIOS.addEventListener('notification', (notification: any) => {
    notification.finish(PushNotificationIOS.FetchResult.NoData);
  });
}

export function teardownPushNotifications(): void {
  if (Platform.OS !== 'ios') return;
  let PushNotificationIOS: any;
  try {
    PushNotificationIOS = require('@react-native-community/push-notification-ios').default;
  } catch {
    return;
  }
  PushNotificationIOS.removeEventListener('register');
  PushNotificationIOS.removeEventListener('notification');
}
