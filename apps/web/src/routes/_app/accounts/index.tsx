import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, ChevronRight, Plus, Star } from "lucide-react";
import { useState } from "react";
import {
  AccountSheet,
  type EditableAccount,
  TransferSheet,
} from "@/components/accounts/account-sheets";
import { CategoryIcon } from "@/components/common/category-icon";
import { PageHeader } from "@/components/common/page-header";
import { PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { type Account, useAccounts } from "@/hooks/use-accounts";
import { accountTypeLabel } from "@/lib/accounts";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/accounts/")({
  component: AccountsPage,
});

function AccountRow({ a }: { a: Account }) {
  const isCard = a.type === "credit_card";
  return (
    <Link
      to="/accounts/$accountId"
      params={{ accountId: String(a.id) }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 active:bg-muted md:hover:bg-muted/60",
        a.status === "archived" && "opacity-60",
      )}
    >
      <CategoryIcon icon={a.icon} color={a.color} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {a.name}
          {a.defaultSince && (
            <Star
              className="size-3.5 fill-warning text-warning"
              aria-label="Default payment method"
            />
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {accountTypeLabel(a.type)}
          {a.status === "archived" && " · archived"}
        </p>
      </div>
      <div className="text-right">
        {isCard && a.balance < 0 && (
          <p className="text-[11px] text-muted-foreground">outstanding</p>
        )}
        <p
          className={cn(
            "tabular font-semibold",
            a.balance < 0 ? "text-expense" : "text-foreground",
          )}
        >
          {money(isCard && a.balance < 0 ? -a.balance : a.balance)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function AccountsPage() {
  const { data, isLoading } = useAccounts();
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const accounts = data?.accounts ?? [];
  const active = accounts.filter((a) => a.status === "active");
  const archived = accounts.filter((a) => a.status === "archived");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payment methods"
        description="Your bank accounts, UPI, cash, cards and wallets — what you pay with and what's in each."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(true)}
              disabled={active.length < 2}
            >
              <ArrowLeftRight /> Transfer
            </Button>
            <Button
              onClick={() =>
                setEditing({
                  name: "",
                  type: "bank",
                  icon: "landmark",
                  color: "#2563eb",
                  openingBalance: 0,
                })
              }
            >
              <Plus /> Add payment method
            </Button>
          </>
        }
      />

      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-teal-800 p-5 text-white shadow-lg shadow-teal-900/20 dark:from-teal-700 dark:to-teal-950">
            <p className="text-sm text-white/80">
              Total balance · {active.length} payment methods
            </p>
            <p className="tabular mt-1 text-3xl font-bold">
              {money(data.total)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-white/75">You have</p>
                <p className="tabular font-semibold">{money(data.assets)}</p>
              </div>
              <div>
                <p className="text-white/75">You owe (cards etc.)</p>
                <p className="tabular font-semibold">
                  {money(data.liabilities)}
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {active.map((a) => (
              <AccountRow key={a.id} a={a} />
            ))}
          </div>

          {archived.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                className="text-sm font-medium text-primary"
                onClick={() => setShowArchived((s) => !s)}
              >
                {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </button>
              {showArchived && (
                <div className="divide-y overflow-hidden rounded-2xl border bg-card">
                  {archived.map((a) => (
                    <AccountRow key={a.id} a={a} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <AccountSheet value={editing} onClose={() => setEditing(null)} />
      <TransferSheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
      />
    </div>
  );
}
