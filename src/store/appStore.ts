import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../models';

const NOTIF_STORAGE_KEY = '@falcon/notifications';

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  receivedAt: number;
  apnsIdentifier?: string; // iOS notification center identifier, for removal on dismiss
}

interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  authRestored: boolean;
  isWorking: boolean;
  teamOfficeFilter: string[];
  checkinEnabled: boolean;
  userTokens: string[];
  notifications: InAppNotification[];

  setUserTokens: (tokens: string[]) => void;
  setCurrentUser: (user: User | null) => void;
  setIsAuthenticated: (auth: boolean) => void;
  setAuthRestored: (restored: boolean) => void;
  setIsWorking: (working: boolean) => void;
  setTeamOfficeFilter: (offices: string[]) => void;
  setCheckinEnabled: (enabled: boolean) => void;
  addNotification: (n: InAppNotification) => void;
  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
  loadNotifications: () => void;
}

export const useAppStore = create<AppState>(set => ({
  currentUser: null,
  isAuthenticated: false,
  authRestored: true,
  isWorking: false,
  teamOfficeFilter: [],
  checkinEnabled: false, // stays false until user settings are loaded from backend
  userTokens: [],
  notifications: [],

  setUserTokens: tokens => set({ userTokens: tokens }),
  setCurrentUser: user => set({ currentUser: user }),
  setIsAuthenticated: auth => set({ isAuthenticated: auth }),
  setAuthRestored: restored => set({ authRestored: restored }),
  setIsWorking: working => set({ isWorking: working }),
  setTeamOfficeFilter: offices => set({ teamOfficeFilter: offices }),
  setCheckinEnabled: enabled => set({ checkinEnabled: enabled }),
  addNotification: n => set(s => {
    const notifications = [n, ...s.notifications];
    AsyncStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications)).catch(() => {});
    return { notifications };
  }),
  dismissNotification: id => set(s => {
    const notifications = s.notifications.filter(n => n.id !== id);
    AsyncStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications)).catch(() => {});
    return { notifications };
  }),
  clearAllNotifications: () => {
    AsyncStorage.removeItem(NOTIF_STORAGE_KEY).catch(() => {});
    set({ notifications: [] });
  },
  loadNotifications: () => {
    AsyncStorage.getItem(NOTIF_STORAGE_KEY).then(raw => {
      if (raw) {
        try { set({ notifications: JSON.parse(raw) }); } catch {}
      }
    }).catch(() => {});
  },
}));
