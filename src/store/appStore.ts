import { create } from 'zustand';
import type { User } from '../models';

interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  authRestored: boolean;
  isWorking: boolean;
  teamOfficeFilter: string[];
  checkinEnabled: boolean;

  setCurrentUser: (user: User | null) => void;
  setIsAuthenticated: (auth: boolean) => void;
  setAuthRestored: (restored: boolean) => void;
  setIsWorking: (working: boolean) => void;
  setTeamOfficeFilter: (offices: string[]) => void;
  setCheckinEnabled: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>(set => ({
  currentUser: null,
  isAuthenticated: false,
  authRestored: true,
  isWorking: false,
  teamOfficeFilter: [],
  checkinEnabled: false, // stays false until user settings are loaded from backend

  setCurrentUser: user => set({ currentUser: user }),
  setIsAuthenticated: auth => set({ isAuthenticated: auth }),
  setAuthRestored: restored => set({ authRestored: restored }),
  setIsWorking: working => set({ isWorking: working }),
  setTeamOfficeFilter: offices => set({ teamOfficeFilter: offices }),
  setCheckinEnabled: enabled => set({ checkinEnabled: enabled }),
}));
