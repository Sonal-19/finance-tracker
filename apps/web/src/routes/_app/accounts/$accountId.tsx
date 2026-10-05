import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowLeftRight,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AccountSheet,
  type EditableAccount,
  TransferSheet,
} from "@/components/accounts/account-sheets";
import { CategoryIcon } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Spinner,
} from "@/components/common/states";
import { GroupedTransactions } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import {
  useAccount,
  useDeleteAccount,
  useDeleteTransfer,
  useMakeDefaultAccount,
  useSaveAccount,
  useTransfers,
} from "@/hooks/use-accounts";
import { useSummary, useTransactions } from "@/hooks/use-finance";
import { accountTypeLabel } from "@/lib/accounts";
import { formatAmount, shortDate, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

export const Route = createFileRoute("/_app/accounts/$accountId")({
  component: AccountPage,
});

function AccountPage() {
  const id = Number(Route.useParams().accountId);
  const { data: a, isLoading, error } = useAccount(id);
  const month = useSummary({
    period: "month",
    date: todayStr(),
    accountId: id,
  });
  const transfers = useTransfers(id);
  const txns = useTransactions({ accountId: id });
  const save = useSaveAccount();
  const makeDefault = useMakeDefaultAccount();
  const del = useDeleteAccount();
  const delTransfer = useDeleteTransfer();
  const openNew = useTxnSheet((s) => s.openNew);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [tab, setTab] = useState<"transactions" | "transfers">("transactions");

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          txns.hasNextPage &&
          !txns.isFetchingNextPage
        )
          txns.fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [txns]);

  if (isLoading) return <PageLoader />;
  if (error || !a)
    return <ErrorState error={error ?? new Error("Not found")} />;
  const isCard = a.type === "credit_card";
  const pages = txns.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const dayTotals = Object.assign({}, ...pages.map((p) => p.dayTotals));
  const m = month.data?.current;

  return (
    <div className="space-y-5">
      <Link
        to="/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Accounts
      </Link>

      <div className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <CategoryIcon
            icon={a.icon}
            color={a.color}
            size="lg"
            className="size-14"
          />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 truncate text-xl font-bold">
              {a.name}
              {a.defaultSince && (
                <Star
                  className="size-4 fill-warning text-warning"
                  aria-label="Default payment method"
                />
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {accountTypeLabel(a.type)}
              {a.status === "archived" && " · archived"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit payment method"
            onClick={() =>
              setEditing({
                id: a.id,
                name: a.name,
                type: a.type,
                icon: a.icon,
                color: a.color,
                // The form shows card dues as a positive "outstanding" amount.
                openingBalance: isCard
                  ? Math.abs(a.openingBalance)
                  : a.openingBalance,
              })
            }
          >
            <Pencil />
          </Button>
        </div>
        <div className="mt-5 text-center">
          <p className="text-sm text-muted-foreground">
            {isCard && a.balance < 0 ? "Outstanding" : "Balance"}
          </p>
          <p
            className={cn(
              "tabular text-3xl font-bold",
              a.balance < 0 && !isCard && "text-expense",
            )}
          >
            {formatAmount(isCard && a.balance < 0 ? -a.balance : a.balance)}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted p-2.5">
            <p className="text-[11px] text-muted-foreground">In · this month</p>
            <p className="tabular text-sm font-semibold text-income">
              {formatAmount(m?.income ?? 0)}
            </p>
          </div>
          <div className="rounded-xl bg-muted p-2.5">
            <p className="text-[11px] text-muted-foreground">
              Out · this month
            </p>
            <p className="tabular text-sm font-semibold text-expense">
              {formatAmount(m?.expense ?? 0)}
            </p>
          </div>
          <div className="rounded-xl bg-muted p-2.5">
            <p className="text-[11px] text-muted-foreground">Opening</p>
            <p className="tabular text-sm font-semibold">
              {formatAmount(a.openingBalance)}
            </p>
          </div>
        </div>
        {a.status === "active" && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={() => openNew("credit", { accountId: a.id })}
            >
              <Plus /> Add money
            </Button>
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight /> Transfer
            </Button>
            <Button onClick={() => openNew("debit", { accountId: a.id })}>
              <Plus /> Expense
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(["transactions", "transfers"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm capitalize",
              tab === t
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "transactions" ? (
        txns.isLoading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState title="No transactions with this payment method yet" />
        ) : (
          <>
            <GroupedTransactions items={items} dayTotals={dayTotals} />
            <div ref={sentinel} className="grid h-12 place-items-center">
              {txns.isFetchingNextPage && <Spinner />}
            </div>
          </>
        )
      ) : (transfers.data?.length ?? 0) === 0 ? (
        <EmptyState title="No transfers yet">
          Move money between payment methods with “Transfer”.
        </EmptyState>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {transfers.data!.map((t) => {
            const out = t.from.id === a.id;
            const other = out ? t.to : t.from;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <CategoryIcon icon={other.icon} color={other.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {out ? `To ${other.name}` : `From ${other.name}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[shortDate(t.date), t.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span
                  className={cn(
                    "tabular font-semibold",
                    out ? "text-foreground" : "text-income",
                  )}
                >
                  {out ? "−" : "+"}
                  {formatAmount(t.amount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete transfer"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete this transfer?",
                        confirmText: "Delete",
                        destructive: true,
                      })
                    )
                      delTransfer.mutate(t.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2 pt-2">
        {!a.defaultSince && a.status === "active" && (
          <Button variant="ghost" onClick={() => makeDefault.mutate(a.id)}>
            <Star /> Make default
          </Button>
        )}
        {!a.defaultSince && (
          <Button
            variant="ghost"
            onClick={() =>
              save.mutate({
                id: a.id,
                status: a.status === "archived" ? "active" : "archived",
              })
            }
          >
            {a.status === "archived" ? <ArchiveRestore /> : <Archive />}{" "}
            {a.status === "archived" ? "Restore" : "Archive"}
          </Button>
        )}
        {!a.defaultSince && a.usage === 0 && (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (
                await confirm({
                  title: `Delete ${a.name}?`,
                  confirmText: "Delete",
                  destructive: true,
                })
              )
                del.mutate(a.id, {
                  onSuccess: () => navigate({ to: "/accounts" }),
                });
            }}
          >
            <Trash2 /> Delete
          </Button>
        )}
      </div>

      <AccountSheet value={editing} onClose={() => setEditing(null)} />
      <TransferSheet
        open={transferOpen}
        fromId={a.id}
        onClose={() => setTransferOpen(false)}
      />
    </div>
  );
}
