/**
 * Starts GPS watching when a user is signed in, stops when they sign out.
 * Also runs a one-shot check-in when the app comes to the foreground so an
 * arrival at a known location is recorded even if the OS suspended the
 * background watcher.
 *
 * Call this once from the root of the authenticated navigator.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  refreshLocation,
  requestLocationPermission,
  startWatching,
  stopWatching,
} from '../services/locationService';
import { useAppStore } from '../store/appStore';

export function useLocationWatcher() {
  const currentUser = useAppStore(s => s.currentUser);
  const checkinEnabled = useAppStore(s => s.checkinEnabled);

  useEffect(() => {
    if (!currentUser || !checkinEnabled) {
      // Ensure watcher is stopped whenever the condition is not met,
      // including when checkinEnabled is toggled off at runtime.
      stopWatching();
      return;
    }

    let cancelled = false;
    requestLocationPermission().then(granted => {
      // Guard against the effect being cleaned up before the async
      // permission response came back — without this, the watcher
      // could start after checkinEnabled was already set to false.
      if (!cancelled && granted) {
        startWatching(currentUser.id);
        // First foreground entry after start: capture the current location now
        // rather than waiting for a 50m-displacement event. Catches the case
        // where the user is already standing inside a known place at app open.
        refreshLocation(currentUser.id);
      }
    });

    // Re-check whenever the app comes back to active. iOS may have suspended
    // background updates; a foreground refresh ensures the visit is recorded.
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && !cancelled) {
        refreshLocation(currentUser.id);
      }
    });

    return () => {
      cancelled = true;   // prevent startWatching from firing late
      sub.remove();
      stopWatching();     // always stop, regardless of whether it started
    };
  }, [currentUser?.id, checkinEnabled]);
}
