import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/common/category-icon";
import { PageHeader } from "@/components/common/page-header";
import { Segmented } from "@/components/common/segmented";
import { EmptyState, PageLoader } from "@/components/common/states";
import { GroupSheet } from "@/components/split/group-sheet";
import {
  type EditablePerson,
  PersonSheet,
} from "@/components/split/person-sheet";
import { BalanceLabel, PersonAvatar } from "@/components/split/split-common";
import { SplitRow } from "@/components/split/split-row";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type GroupInput,
  usePeople,
  useSetSharedAdded,
  useSharedSplits,
  useSplitGroups,
  useSplitSummary,
  useSplits,
} from "@/hooks/use-splits";
import { money } from "@/lib/format";
import { RELATIONS, type Relation, relationLabel } from "@/lib/split";
import { cn } from "@/lib/utils";
import { useSplitSheet } from "@/stores/split-sheet-store";

type Tab = "people" | "groups" | "activity" | "shared";

export const Route = createFileRoute("/_app/split/")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab:
      s.tab === "groups" || s.tab === "activity" || s.tab === "shared"
        ? s.tab
        : undefined,
  }),
  component: SplitPage,
});

function SplitPage() {
  const { tab = "people" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const summary = useSplitSummary();
  const openNew = useSplitSheet((s) => s.openNew);
  const [person, setPerson] = useState<EditablePerson | null>(null);
  const [group, setGroup] = useState<(GroupInput & { id?: number }) | null>(
    null,
  );

  const s = summary.data;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Split & share"
        description="Share bills with friends, office colleagues and family, and get your money back."
        actions={
          <Button onClick={() => openNew()}>
            <Plus /> Split an expense
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">You're owed</p>
          <p className="tabular mt-1 truncate text-lg font-bold text-income sm:text-2xl">
            {money(s?.owedToYou ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">You owe</p>
          <p className="tabular mt-1 truncate text-lg font-bold text-expense sm:text-2xl">
            {money(s?.youOwe ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className="tabular mt-1 truncate text-lg font-bold sm:text-2xl">
            {money(s?.net ?? 0)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={(t) =>
            navigate({
              search: { tab: t === "people" ? undefined : t },
              replace: true,
            })
          }
          options={[
            { value: "people", label: "People" },
            { value: "groups", label: "Groups" },
            { value: "activity", label: "Activity" },
            { value: "shared", label: "Shared with me" },
          ]}
        />
        {tab === "people" && (
          <Button
            variant="outline"
            onClick={() => setPerson({ name: "", relation: "friend" })}
          >
            <UserPlus /> Add person
          </Button>
        )}
        {tab === "groups" && (
          <Button
            variant="outline"
            onClick={() =>
              setGroup({
                name: "",
                icon: "users",
                color: "#0d9488",
                memberIds: [],
              })
            }
          >
            <Users /> New group
          </Button>
        )}
      </div>

      {tab === "people" && (
        <PeopleTab onAdd={() => setPerson({ name: "", relation: "friend" })} />
      )}
      {tab === "groups" && (
        <GroupsTab
          onAdd={() =>
            setGroup({
              name: "",
              icon: "users",
              color: "#0d9488",
              memberIds: [],
            })
          }
        />
      )}
      {tab === "activity" && <ActivityTab />}
      {tab === "shared" && <SharedTab />}

      <PersonSheet value={person} onClose={() => setPerson(null)} />
      <GroupSheet value={group} onClose={() => setGroup(null)} />
    </div>
  );
}

function PeopleTab({ onAdd }: { onAdd: () => void }) {
  const { data = [], isLoading } = usePeople();
  const [filter, setFilter] = useState<Relation | "all">("all");
  if (isLoading) return <PageLoader />;
  if (!data.length)
    return (
      <EmptyState icon={<Users className="size-8" />} title="No people yet">
        Add friends, office colleagues, cousins or anyone you share costs with.
        <Button className="mt-3" onClick={onAdd}>
          <UserPlus /> Add person
        </Button>
      </EmptyState>
    );
  const list = data
    .filter((p) => filter === "all" || p.relation === filter)
    .sort((a, b) => Math.abs(b.balance.net) - Math.abs(a.balance.net));
  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {[{ value: "all" as const, short: "Everyone" }, ...RELATIONS].map(
          (r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setFilter(r.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                filter === r.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {r.short}
            </button>
          ),
        )}
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {list.map((p) => (
          <Link
            key={p.id}
            to="/split/people/$personId"
            params={{ personId: String(p.id) }}
            className="flex items-center gap-3 px-4 py-3 active:bg-muted md:hover:bg-muted/60"
          >
            <PersonAvatar name={p.name} id={p.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.username ? `@${p.username} · ` : ""}
                {relationLabel(p.relation)}
              </p>
            </div>
            <BalanceLabel net={p.balance.net} />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
        {!list.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nobody in this list.
          </p>
        )}
      </div>
    </div>
  );
}

function GroupsTab({ onAdd }: { onAdd: () => void }) {
  const { data = [], isLoading } = useSplitGroups();
  if (isLoading) return <PageLoader />;
  if (!data.length)
    return (
      <EmptyState icon={<Users className="size-8" />} title="No groups yet">
        Make a group for a trip, your flat, office lunches or family events.
        <Button className="mt-3" onClick={onAdd}>
          <Users /> New group
        </Button>
      </EmptyState>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.map((g) => (
        <Link
          key={g.id}
          to="/split/groups/$groupId"
          params={{ groupId: String(g.id) }}
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 active:bg-muted md:hover:shadow-md"
        >
          <CategoryIcon icon={g.icon} color={g.color} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{g.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {g.members.length + 1} people · spent {money(g.totalSpent)}
            </p>
            <div className="mt-1.5 flex -space-x-2">
              {g.members.slice(0, 5).map((m) => (
                <PersonAvatar
                  key={m.id}
                  name={m.name}
                  id={m.id}
                  className="size-6 text-[9px] ring-2 ring-card"
                />
              ))}
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function ActivityTab() {
  const { data = [], isLoading } = useSplits();
  if (isLoading) return <PageLoader />;
  if (!data.length)
    return (
      <EmptyState title="No shared expenses yet">
        Tap “Split an expense” to add one.
      </EmptyState>
    );
  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-card">
      {data.map((s) => (
        <SplitRow key={s.id} split={s} />
      ))}
    </div>
  );
}

/** Splits other people tagged me on. Read-only, but I choose whether my share counts as an expense. */
function SharedTab() {
  const { data = [], isLoading } = useSharedSplits();
  const setAdded = useSetSharedAdded();
  if (isLoading) return <PageLoader />;
  if (!data.length)
    return (
      <EmptyState
        icon={<Users className="size-8" />}
        title="Nothing shared yet"
      >
        When a friend tags your @username on a split, it shows up here.
      </EmptyState>
    );
  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-card">
      {data.map((s) => (
        <div key={s.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{s.description}</p>
            <p className="truncate text-xs text-muted-foreground">
              {s.date} · from {s.ownerName} (@{s.ownerUsername}) · bill{" "}
              {money(s.total)}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular font-semibold text-expense">
              −{money(s.myShare)}
            </p>
            <label className="mt-1 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
              Add to expenses
              <Switch
                checked={s.added}
                disabled={setAdded.isPending}
                onCheckedChange={(added) =>
                  setAdded.mutate({ id: s.id, added })
                }
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
