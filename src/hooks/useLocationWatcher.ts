/**
 * Starts GPS watching when a user is signed in, stops when they sign out.
 * Call this once from the root of the authenticated navigator.
 */
import { useEffect } from 'react';
import {
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
      }
    });

    return () => {
      cancelled = true;   // prevent startWatching from firing late
      stopWatching();     // always stop, regardless of whether it started
    };
  }, [currentUser?.id, checkinEnabled]);
}
