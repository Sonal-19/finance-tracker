import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { SectionCard } from "@/components/app/section-card";
import { CategoryDonut } from "@/components/charts/category-donut";
import { ChartTooltip, EXPENSE_COLOR } from "@/components/charts/chart-tooltip";
import { CategoryIcon } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import { Progress } from "@/components/common/progress";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import {
  type EditableEvent,
  EventSheet,
} from "@/components/events/event-sheet";
import { GroupedTransactions } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { useDeleteEvent, useEvent, useSaveEvent } from "@/hooks/use-accounts";
import { useTransactions } from "@/hooks/use-finance";
import { dateRangeLabel } from "@/lib/accounts";
import { dayLabel, money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

export const Route = createFileRoute("/_app/events/$eventId")({
  component: EventPage,
});

function EventPage() {
  const id = Number(Route.useParams().eventId);
  const { data, isLoading, error } = useEvent(id);
  const txns = useTransactions({ eventId: id });
  const save = useSaveEvent();
  const del = useDeleteEvent();
  const openNew = useTxnSheet((s) => s.openNew);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<EditableEvent | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !data)
    return <ErrorState error={error ?? new Error("Not found")} />;
  const { event: e, byCategory, byDay } = data;
  const range = dateRangeLabel(e.startDate, e.endDate, shortDate);
  const pages = txns.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const dayTotals = Object.assign({}, ...pages.map((p) => p.dayTotals));

  return (
    <div className="space-y-5">
      <Link
        to="/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Events
      </Link>

      <div className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <CategoryIcon
            icon={e.icon}
            color={e.color}
            size="lg"
            className="size-14"
          />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-xl font-bold">
              {e.name}
              {e.isActive && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  LIVE
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {range ?? "No dates"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit event"
            onClick={() =>
              setEditing({
                id: e.id,
                name: e.name,
                icon: e.icon,
                color: e.color,
                startDate: e.startDate,
                endDate: e.endDate,
                budget: e.budget,
                note: e.note,
                isActive: e.isActive,
              })
            }
          >
            <Pencil />
          </Button>
        </div>

        <div className="mt-5 text-center">
          <p className="text-sm text-muted-foreground">Spent at this event</p>
          <p className="tabular text-3xl font-bold">{money(e.spent)}</p>
          <p className="text-xs text-muted-foreground">
            {e.count} entries
            {e.received > 0 && ` · received ${money(e.received)}`}
          </p>
        </div>
        {e.budget ? (
          <div className="mt-4 space-y-1.5">
            <Progress value={e.spent} max={e.budget} className="h-3" />
            <p
              className={cn(
                "text-center text-xs",
                e.spent > e.budget ? "text-expense" : "text-muted-foreground",
              )}
            >
              {e.spent > e.budget
                ? `Over the ${money(e.budget)} budget by ${money(e.spent - e.budget)}`
                : `${money(e.budget - e.spent)} left of ${money(e.budget)} budget`}
            </p>
          </div>
        ) : null}
        {e.note && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {e.note}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant={e.isActive ? "secondary" : "outline"}
            onClick={() => save.mutate({ id: e.id, isActive: !e.isActive })}
          >
            <Power /> {e.isActive ? "End now" : "Happening now"}
          </Button>
          <Button onClick={() => openNew("debit", { eventId: e.id })}>
            <Plus /> Add expense
          </Button>
        </div>
      </div>

      {e.count > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title="By category">
            <CategoryDonut rows={byCategory} compact />
          </SectionCard>
          {byDay.length > 1 && (
            <SectionCard title="Day by day">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay}>
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(d: string) => shortDate(d).slice(0, 6)}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                      content={
                        <ChartTooltip labelFormatter={(d) => dayLabel(d)} />
                      }
                    />
                    <Bar
                      dataKey="spent"
                      name="Spent"
                      fill={EXPENSE_COLOR}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Transactions</h2>
        {items.length === 0 ? (
          <EmptyState title="Nothing tagged to this event yet">
            Tap “Add expense”, or pick this event when adding a transaction.
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

      <Button
        variant="ghost"
        className="w-full text-destructive"
        onClick={async () => {
          if (
            await confirm({
              title: `Delete "${e.name}"?`,
              description: "Its transactions are kept, just untagged.",
              confirmText: "Delete",
              destructive: true,
            })
          )
            del.mutate(e.id, { onSuccess: () => navigate({ to: "/events" }) });
        }}
      >
        <Trash2 /> Delete event
      </Button>

      <EventSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
