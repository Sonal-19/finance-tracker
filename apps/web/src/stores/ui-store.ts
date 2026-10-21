import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Shell UI state. Only the sidebar choice is remembered across visits. */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** The keyboard shortcuts cheat sheet ("?"). */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: "ft-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
