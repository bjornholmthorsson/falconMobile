import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getMe } from '../services/graphService';
import { isSignedIn } from '../services/authService';
import { getUserSettings, getUserTokens } from '../services/api';
import { setupPushNotifications, syncDeliveredNotifications } from '../services/notificationService';
import { useAppStore } from '../store/appStore';

/**
 * Fetches the current user profile in the background once authenticated.
 * Also restores the authenticated state on app restart if tokens exist.
 */
export function useLoadCurrentUser() {
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const currentUser = useAppStore(s => s.currentUser);
  const setIsAuthenticated = useAppStore(s => s.setIsAuthenticated);
  const setCurrentUser = useAppStore(s => s.setCurrentUser);
  const setAuthRestored = useAppStore(s => s.setAuthRestored);
  const setCheckinEnabled = useAppStore(s => s.setCheckinEnabled);
  const setUserTokens = useAppStore(s => s.setUserTokens);

  // Restore auth state once on cold start
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!isAuthenticated) {
      isSignedIn()
        .then(signed => {
          if (signed) setIsAuthenticated(true);
        })
        .catch(() => {/* storage error — treat as signed out */})
        .finally(() => setAuthRestored(true));
    } else {
      setAuthRestored(true);
    }
  }, []);

  // Sync delivered notifications into in-app cards when app comes to foreground
  useEffect(() => {
    syncDeliveredNotifications();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncDeliveredNotifications();
    });
    return () => sub.remove();
  }, []);

  // Load user profile once when authenticated and not yet loaded
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || currentUser || fetchedRef.current) return;
    fetchedRef.current = true;
    getMe()
      .then(user => {
        setCurrentUser(user);
        setupPushNotifications(user.id).catch(() => {/* non-critical */});
        getUserTokens(user.id)
          .then(tokens => setUserTokens(tokens.map(t => t.tokenName)))
          .catch(() => {/* tokens unavailable — no special access */});
        return getUserSettings(user.id);
      })
      .then(settings => setCheckinEnabled(settings.checkinEnabled))
      .catch(() => {
        fetchedRef.current = false;
        setCheckinEnabled(false); // settings unavailable — keep location off until next load
      });
  }, [isAuthenticated, currentUser]);
}
