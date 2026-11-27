import { create } from "zustand";
import type { Currency, Txn, TxnType } from "@/hooks/use-finance";

/** Defaults for a new transaction opened from a specific account, event or book page. */
export type TxnPrefill = {
  accountId?: number;
  eventId?: number;
  bookId?: number;
  /** Stored amount to start with (e.g. what is still owed in a book). */
  amount?: number;
  note?: string;
  /** Preselects the category with this name, when the user has one. */
  categoryName?: string;
  /** Preselects this category (wins over `categoryName`). */
  categoryId?: number;
  /** yyyy-MM-dd; today when absent. */
  date?: string;
  /** `amount` is in this currency (a scanned dollar receipt). */
  currency?: Currency;
  /** Files to attach, e.g. the scanned receipt. */
  files?: File[];
};

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
