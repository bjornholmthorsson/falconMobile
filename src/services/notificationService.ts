import { Platform } from 'react-native';
import { registerDeviceToken } from './api';
import { useAppStore } from '../store/appStore';
import { queryClient } from './queryClient';

let listenerSetUp = false;

/**
 * Set up notification event listeners immediately on app start (before auth).
 * This ensures we capture notifications that arrive while the app is loading.
 */
export function setupNotificationListeners(): void {
  if (Platform.OS !== 'ios' || listenerSetUp) return;
  listenerSetUp = true;

  let PushNotificationIOS: any;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.addEventListener) return;
  } catch {
    return;
  }

  // Handle incoming notifications (foreground + when app is opened from one)
  PushNotificationIOS.addEventListener('notification', (notification: any) => {
    addNotificationFromPayload(notification);
    notification.finish(PushNotificationIOS.FetchResult.NoData);
  });

  // Check for notification that launched the app (tapped while app was killed)
  PushNotificationIOS.getInitialNotification?.().then((notification: any) => {
    if (notification) addNotificationFromPayload(notification);
  });
}

/**
 * Requests notification permission and registers the APNs device token
 * with the backend. Call once after the user is authenticated.
 */
export async function setupPushNotifications(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  let PushNotificationIOS: any;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.requestPermissions) return;
  } catch {
    return;
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
}

function addNotificationFromPayload(notification: any): void {
  const data  = notification.getData?.() ?? {};
  // Announcements have their own banner sourced from the GET fetch — refetch instead of duplicating
  if (data?.type === 'announcement') {
    queryClient.invalidateQueries({ queryKey: ['announcements'] });
    return;
  }
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
 * in-app notification list. They stay in the notification center until
 * the user dismisses the in-app card.
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
        const apnsIdentifier = n.identifier ?? '';
        const isDuplicate = store.notifications.some(
          existing => existing.title === title && existing.body === body,
        );
        if (!isDuplicate) {
          store.addNotification({
            id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
            title,
            body,
            receivedAt: Date.now(),
            apnsIdentifier,
          });
        }
      }
    });
  } catch {
    // ignore
  }
}

/** Remove a notification from the iOS Notification Center by its identifier. */
export function removeDeliveredNotification(identifier?: string): void {
  if (Platform.OS !== 'ios' || !identifier) return;
  try {
    const mod = require('@react-native-community/push-notification-ios');
    const PushNotificationIOS = mod.default || mod;
    if (!PushNotificationIOS?.removeDeliveredNotifications) return;
    PushNotificationIOS.removeDeliveredNotifications([identifier]);
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
