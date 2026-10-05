import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, HandCoins, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import { GroupSheet } from "@/components/split/group-sheet";
import {
  SettleSheet,
  type SettleTarget,
} from "@/components/split/settle-sheet";
import { BalanceLabel, PersonAvatar } from "@/components/split/split-common";
import { SplitRow } from "@/components/split/split-row";
import { Button } from "@/components/ui/button";
import {
  type GroupInput,
  useDeleteGroup,
  useSplitGroup,
} from "@/hooks/use-splits";
import { formatAmount } from "@/lib/format";
import { useSplitSheet } from "@/stores/split-sheet-store";

export const Route = createFileRoute("/_app/split/groups/$groupId")({
  component: GroupPage,
});

function GroupPage() {
  const { groupId } = Route.useParams();
  const id = Number(groupId);
  const { data, isLoading, error } = useSplitGroup(id);
  const navigate = useNavigate();
  const openSplit = useSplitSheet((s) => s.openNew);
  const del = useDeleteGroup();
  const [editing, setEditing] = useState<(GroupInput & { id?: number }) | null>(
    null,
  );
  const [settle, setSettle] = useState<SettleTarget | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !data)
    return <ErrorState error={error ?? new Error("Not found")} />;
  const { group, members, splits } = data;

  return (
    <div className="space-y-5">
      <Link
        to="/split"
        search={{ tab: "groups" }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Groups
      </Link>

      <div className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <CategoryIcon
            icon={group.icon}
            color={group.color}
            size="lg"
            className="size-14"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{group.name}</h1>
            <p className="text-sm text-muted-foreground">
              You + {members.length}{" "}
              {members.length === 1 ? "person" : "people"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit group"
            onClick={() =>
              setEditing({
                id: group.id,
                name: group.name,
                icon: group.icon,
                color: group.color,
                memberIds: members.map((m) => m.id),
              })
            }
          >
            <Pencil />
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">Group spent</p>
            <p className="tabular font-bold">{formatAmount(data.totalSpent)}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">Your share</p>
            <p className="tabular font-bold">
              {formatAmount(data.myTotalShare)}
            </p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">Paid by you</p>
            <p className="tabular font-bold">{formatAmount(data.paidByMe)}</p>
          </div>
        </div>
        <Button
          size="lg"
          className="mt-4 w-full"
          onClick={() => openSplit({ groupId: group.id })}
        >
          <Plus /> Add group expense
        </Button>
      </div>

      <section className="space-y-2">
        <div>
          <h2 className="font-semibold">Balances</h2>
          <p className="text-xs text-muted-foreground">
            Overall, across all groups and shared bills.
          </p>
        </div>
        {members.length === 0 ? (
          <EmptyState title="No members">
            Edit the group to add people.
          </EmptyState>
        ) : (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Link
                  to="/split/people/$personId"
                  params={{ personId: String(m.id) }}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <PersonAvatar name={m.name} id={m.id} />
                  <span className="truncate font-medium">{m.name}</span>
                </Link>
                <BalanceLabel net={m.balance.net} />
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Settle up with ${m.name}`}
                  disabled={Math.abs(m.balance.net) < 0.005}
                  onClick={() =>
                    setSettle({
                      personId: m.id,
                      name: m.name,
                      net: m.balance.net,
                      groupId: group.id,
                    })
                  }
                >
                  <HandCoins />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Expenses</h2>
        {splits.length === 0 ? (
          <EmptyState title="No expenses in this group yet" />
        ) : (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {splits.map((s) => (
              <SplitRow key={s.id} split={s} />
            ))}
          </div>
        )}
      </section>

      <Button
        variant="ghost"
        className="w-full text-destructive"
        onClick={async () => {
          if (
            await confirm({
              title: `Delete "${group.name}"?`,
              description:
                "Its expenses and balances are kept, just not grouped.",
              confirmText: "Delete",
              destructive: true,
            })
          )
            del.mutate(group.id, {
              onSuccess: () =>
                navigate({ to: "/split", search: { tab: "groups" } }),
            });
        }}
      >
        <Trash2 /> Delete group
      </Button>

      <GroupSheet value={editing} onClose={() => setEditing(null)} />
      <SettleSheet value={settle} onClose={() => setSettle(null)} />
    </div>
  );
}
