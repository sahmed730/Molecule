import { create } from 'zustand';

interface AppState {
  activeTabId: string;
  openedTabs: string[];
  setActiveTabId: (id: string) => void;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  
  // Auth & Project State
  user: { id: string, email: string } | null;
  token: string | null;
  projectId: string | null;
  setAuth: (user: { id: string, email: string }, token: string) => void;
  logout: () => void;
  setProjectId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTabId: 'canvas',
  openedTabs: [],
  setActiveTabId: (id) => set({ activeTabId: id }),
  openTab: (id) => set((state) => {
    if (state.openedTabs.includes(id)) {
      return { activeTabId: id };
    }
    return { openedTabs: [...state.openedTabs, id], activeTabId: id };
  }),
  closeTab: (id) => set((state) => {
    const newTabs = state.openedTabs.filter((t) => t !== id);
    let nextActiveId = state.activeTabId;
    if (state.activeTabId === id) {
      nextActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1] : 'canvas';
    }
    return { openedTabs: newTabs, activeTabId: nextActiveId };
  }),

  // Auth & Project Implementation
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null,
  token: localStorage.getItem('token') || null,
  projectId: null,
  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null, projectId: null, activeTabId: 'canvas', openedTabs: [] });
  },
  setProjectId: (id) => set({ projectId: id })
}));
