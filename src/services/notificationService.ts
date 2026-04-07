import { Platform } from 'react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import { registerDeviceToken } from './api';

/**
 * Requests notification permission and registers the APNs device token
 * with the backend. Call once after the user is authenticated.
 */
export async function setupPushNotifications(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const permissions = await PushNotificationIOS.requestPermissions({
    alert: true,
    badge: true,
    sound: true,
  });

  if (!permissions.alert) return;

  // Listen for the device token issued by APNs
  PushNotificationIOS.addEventListener('register', async (token: string) => {
    try {
      await registerDeviceToken(userId, token);
    } catch {
      // Non-critical — will retry on next launch
    }
  });

  // Ensure notifications complete when received in background
  PushNotificationIOS.addEventListener('notification', notification => {
    notification.finish(PushNotificationIOS.FetchResult.NoData);
  });
}

export function teardownPushNotifications(): void {
  if (Platform.OS !== 'ios') return;
  PushNotificationIOS.removeEventListener('register');
  PushNotificationIOS.removeEventListener('notification');
}
