import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbStorage } from "@/lib/offline/idb";

/**
 * Half-filled forms, kept until they're saved or cleared. Closing a sheet by
 * tapping outside it (or a reload, or the app being killed) loses nothing:
 * reopening it carries on where you left off. Stored in IndexedDB, so picked
 * files are kept too.
 */
export type Draft<T = unknown> = {
  value: T;
  /** Files picked but not uploaded yet. */
  files: File[];
  /** For an edit: the row's `updatedAt` the draft started from. A draft for
   * an older version of the row is dropped instead of restored. */
  base?: string;
  at: number;
};

interface DraftState {
  drafts: Record<string, Draft>;
  /** Whose drafts these are; another login drops them (`claimDevice`). */
  ownerId: number | null;
  put: (key: string, draft: Partial<Draft> & { value: unknown }) => void;
  clear: (key: string) => void;
}

/** Drafts older than this are dropped (a week). */
const MAX_AGE = 7 * 24 * 60 * 60_000;

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      ownerId: null,
      put: (key, draft) =>
        set((s) => ({
          drafts: {
            ...s.drafts,
            [key]: { files: [], ...s.drafts[key], ...draft, at: Date.now() },
          },
        })),
      clear: (key) =>
        set((s) => {
          const { [key]: _gone, ...rest } = s.drafts;
          return { drafts: rest };
        }),
    }),
    {
      name: "drafts",
      storage: idbStorage(),
      partialize: (s) =>
        ({ drafts: s.drafts, ownerId: s.ownerId }) as DraftState,
      merge: (persisted, current) => {
        const saved = persisted as Partial<DraftState> | undefined;
        const drafts = saved?.drafts ?? {};
        const fresh = Object.fromEntries(
          Object.entries(drafts).filter(([, d]) => Date.now() - d.at < MAX_AGE),
        );
        return { ...current, drafts: fresh, ownerId: saved?.ownerId ?? null };
      },
    },
  ),
);

export const getDraft = <T>(key: string) =>
  useDraftStore.getState().drafts[key] as Draft<T> | undefined;

/**
 * A form's state, living in the draft store under `key` (like `useState`,
 * but it outlives the component). `fallback` is shown until a draft exists.
 */
export function useDraft<T>(key: string, fallback: T) {
  const draft = useDraftStore((s) => s.drafts[key]) as Draft<T> | undefined;
  const put = useDraftStore((s) => s.put);
  const value = draft?.value ?? fallback;
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = (getDraft<T>(key)?.value ?? fallback) as T;
      put(key, {
        value: typeof next === "function" ? (next as (p: T) => T)(prev) : next,
      });
    },
    // `fallback` is only a placeholder; the stored draft is the truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, put],
  );
  const setFiles = useCallback(
    (files: File[]) =>
      put(key, { value: getDraft<T>(key)?.value ?? fallback, files }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, put],
  );
  return {
    value,
    setValue,
    files: draft?.files ?? [],
    setFiles,
    draft,
  };
}
