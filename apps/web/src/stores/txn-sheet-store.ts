import { create } from "zustand";
import type { Txn, TxnType } from "@/hooks/use-finance";

/** Defaults for a new transaction opened from a specific account or event page. */
export type TxnPrefill = { accountId?: number; eventId?: number };

/** Global add/edit transaction sheet so the FAB, dashboard and lists share one form. */
interface TxnSheetState {
  open: boolean;
  editing: Txn | null;
  defaultType: TxnType;
  prefill: TxnPrefill;
  openNew: (type?: TxnType, prefill?: TxnPrefill) => void;
  openEdit: (t: Txn) => void;
  close: () => void;
}

export const useTxnSheet = create<TxnSheetState>((set) => ({
  open: false,
  editing: null,
  defaultType: "debit",
  prefill: {},
  openNew: (type = "debit", prefill = {}) =>
    set({ open: true, editing: null, defaultType: type, prefill }),
  openEdit: (t) => set({ open: true, editing: t, prefill: {} }),
  close: () => set({ open: false }),
}));
