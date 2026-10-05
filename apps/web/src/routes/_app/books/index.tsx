import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { BookSheet, type EditableBook } from "@/components/books/book-sheet";
import { CategoryIcon } from "@/components/common/category-icon";
import { PageHeader } from "@/components/common/page-header";
import { PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { type Book, useBooks } from "@/hooks/use-books";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/books/")({
  component: BooksPage,
});

function BookCard({ b }: { b: Book }) {
  const separate = b.totals === "separate";
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: String(b.id) }}
      className={cn(
        "block min-w-0 rounded-2xl border bg-card p-4 transition-shadow active:bg-muted md:hover:shadow-md",
        b.status === "archived" && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={b.icon} color={b.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <span className="truncate">{b.name}</span>
            {b.defaultSince && (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                DEFAULT
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              b.status === "archived" ? "Archived" : null,
              separate ? "Kept separate" : "In my totals",
              `${b.count} entries`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">
            {separate ? "to get back" : "spent"}
          </p>
          <p className="tabular font-semibold">
            {formatAmount(separate ? Math.max(b.outstanding, 0) : b.spent)}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}

function BooksPage() {
  const { data = [], isLoading } = useBooks();
  const [editing, setEditing] = useState<EditableBook | null>(null);
  const newBook = () =>
    setEditing({
      name: "",
      icon: "briefcase",
      color: "#d97706",
      totals: "included",
    });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Books"
        description="Separate ledgers for who the money was for: yourself, the family, the office."
        actions={
          <Button onClick={newBook}>
            <Plus /> New book
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((b) => (
            <BookCard key={b.id} b={b} />
          ))}
        </div>
      )}
      {data.length === 1 && (
        <p className="text-sm text-muted-foreground">
          Paying for the office or the family from your own pocket? Add a book
          for it, then pick the book when you add an expense.
        </p>
      )}
      <BookSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
