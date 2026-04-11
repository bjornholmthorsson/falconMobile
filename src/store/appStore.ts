import { create } from 'zustand';
import type { User } from '../models';

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
  addNotification: n => set(s => ({ notifications: [n, ...s.notifications] })),
  dismissNotification: id => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })),
}));
