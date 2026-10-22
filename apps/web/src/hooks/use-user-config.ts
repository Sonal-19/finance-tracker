import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { usePublicConfig } from "@/hooks/use-passkeys";
import { api, call, callMsg } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import {
  type ThemeVars,
  useThemePreview,
  useThemeStore,
} from "@/stores/theme-store";
import { resolvePalette, THEME_MODES, themeCss } from "$/lib/utils/theme";

type ConfigPatch = NonNullable<Parameters<typeof api.profile.config.patch>[0]>;
export type UserConfig = NonNullable<
  Awaited<ReturnType<typeof fetchUserConfig>>
>;

const KEY = ["profile", "config"] as const;
const fetchUserConfig = () => call(api.profile.config.get());

/** The signed-in user's preferences (shortcuts, theme, dashboard). Cached
 * offline with everything else, and dropped with it for another user. */
export function useUserConfig() {
  const signedIn = useAuthStore((s) => !!s.user);
  return useQuery({
    queryKey: KEY,
    queryFn: fetchUserConfig,
    enabled: signedIn,
    // Short: the copy restored from IndexedDB on load may predate a change
    // made on another device (or one saved just before a reload).
    staleTime: 30_000,
  });
}

/** Saves some groups of the user's config; shown straight away. Keys inside
 * a group replace the saved ones and SHORTCUTS is replaced whole, like on
 * the server (`applyPatch`). */
export function useSaveUserConfig({ quiet = false } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ConfigPatch) =>
      callMsg(api.profile.config.patch(patch)),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      const before = qc.getQueryData<UserConfig>(KEY);
      if (before) {
        const next = { ...before } as Record<string, unknown>;
        for (const [group, value] of Object.entries(patch))
          next[group] =
            group === "SHORTCUTS"
              ? value
              : {
                  ...(before[group as keyof UserConfig] as object),
                  ...value,
                };
        qc.setQueryData(KEY, next);
      }
      return { before };
    },
    onSuccess: ({ message, data }) => {
      if (!quiet) toast.success(message);
      qc.setQueryData(KEY, data);
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before);
      toast.error(e.message);
    },
  });
}

/** Keeps <html> in the user's theme: the admin's colours, the user's own on
 * top (or whatever is being edited), and the account's mode. */
export function useThemeSync() {
  const admin = usePublicConfig().data?.theme;
  const signedIn = useAuthStore((s) => !!s.user);
  const config = useUserConfig().data;
  const user = signedIn ? config?.THEME : undefined;
  const preview = useThemePreview((s) => s.preview);
  const { setTheme, setSystemDark, setVars } = useThemeStore.getState();

  // The account's mode is applied when it changes (another device, or the
  // first load after logging in), so a choice made here offline stays put.
  useEffect(() => {
    if (user?.MODE) setTheme(user.MODE);
  }, [user?.MODE, setTheme]);
  useEffect(() => {
    if (user?.SYSTEM_DARK) setSystemDark(user.SYSTEM_DARK);
  }, [user?.SYSTEM_DARK, setSystemDark]);

  const vars = useMemo(() => {
    const a = preview && "admin" in preview ? preview.admin : admin;
    const u = preview && "user" in preview ? preview.user : user;
    return Object.fromEntries(
      THEME_MODES.map((m) => [m, themeCss(resolvePalette(m, a, u), m)]),
    ) as ThemeVars;
  }, [admin, user, preview]);
  const key = JSON.stringify(vars);
  useEffect(() => {
    if (JSON.stringify(useThemeStore.getState().vars) !== key) setVars(vars);
  }, [key]);
}

/** The device's light/dark choice; saved to the account when signed in, so
 * the user's other devices follow. */
export function useThemeChoice() {
  const theme = useThemeStore((s) => s.theme);
  const systemDark = useThemeStore((s) => s.systemDark);
  const signedIn = useAuthStore((s) => !!s.user);
  const save = useSaveUserConfig({ quiet: true });
  return {
    theme,
    systemDark,
    setTheme: (MODE: typeof theme) => {
      useThemeStore.getState().setTheme(MODE);
      if (signedIn) save.mutate({ THEME: { MODE } });
    },
    setSystemDark: (SYSTEM_DARK: typeof systemDark) => {
      useThemeStore.getState().setSystemDark(SYSTEM_DARK);
      if (signedIn) save.mutate({ THEME: { SYSTEM_DARK } });
    },
  };
}
