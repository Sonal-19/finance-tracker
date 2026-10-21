import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AppUser = {
  id: number;
  name: string;
  email: string;
  username: string;
  taggedExpenses: "manual" | "auto";
  role: "user" | "admin";
  monthlyBudget: number | null;
};

interface AuthState {
  user: AppUser | null;
  setUser: (user: AppUser | null) => void;
  clearUser: () => void;
}

/** Cached profile so the app shell paints instantly on reload;
 * the /auth/me query remains the source of truth. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    { name: "ft-user", storage: createJSONStorage(() => localStorage) },
  ),
);
