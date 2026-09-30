import { create } from "zustand";

/** Prefill for a new split (from a group, a person, or an existing transaction). */
export type SplitPrefill = {
  groupId?: number;
  personId?: number;
  fromTransaction?: {
    id: number;
    amount: number;
    date: string;
    categoryId: number;
    note: string | null;
    categoryName: string;
    accountId: number;
    eventId: number | null;
  };
};

interface SplitSheetState {
  open: boolean;
  editId: number | null;
  prefill: SplitPrefill;
  openNew: (prefill?: SplitPrefill) => void;
  openEdit: (id: number) => void;
  close: () => void;
}

/** Global add/edit split sheet, reachable from anywhere (group, person, transaction). */
export const useSplitSheet = create<SplitSheetState>((set) => ({
  open: false,
  editId: null,
  prefill: {},
  openNew: (prefill = {}) => set({ open: true, editId: null, prefill }),
  openEdit: (id) => set({ open: true, editId: id, prefill: {} }),
  close: () => set({ open: false }),
}));
