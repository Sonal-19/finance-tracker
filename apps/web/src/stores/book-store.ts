import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** The header's book switcher: one book, or `null` for all books. */
interface BookState {
  bookId: number | null;
  setBookId: (id: number | null) => void;
}

export const useBookStore = create<BookState>()(
  persist(
    (set) => ({
      bookId: null,
      setBookId: (bookId) => set({ bookId }),
    }),
    { name: "ft-book", storage: createJSONStorage(() => localStorage) },
  ),
);
