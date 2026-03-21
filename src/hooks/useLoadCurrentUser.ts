import { useEffect } from 'react';
import { getMe } from '../services/graphService';
import { isSignedIn } from '../services/authService';
import { useAppStore } from '../store/appStore';

/**
 * Fetches the current user profile in the background once authenticated.
 * Also restores the authenticated state on app restart if tokens exist.
 */
export function useLoadCurrentUser() {
  const { isAuthenticated, setIsAuthenticated, setCurrentUser } = useAppStore(s => ({
    isAuthenticated: s.isAuthenticated,
    setIsAuthenticated: s.setIsAuthenticated,
    setCurrentUser: s.setCurrentUser,
  }));

  // Restore auth state on cold start
  useEffect(() => {
    if (!isAuthenticated) {
      isSignedIn().then(signed => {
        if (signed) setIsAuthenticated(true);
      });
    }
  }, []);

  // Load user profile whenever we become authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    getMe()
      .then(user => setCurrentUser(user))
      .catch(() => {}); // profile is optional — app still works without it
  }, [isAuthenticated]);
}
