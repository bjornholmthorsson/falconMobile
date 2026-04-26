import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../models';

const NOTIF_STORAGE_KEY = '@falcon/notifications';
const LANG_STORAGE_KEY = '@falcon/lunchLang';
const JIRA_FAVS_STORAGE_KEY = '@falcon/jiraFavorites';
const JIRA_FAVS_MAX = 5;

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  receivedAt: number;
  apnsIdentifier?: string; // iOS notification center identifier, for removal on dismiss
}

export interface JiraFavorite {
  key: string;
  summary: string;
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
  lunchLang: 'en' | 'is';
  jiraFavorites: JiraFavorite[];

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
  setLunchLang: (lang: 'en' | 'is') => void;
  loadLunchLang: () => void;
  addJiraFavorite: (fav: JiraFavorite) => void;
  removeJiraFavorite: (key: string) => void;
  loadJiraFavorites: () => void;
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
  lunchLang: 'en',
  jiraFavorites: [],

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
  setLunchLang: lang => {
    AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {});
    set({ lunchLang: lang });
  },
  loadLunchLang: () => {
    AsyncStorage.getItem(LANG_STORAGE_KEY).then(raw => {
      if (raw === 'en' || raw === 'is') set({ lunchLang: raw });
    }).catch(() => {});
  },
  addJiraFavorite: fav => set(s => {
    const key = fav.key.trim().toUpperCase();
    if (!key) return s;
    if (s.jiraFavorites.some(f => f.key === key)) return s;
    const next = [...s.jiraFavorites, { key, summary: fav.summary ?? '' }];
    while (next.length > JIRA_FAVS_MAX) next.shift();
    AsyncStorage.setItem(JIRA_FAVS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return { jiraFavorites: next };
  }),
  removeJiraFavorite: key => set(s => {
    const k = key.trim().toUpperCase();
    const next = s.jiraFavorites.filter(f => f.key !== k);
    AsyncStorage.setItem(JIRA_FAVS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return { jiraFavorites: next };
  }),
  loadJiraFavorites: () => {
    AsyncStorage.getItem(JIRA_FAVS_STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter((f: any) => f && typeof f.key === 'string')
            .map((f: any) => ({ key: String(f.key).toUpperCase(), summary: String(f.summary ?? '') }))
            .slice(-JIRA_FAVS_MAX);
          set({ jiraFavorites: cleaned });
        }
      } catch {}
    }).catch(() => {});
  },
}));
