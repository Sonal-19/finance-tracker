import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  HandCoins,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import {
  type EditablePerson,
  PersonSheet,
} from "@/components/split/person-sheet";
import {
  SettleSheet,
  type SettleTarget,
} from "@/components/split/settle-sheet";
import { PersonAvatar } from "@/components/split/split-common";
import { SplitRow } from "@/components/split/split-row";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeletePerson,
  useDeleteSettlement,
  usePerson,
} from "@/hooks/use-splits";
import { money, paymentLabel, shortDate } from "@/lib/format";
import { relationLabel, reminderText, waPhone } from "@/lib/split";
import { cn } from "@/lib/utils";
import { useSplitSheet } from "@/stores/split-sheet-store";

export const Route = createFileRoute("/_app/split/people/$personId")({
  component: PersonPage,
});

function PersonPage() {
  const { personId } = Route.useParams();
  const id = Number(personId);
  const { data, isLoading, error } = usePerson(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const openSplit = useSplitSheet((s) => s.openNew);
  const delPerson = useDeletePerson();
  const delSettlement = useDeleteSettlement();
  const [editing, setEditing] = useState<EditablePerson | null>(null);
  const [settle, setSettle] = useState<SettleTarget | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !data)
    return <ErrorState error={error ?? new Error("Not found")} />;
  const { person, balance, activity } = data;
  const net = balance.net;
  const first = person.name.split(" ")[0];

  const remind = async () => {
    const text = reminderText(person.name, net, user?.name ?? "");
    if (person.phone) {
      window.open(
        `https://wa.me/${waPhone(person.phone)}?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener",
      );
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* user cancelled: fall through to copy */
      }
    }
    await navigator.clipboard.writeText(text).catch(() => {});
    toast.success("Reminder copied — paste it in any chat");
  };

  return (
    <div className="space-y-5">
      <Link
        to="/split"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Split & share
      </Link>

      <div className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <PersonAvatar
            name={person.name}
            id={person.id}
            className="size-14 text-lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{person.name}</h1>
            <p className="text-sm text-muted-foreground">
              {relationLabel(person.relation)}
            </p>
            {person.phone && (
              <a
                href={`tel:${person.phone}`}
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary"
              >
                <Phone className="size-3" /> {person.phone}
              </a>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit person"
            onClick={() =>
              setEditing({
                id: person.id,
                name: person.name,
                phone: person.phone,
                email: person.email,
                relation: person.relation,
              })
            }
          >
            <Pencil />
          </Button>
        </div>

        <div
          className={cn(
            "mt-5 rounded-2xl p-4 text-center",
            net > 0.004
              ? "bg-income/10"
              : net < -0.004
                ? "bg-expense/10"
                : "bg-muted",
          )}
        >
          {Math.abs(net) < 0.005 ? (
            <p className="font-semibold">All settled up with {first} 🎉</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {net > 0 ? `${first} owes you` : `You owe ${first}`}
              </p>
              <p
                className={cn(
                  "tabular text-3xl font-bold",
                  net > 0 ? "text-income" : "text-expense",
                )}
              >
                {money(Math.abs(net))}
              </p>
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 py-3"
            onClick={() =>
              setSettle({ personId: person.id, name: person.name, net })
            }
          >
            <HandCoins className="size-5" />{" "}
            <span className="text-xs">Settle up</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 py-3"
            disabled={net <= 0.004}
            onClick={remind}
          >
            {person.phone ? (
              <MessageCircle className="size-5" />
            ) : (
              <Share2 className="size-5" />
            )}
            <span className="text-xs">Remind</span>
          </Button>
          <Button
            className="h-auto flex-col gap-1 py-3"
            onClick={() => openSplit({ personId: person.id })}
          >
            <Plus className="size-5" />{" "}
            <span className="text-xs">Add expense</span>
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">History</h2>
        {activity.length === 0 ? (
          <EmptyState title={`Nothing shared with ${first} yet`} />
        ) : (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {activity.map((a) =>
              a.kind === "split" ? (
                <SplitRow key={a.key} split={a.split} effect={a.effect} />
              ) : (
                <div key={a.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <HandCoins className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {a.settlement.direction === "received"
                        ? `${first} paid you`
                        : `You paid ${first}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        shortDate(a.date),
                        paymentLabel(a.settlement.paymentMethod),
                        a.settlement.note,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="tabular font-semibold">
                    {money(a.settlement.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete payment"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Delete this payment?",
                          confirmText: "Delete",
                          destructive: true,
                        })
                      )
                        delSettlement.mutate(a.settlement.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <Button
        variant="ghost"
        className="w-full text-destructive"
        onClick={async () => {
          if (
            await confirm({
              title: `Remove ${person.name}?`,
              description:
                "Only possible when there are no shared expenses or payments with them.",
              confirmText: "Remove",
              destructive: true,
            })
          )
            delPerson.mutate(person.id, {
              onSuccess: () => navigate({ to: "/split" }),
            });
        }}
      >
        <Trash2 /> Remove {first}
      </Button>

      <PersonSheet value={editing} onClose={() => setEditing(null)} />
      <SettleSheet value={settle} onClose={() => setSettle(null)} />
    </div>
  );
}
