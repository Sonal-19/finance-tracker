import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type DarkStyle,
  resolvePalette,
  type ThemeChoice,
  type ThemeColors,
  type ThemeMode,
  themeCss,
} from "$/lib/utils/theme";

export type Theme = ThemeChoice;
export type ThemeVars = Record<ThemeMode, Record<string, string>>;

interface ThemeState {
  /** This device's choice; follows the account's `THEME.MODE` once loaded. */
  theme: Theme;
  /** Which dark mode "system" switches to. */
  systemDark: DarkStyle;
  /** Resolved CSS variables per mode, kept so the first paint (index.html)
   * uses the right colours before anything loads. */
  vars: ThemeVars | null;
  setTheme: (t: Theme) => void;
  setSystemDark: (d: DarkStyle) => void;
  setVars: (vars: ThemeVars) => void;
}

const mql = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The code defaults, for before any config has loaded. */
export const defaultVars = (): ThemeVars => ({
  light: themeCss(resolvePalette("light", null), "light"),
  dark: themeCss(resolvePalette("dark", null), "dark"),
  amoled: themeCss(resolvePalette("amoled", null), "amoled"),
});

/** The mode a choice shows right now. */
export function modeOf(theme: Theme, systemDark: DarkStyle): ThemeMode {
  if (theme !== "system") return theme;
  return mql().matches ? systemDark : "light";
}

/** Puts a mode's colours on <html>. Keep in step with the script in index.html. */
export function applyTheme(
  theme = useThemeStore.getState().theme,
  systemDark = useThemeStore.getState().systemDark,
  vars = useThemeStore.getState().vars ?? defaultVars(),
) {
  const mode = modeOf(theme, systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", mode !== "light");
  root.dataset.theme = mode;
  for (const [name, value] of Object.entries(vars[mode]))
    root.style.setProperty(name, value);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      mode === "light" ? vars.light["--primary"]! : vars[mode]["--background"]!,
    );
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      systemDark: "dark",
      vars: null,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme, get().systemDark, get().vars ?? undefined);
      },
      setSystemDark: (systemDark) => {
        set({ systemDark });
        applyTheme(get().theme, systemDark, get().vars ?? undefined);
      },
      setVars: (vars) => {
        set({ vars });
        applyTheme(get().theme, get().systemDark, vars);
      },
    }),
    { name: "ft-theme", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Keep "system" in sync with OS changes. */
if (typeof window !== "undefined") {
  mql().addEventListener("change", () => {
    if (useThemeStore.getState().theme === "system") applyTheme();
  });
}

/** Whether a choice shows one of the dark modes right now. */
export const isDarkChoice = (t: Theme, systemDark: DarkStyle) =>
  modeOf(t, systemDark) !== "light";

/** Colours being edited (Settings, System config), shown across the whole
 * app until saved or abandoned. Not persisted. */
export const useThemePreview = create<{
  preview: { admin?: ThemeColors | null; user?: ThemeColors | null } | null;
  setPreview: (
    p: { admin?: ThemeColors | null; user?: ThemeColors | null } | null,
  ) => void;
}>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
