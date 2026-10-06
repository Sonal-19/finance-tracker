import { BookOpen, Check, ChevronDown } from "lucide-react";
import { CategoryIcon } from "@/components/common/category-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveBooks, useBookScope } from "@/hooks/use-books";
import { useBookStore } from "@/stores/book-store";

/**
 * Header control that narrows the dashboard, transactions, reports and
 * budgets to one book. Hidden while the user only has one book.
 */
export function BookSwitcher() {
  const { list } = useActiveBooks();
  const { book } = useBookScope();
  const setBookId = useBookStore((s) => s.setBookId);
  if (list.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch book"
        className="flex h-9 max-w-32 items-center sm:max-w-44 gap-2 rounded-full border bg-card pr-2.5 pl-1.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {book ? (
          <CategoryIcon
            icon={book.icon}
            color={book.color}
            className="size-6 [&_svg]:size-3.5"
          />
        ) : (
          <span className="grid size-6 place-items-center rounded-full bg-muted">
            <BookOpen className="size-3.5" />
          </span>
        )}
        <span className="truncate">{book?.name ?? "All books"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Show entries from</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setBookId(null)}>
          <span className="grid size-6 place-items-center rounded-full bg-muted">
            <BookOpen className="size-3.5" />
          </span>
          <span className="flex-1">
            All books
            <span className="block text-xs text-muted-foreground">
              Totals skip books kept separate
            </span>
          </span>
          {!book && <Check className="size-4" />}
        </DropdownMenuItem>
        {list.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => setBookId(b.id)}>
            <CategoryIcon
              icon={b.icon}
              color={b.color}
              className="size-6 [&_svg]:size-3.5"
            />
            <span className="flex-1 truncate">
              {b.name}
              {b.totals === "separate" && (
                <span className="block text-xs text-muted-foreground">
                  Kept separate
                </span>
              )}
            </span>
            {book?.id === b.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
