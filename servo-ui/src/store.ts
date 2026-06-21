import { create } from 'zustand';

interface AppState {
  activeTabId: string;
  openedTabs: string[];
  setActiveTabId: (id: string) => void;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
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
}));
