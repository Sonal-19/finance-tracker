import { create } from "zustand";

export type ScanSource = "camera" | "gallery";

/** The receipt scanner overlay. Its code loads only the first time it opens. */
interface ScanState {
  open: boolean;
  /** Bumped on every open so the overlay starts fresh. */
  session: number;
  /** A file handed over directly (paste, drop, share), skipping the picker. */
  file: File | null;
  openScan: (file?: File | null) => void;
  close: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  open: false,
  session: 0,
  file: null,
  openScan: (file = null) =>
    set((s) => ({ open: true, session: s.session + 1, file })),
  close: () => set({ open: false, file: null }),
}));
