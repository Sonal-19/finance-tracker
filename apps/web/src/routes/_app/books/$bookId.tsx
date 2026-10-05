import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  HandCoins,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@/components/app/section-card";
import { type EditableBook, BookSheet } from "@/components/books/book-sheet";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CategoryIcon } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import { GroupedTransactions } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import {
  useBook,
  useDeleteBook,
  useMakeDefaultBook,
  useSaveBook,
} from "@/hooks/use-books";
import { useTransactions } from "@/hooks/use-finance";
import { money } from "@/lib/format";
import { useTxnSheet } from "@/stores/txn-sheet-store";

export const Route = createFileRoute("/_app/books/$bookId")({
  component: BookPage,
});

function BookPage() {
  const id = Number(Route.useParams().bookId);
  const { data, isLoading, error } = useBook(id);
  const txns = useTransactions({ bookId: id });
  const save = useSaveBook();
  const makeDefault = useMakeDefaultBook();
  const del = useDeleteBook();
  const openNew = useTxnSheet((s) => s.openNew);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<EditableBook | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !data)
    return <ErrorState error={error ?? new Error("Not found")} />;
  const { book: b, byCategory } = data;
  const separate = b.totals === "separate";
  const archived = b.status === "archived";
  const pages = txns.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const dayTotals = Object.assign({}, ...pages.map((p) => p.dayTotals));

  return (
    <div className="space-y-5">
      <Link
        to="/books"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Books
      </Link>

      <div className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <CategoryIcon
            icon={b.icon}
            color={b.color}
            size="lg"
            className="size-14"
          />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-xl font-bold">
              {b.name}
              {b.defaultSince && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  DEFAULT
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {archived
                ? "Archived"
                : separate
                  ? "Kept separate from my totals"
                  : "Counts in my totals"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit book"
            onClick={() =>
              setEditing({
                id: b.id,
                name: b.name,
                icon: b.icon,
                color: b.color,
                note: b.note,
                totals: b.totals,
              })
            }
          >
            <Pencil />
          </Button>
        </div>

        {separate ? (
          <>
            <div className="mt-5 text-center">
              <p className="text-sm text-muted-foreground">
                {b.outstanding < 0 ? "Received extra" : "Yet to get back"}
              </p>
              <p className="tabular text-3xl font-bold">
                {money(Math.abs(b.outstanding))}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="tabular font-semibold text-expense">
                  −{money(b.spent)}
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-xs text-muted-foreground">Received back</p>
                <p className="tabular font-semibold text-income">
                  +{money(b.received)}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 text-center">
            <p className="text-sm text-muted-foreground">Spent in this book</p>
            <p className="tabular text-3xl font-bold">{money(b.spent)}</p>
            <p className="text-xs text-muted-foreground">
              {b.count} entries
              {b.received > 0 && ` · received ${money(b.received)}`}
            </p>
          </div>
        )}
        {b.note && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {b.note}
          </p>
        )}

        {!archived && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => openNew("credit", { bookId: b.id })}
            >
              {separate ? (
                <>
                  <HandCoins /> Received back
                </>
              ) : (
                <>
                  <Plus /> Add income
                </>
              )}
            </Button>
            <Button onClick={() => openNew("debit", { bookId: b.id })}>
              <Plus /> Add expense
            </Button>
          </div>
        )}
      </div>

      {byCategory.length > 0 && (
        <SectionCard title="Spent by category">
          <CategoryDonut rows={byCategory} compact />
        </SectionCard>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Transactions</h2>
        {items.length === 0 ? (
          <EmptyState title="Nothing in this book yet">
            Tap “Add expense”, or pick this book when adding a transaction.
          </EmptyState>
        ) : (
          <GroupedTransactions items={items} dayTotals={dayTotals} />
        )}
        {txns.hasNextPage && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => txns.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </section>

      {!b.defaultSince && (
        <div className="grid gap-2 sm:grid-cols-3">
          {!archived && (
            <Button variant="ghost" onClick={() => makeDefault.mutate(b.id)}>
              <Star /> Make default
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() =>
              save.mutate({
                id: b.id,
                status: archived ? "active" : "archived",
              })
            }
          >
            {archived ? (
              <>
                <ArchiveRestore /> Restore
              </>
            ) : (
              <>
                <Archive /> Archive
              </>
            )}
          </Button>
          {b.usage === 0 && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Delete "${b.name}"?`,
                    confirmText: "Delete",
                    destructive: true,
                  })
                )
                  del.mutate(b.id, {
                    onSuccess: () => navigate({ to: "/books" }),
                  });
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      )}

      <BookSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
