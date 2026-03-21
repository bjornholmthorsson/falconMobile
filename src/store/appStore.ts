import { create } from 'zustand';
import type { User } from '../models';
import type { Office } from '../services/graphService';

interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  selectedOffice: Office;
  isWorking: boolean;

  setCurrentUser: (user: User | null) => void;
  setIsAuthenticated: (auth: boolean) => void;
  setSelectedOffice: (office: Office) => void;
  setIsWorking: (working: boolean) => void;
}

export const useAppStore = create<AppState>(set => ({
  currentUser: null,
  isAuthenticated: false,
  selectedOffice: 'Amsterdam',
  isWorking: false,

  setCurrentUser: user => set({ currentUser: user }),
  setIsAuthenticated: auth => set({ isAuthenticated: auth }),
  setSelectedOffice: office => set({ selectedOffice: office }),
  setIsWorking: working => set({ isWorking: working }),
}));
