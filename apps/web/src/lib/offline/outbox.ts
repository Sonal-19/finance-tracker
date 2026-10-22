import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Transfer, TransferInput } from "@/hooks/use-accounts";
import type { Txn, TxnInput } from "@/hooks/use-finance";
import type { SettlementInput, Split, SplitInput } from "@/hooks/use-splits";
import { idbStorage } from "./idb";

// The outbox: every change to daily entries (transactions, transfers, splits,
// settlements) lands here first, is shown straight away by patching the
// query cache (optimistic.ts), and is sent to the server in order by the sync
// engine (sync.ts). It lives in IndexedDB, so changes made offline survive a
// reload or a closed tab and go out when the connection is back - the same
// local-first model as Docs or Figma: apply locally, queue the operation,
// replay it against the server, then pull the server's view.

/** A row made offline that the server hasn't confirmed yet. */
export type SyncMark = { _sync?: "pending" };

export type OpData =
  | { kind: "txn.create"; tempId: number; body: TxnInput; files?: File[] }
  | {
      kind: "txn.update";
      id: number;
      body: TxnInput;
      /** The row as the server last sent it (base for conflict checks). */
      prev: Txn;
      files?: File[];
    }
  | { kind: "txn.delete"; id: number; prev: Txn | null }
  /** Attachments for an entry that is already saved. */
  | { kind: "txn.files"; id: number; files: File[] }
  | { kind: "transfer.create"; tempId: number; body: TransferInput }
  | { kind: "transfer.delete"; id: number; prev: Transfer | null }
  | { kind: "split.create"; tempId: number; body: SplitInput }
  | { kind: "split.update"; id: number; body: SplitInput; prev: Split | null }
  | { kind: "split.delete"; id: number; prev: Split | null }
  | { kind: "settlement.create"; tempId: number; body: SettlementInput }
  | { kind: "settlement.delete"; id: number };

export type Op = OpData & {
  /** Also the `clientId` of a create, so a retry can't save it twice. */
  opId: string;
  /** When the user made the change (sent as `editedAt` on edits). */
  at: string;
  /** Short description for the sync panel, e.g. "Expense ₹250 · Food". */
  label: string;
  status: "pending" | "failed";
  error?: string;
  /** Send without the conflict check ("use mine" after a conflict). */
  force?: boolean;
};

interface OutboxState {
  ops: Op[];
  /** Temporary (negative) id → id the server gave it. */
  idMap: Record<string, number>;
  /** `kind:id` → the `updatedAt` the server gave this device's own last
   * write of that row, so the next edit isn't taken for someone else's. */
  confirmed: Record<string, string>;
  /** Whose changes these are; another login clears them. */
  ownerId: number | null;
  /** Last time this device had everything pushed and fresh data pulled. */
  lastSyncedAt: number | null;
  /** Not persisted: */
  online: boolean;
  syncing: boolean;
  inFlight: string | null;
  hydrated: boolean;
  set: (patch: Partial<OutboxState>) => void;
  update: (fn: (ops: Op[]) => Op[]) => void;
}

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      ops: [],
      idMap: {},
      confirmed: {},
      ownerId: null,
      lastSyncedAt: null,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      syncing: false,
      inFlight: null,
      hydrated: false,
      set: (patch) => set(patch),
      update: (fn) => set((s) => ({ ops: fn(s.ops) })),
    }),
    {
      name: "outbox",
      storage: idbStorage(),
      partialize: (s) =>
        ({
          ops: s.ops,
          idMap: s.idMap,
          confirmed: s.confirmed,
          ownerId: s.ownerId,
          lastSyncedAt: s.lastSyncedAt,
        }) as OutboxState,
      onRehydrateStorage: () => () => useOutbox.setState({ hydrated: true }),
    },
  ),
);

/** The server id for a temporary one, once its create has synced. */
export function realId(id: number): number | null {
  if (id > 0) return id;
  return useOutbox.getState().idMap[id] ?? null;
}

/** Negative ids mark rows that only exist on this device so far. */
export const newTempId = () => -(Math.floor(Math.random() * 2 ** 30) + 1);

export const opTargetId = (op: Op): number | null =>
  "tempId" in op ? op.tempId : "id" in op ? op.id : null;
