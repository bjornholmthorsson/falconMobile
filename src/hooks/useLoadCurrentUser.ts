import { useEffect, useRef } from 'react';
import { getMe } from '../services/graphService';
import { isSignedIn } from '../services/authService';
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

  // Load user profile once when authenticated and not yet loaded
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || currentUser || fetchedRef.current) return;
    fetchedRef.current = true;
    getMe()
      .then(user => setCurrentUser(user))
      .catch(err => {
        fetchedRef.current = false;
        // If tokens are invalid/expired, drop back to login
        if (err?.message === 'Not authenticated') {
          setIsAuthenticated(false);
          setAuthRestored(true);
        }
      });
  }, [isAuthenticated, currentUser]);
}
