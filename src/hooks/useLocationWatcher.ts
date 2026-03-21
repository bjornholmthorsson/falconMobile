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

  useEffect(() => {
    if (!currentUser) return;

    let started = false;
    requestLocationPermission().then(granted => {
      if (granted && currentUser) {
        startWatching(currentUser.id);
        started = true;
      }
    });

    return () => {
      if (started) stopWatching();
    };
  }, [currentUser?.id]);
}
