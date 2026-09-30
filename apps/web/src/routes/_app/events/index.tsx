import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, PartyPopper, Plus } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/common/category-icon";
import { PageHeader } from "@/components/common/page-header";
import { Progress } from "@/components/common/progress";
import { EmptyState, PageLoader } from "@/components/common/states";
import {
  type EditableEvent,
  EventSheet,
} from "@/components/events/event-sheet";
import { Button } from "@/components/ui/button";
import { type AppEvent, useEvents } from "@/hooks/use-accounts";
import { dateRangeLabel } from "@/lib/accounts";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/events/")({
  component: EventsPage,
});

const STATUS_LABEL = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  past: "Past",
} as const;

export function EventCard({ e }: { e: AppEvent }) {
  const range = dateRangeLabel(e.startDate, e.endDate, shortDate);
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: String(e.id) }}
      className="block min-w-0 rounded-2xl border bg-card p-4 transition-shadow active:bg-muted md:hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={e.icon} color={e.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <span className="truncate">{e.name}</span>
            {e.isActive && (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                LIVE
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              range,
              e.isActive ? null : STATUS_LABEL[e.status],
              `${e.count} entries`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">spent</p>
          <p className="tabular font-semibold">{money(e.spent)}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
      {e.budget ? (
        <div className="mt-3 space-y-1">
          <Progress value={e.spent} max={e.budget} />
          <p
            className={cn(
              "text-xs",
              e.spent > e.budget ? "text-expense" : "text-muted-foreground",
            )}
          >
            {e.spent > e.budget
              ? `Over budget by ${money(e.spent - e.budget)}`
              : `${money(e.budget - e.spent)} left of ${money(e.budget)}`}
          </p>
        </div>
      ) : null}
    </Link>
  );
}

function EventsPage() {
  const { data = [], isLoading } = useEvents();
  const [editing, setEditing] = useState<EditableEvent | null>(null);
  const newEvent = () =>
    setEditing({ name: "", icon: "party-popper", color: "#f97316" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events"
        description="Festivals, weddings, trips — see everything you spent on one occasion."
        actions={
          <Button onClick={newEvent}>
            <Plus /> New event
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<PartyPopper className="size-8" />}
          title="No events yet"
        >
          Going to a mela, a wedding or on a trip? Create an event, switch on
          “Happening now”, and every expense you add is grouped under it.
          <Button className="mt-3" onClick={newEvent}>
            <Plus /> New event
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      )}
      <EventSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
