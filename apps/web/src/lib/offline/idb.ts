import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { clear, createStore, del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";

/** One IndexedDB store for everything kept offline: the query cache, the
 * outbox of unsynced changes and form drafts. Values are stored by
 * structured clone, so Files (pending attachments) survive a reload. */
const store = createStore("finance-tracker", "kv");

/** zustand `persist` storage backed by IndexedDB (no JSON round trip). */
export function idbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) =>
      ((await get(name, store)) as StorageValue<S> | undefined) ?? null,
    setItem: (name, value) => set(name, value, store),
    removeItem: (name) => del(name, store),
  };
}

/** Saves the TanStack Query cache so every screen opens with its last data,
 * even with no connection. */
export const queryPersister = createAsyncStoragePersister({
  key: "query-cache",
  storage: {
    getItem: (key) => get(key, store),
    setItem: (key, value) => set(key, value, store),
    removeItem: (key) => del(key, store),
  },
  // IndexedDB clones objects itself; skip JSON (de)serialising the cache.
  serialize: (data) => data as never,
  deserialize: (data) => data as never,
  throttleTime: 1000,
});

/** Forget everything kept on this device (on logout or a different user). */
export const clearOfflineStore = () => clear(store);
