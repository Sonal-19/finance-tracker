import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";
import { useBookStore } from "@/stores/book-store";

export const useBooks = () =>
  useQuery({ queryKey: ["books"], queryFn: () => call(api.books.get()) });
export type Book = NonNullable<ReturnType<typeof useBooks>["data"]>[number];

export const useBook = (id: number) =>
  useQuery({
    queryKey: ["books", id],
    queryFn: () => call(api.books({ id }).get()),
  });

/** Active books, default first — for pickers. */
export function useActiveBooks() {
  const q = useBooks();
  const list = (q.data ?? []).filter((b) => b.status === "active");
  return {
    ...q,
    list,
    defaultBook: list.find((b) => b.defaultSince) ?? list[0],
  };
}

/**
 * The book chosen in the header switcher, or `undefined` for "All books"
 * (also when the stored book was archived or deleted).
 */
export function useBookScope() {
  const selected = useBookStore((s) => s.bookId);
  const { list } = useActiveBooks();
  const book = list.find((b) => b.id === selected);
  return { bookId: book?.id, book };
}

function useInvalidateBooks() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        "books",
        "transactions",
        "reports",
        "budgets",
        "recurring",
        "splits",
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}
const onError = (e: Error) => toast.error(e.message);

export type BookInput = {
  name: string;
  icon: string;
  color: string;
  note?: string | null;
  totals: Book["totals"];
};

export function useSaveBook() {
  const invalidate = useInvalidateBooks();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: Partial<BookInput> & { id?: number; status?: Book["status"] }) => {
      if (id) return callMsg(api.books({ id }).patch(body));
      return callMsg(api.books.post(body as BookInput));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useMakeDefaultBook() {
  const invalidate = useInvalidateBooks();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.books({ id }).default.post()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteBook() {
  const invalidate = useInvalidateBooks();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.books({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}
