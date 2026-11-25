import { Link } from "@tanstack/react-router";
import { Check, Inbox, RotateCcw, Users, X } from "lucide-react";
import { useState } from "react";
import { AccountPicker, BookPicker } from "@/components/app/pickers";
import { CategoryIcon } from "@/components/common/category-icon";
import { CollapsibleGrid } from "@/components/common/collapsible-grid";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveAccounts } from "@/hooks/use-accounts";
import { useActiveBooks } from "@/hooks/use-books";
import {
  type Category,
  type RecurringRule,
  type SharedRecurring,
  useAnswerRecurringShare,
  useCategories,
  useSaveRecurringShares,
  useSharedRecurring,
} from "@/hooks/use-finance";
import { usePeople, useSplitGroups } from "@/hooks/use-splits";
import { formatAmount, fromAmount, shortDate, toAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export const FREQ_LABEL = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
} as const;

/** The category tiles used by the recurring forms. */
export function CategoryGrid({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <CollapsibleGrid
      variant="tile"
      selectedIndex={categories.findIndex((c) => c.id === value)}
      className="grid-cols-4 gap-2 sm:grid-cols-5"
    >
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 text-center",
            value === c.id ? "border-ring bg-accent" : "hover:bg-muted",
          )}
        >
          <CategoryIcon icon={c.icon} color={c.color} size="sm" />
          <span className="line-clamp-2 text-[11px] leading-tight">
            {c.name}
          </span>
        </button>
      ))}
    </CollapsibleGrid>
  );
}

const ownerOf = (x: { ownerName: string; ownerUsername: string | null }) =>
  x.ownerUsername ? `${x.ownerName} (@${x.ownerUsername})` : x.ownerName;

/* ---------------- invitations to me ---------------- */

/** Recurring entries other people shared with me, to accept or decline. */
export function SharedInvites() {
  const { data } = useSharedRecurring();
  const answer = useAnswerRecurringShare();
  const [accepting, setAccepting] = useState<SharedRecurring | null>(null);
  if (!data?.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Inbox className="size-4" /> Shared with you
        <Badge variant="secondary">{data.length}</Badge>
      </h2>
      <div className="divide-y overflow-hidden rounded-2xl border border-primary/30 bg-card">
        {data.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4"
          >
            <CategoryIcon icon={s.category.icon} color={s.category.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {s.rule.note || s.category.name}
              </p>
              <p className="text-xs text-muted-foreground">
                From {ownerOf(s)} · {FREQ_LABEL[s.rule.frequency]} · next{" "}
                {shortDate(s.rule.nextRunDate)}
                {s.rule.endDate ? ` · until ${shortDate(s.rule.endDate)}` : ""}
                {s.rule.status === "paused" ? " · paused" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Your share{" "}
                <b
                  className={cn(
                    "tabular",
                    s.rule.type === "credit" ? "text-income" : "text-expense",
                  )}
                >
                  {s.rule.type === "credit" ? "+" : "−"}
                  {formatAmount(s.amount)}
                </b>{" "}
                of {formatAmount(s.rule.amount)}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ id: s.id, accept: false })}
              >
                <X /> Decline
              </Button>
              <Button size="sm" onClick={() => setAccepting(s)}>
                <Check /> Accept
              </Button>
            </div>
          </div>
        ))}
      </div>
      <AcceptSheet value={accepting} onClose={() => setAccepting(null)} />
    </section>
  );
}

function AcceptSheet({
  value,
  onClose,
}: {
  value: SharedRecurring | null;
  onClose: () => void;
}) {
  const { data: categories = [] } = useCategories();
  const { defaultAccount } = useActiveAccounts();
  const { defaultBook } = useActiveBooks();
  const answer = useAnswerRecurringShare();
  const [pick, setPick] = useState<{
    categoryId: number | null;
    accountId?: number;
    bookId?: number;
  }>({ categoryId: null });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value) setPick({ categoryId: value.suggestedCategoryId ?? null });
  }
  // Keep the content while the sheet animates closed.
  const [shown, setShown] = useState(value);
  if (value && value !== shown) setShown(value);
  const open = !!value;
  const cats = categories.filter((c) => c.type === shown?.rule.type);
  const needCategory =
    shown?.rule.type === "credit" && pick.categoryId === null;
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={
        shown ? `Accept "${shown.rule.note || shown.category.name}"` : "Accept"
      }
      description={
        shown
          ? `${formatAmount(shown.amount)} ${FREQ_LABEL[shown.rule.frequency].toLowerCase()} from ${shortDate(shown.rule.nextRunDate)} will be added to your own transactions. ${shown.ownerName} keeps the schedule; you're told about every change.`
          : undefined
      }
    >
      {shown && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (needCategory || !shown) return;
            answer.mutate(
              {
                id: shown.id,
                accept: true,
                categoryId: pick.categoryId ?? undefined,
                accountId: pick.accountId,
                bookId: pick.bookId,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <div className="space-y-2">
            <Label>Your category</Label>
            <CategoryGrid
              categories={cats}
              value={pick.categoryId}
              onChange={(categoryId) => setPick({ ...pick, categoryId })}
            />
            {pick.categoryId === null && shown.rule.type === "debit" && (
              <p className="text-xs text-muted-foreground">
                Not picked: it goes to "Shared expenses".
              </p>
            )}
          </div>
          <AccountPicker
            label={shown.rule.type === "credit" ? "Received in" : "Paid via"}
            value={pick.accountId ?? defaultAccount?.id ?? null}
            onChange={(accountId) => setPick({ ...pick, accountId })}
          />
          <BookPicker
            value={pick.bookId ?? defaultBook?.id ?? null}
            onChange={(bookId) => setPick({ ...pick, bookId })}
          />
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={needCategory || answer.isPending}
          >
            Add to my recurring
          </Button>
        </form>
      )}
    </ResponsiveSheet>
  );
}

/* ---------------- sharing my rule ---------------- */

type Row = { personId: number; amount: string; reinvite?: boolean };

const STATUS_LABEL = {
  pending: "Invited",
  accepted: "Accepted",
  declined: "Declined",
} as const;

/** One line under a rule: who it's shared with, or who shared it. */
export function ShareLine({ rule }: { rule: RecurringRule }) {
  if (rule.sharedFrom)
    return (
      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
        <Users className="size-3 shrink-0" />
        Shared by {ownerOf(rule.sharedFrom)} · total{" "}
        {formatAmount(rule.sharedFrom.ownerAmount)}
      </p>
    );
  if (!rule.shares.length) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
      <Users className="size-3 shrink-0" />
      {rule.shares
        .map(
          (s) =>
            `${s.name}${s.status === "accepted" ? "" : ` (${STATUS_LABEL[s.status].toLowerCase()})`}`,
        )
        .join(", ")}
    </p>
  );
}

/** Pick tagged people (or a group's) and each one's share of a rule. */
export function ShareRuleSheet({
  rule,
  onClose,
}: {
  rule: RecurringRule | null;
  onClose: () => void;
}) {
  const { data: people = [] } = usePeople();
  const { data: groups = [] } = useSplitGroups();
  const save = useSaveRecurringShares();
  const [rows, setRows] = useState<Row[]>([]);
  const [last, setLast] = useState(rule);
  if (rule !== last) {
    setLast(rule);
    if (rule)
      setRows(
        rule.shares.map((s) => ({
          personId: s.personId,
          amount: String(fromAmount(s.amount)),
        })),
      );
  }
  // Keep the content while the sheet animates closed.
  const [shownRule, setShownRule] = useState(rule);
  if (rule && rule !== shownRule) setShownRule(rule);
  const tagged = people.filter((p) => p.linkedUserId && p.username);
  const untagged = people.length - tagged.length;
  const statusOf = (personId: number) =>
    shownRule?.shares.find((s) => s.personId === personId)?.status;
  const has = (id: number) => rows.some((r) => r.personId === id);
  const equal = (n: number) =>
    shownRule ? String(fromAmount(Math.round(shownRule.amount / (n + 1)))) : "";

  const toggle = (id: number) =>
    setRows(
      has(id)
        ? rows.filter((r) => r.personId !== id)
        : [...rows, { personId: id, amount: equal(rows.length + 1) }],
    );
  const addGroup = (memberIds: number[]) => {
    const ids = memberIds.filter(
      (id) => tagged.some((p) => p.id === id) && !has(id),
    );
    const next = [
      ...rows,
      ...ids.map((personId) => ({ personId, amount: "" })),
    ];
    setRows(
      next.map((r) => ({ ...r, amount: r.amount || equal(next.length) })),
    );
  };
  const splitEqually = () =>
    setRows(rows.map((r) => ({ ...r, amount: equal(rows.length) })));

  const valid = rows.every((r) => Number(r.amount) > 0);
  const totalShared = rows.reduce(
    (a, r) => a + toAmount(Number(r.amount) || 0),
    0,
  );
  const groupsWithTagged = groups.filter((g) =>
    g.members.some((m) => tagged.some((p) => p.id === m.id)),
  );

  return (
    <ResponsiveSheet
      open={!!rule}
      onOpenChange={(o) => !o && onClose()}
      title={`Share "${shownRule?.note || shownRule?.category.name || ""}"`}
      description="Each person gets an invitation. Once they accept, their share repeats in their own account on your schedule, and they're notified when you change it."
    >
      {shownRule && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(
              {
                id: shownRule.id,
                shares: rows.map((r) => ({
                  personId: r.personId,
                  amount: toAmount(Number(r.amount)),
                  ...(r.reinvite && { reinvite: true }),
                })),
              },
              { onSuccess: onClose },
            );
          }}
        >
          {tagged.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Only people tagged with a username can get a shared entry.{" "}
              <Link to="/split" className="text-primary underline">
                Add someone by @username
              </Link>{" "}
              in Split &amp; share first.
            </p>
          ) : (
            <>
              {groupsWithTagged.length > 0 && (
                <div className="space-y-2">
                  <Label>Add a group</Label>
                  <div className="flex flex-wrap gap-2">
                    {groupsWithTagged.map((g) => (
                      <Button
                        key={g.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addGroup(g.members.map((m) => m.id))}
                      >
                        <Users /> {g.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>People</Label>
                <div className="flex flex-wrap gap-2">
                  {tagged.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm",
                        has(p.id)
                          ? "border-ring bg-accent font-medium"
                          : "hover:bg-muted",
                      )}
                    >
                      {p.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        @{p.username}
                      </span>
                    </button>
                  ))}
                </div>
                {untagged > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {untagged}{" "}
                    {untagged === 1 ? "person isn't" : "people aren't"} tagged
                    with a username, so they aren't listed.
                  </p>
                )}
              </div>
            </>
          )}

          {rows.length > 0 && (
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Each one's share (₹)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={splitEqually}
                >
                  Split equally with me
                </Button>
              </div>
              {rows.map((r) => {
                const p = people.find((x) => x.id === r.personId);
                const st = statusOf(r.personId);
                return (
                  <div key={r.personId} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p?.name}</p>
                      {st && (
                        <p className="text-xs text-muted-foreground">
                          {STATUS_LABEL[st]}
                          {st === "declined" &&
                            r.reinvite &&
                            " · will be invited again"}
                        </p>
                      )}
                    </div>
                    {st === "declined" && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant={r.reinvite ? "secondary" : "ghost"}
                        aria-label="Invite again"
                        title="Invite again"
                        onClick={() =>
                          setRows(
                            rows.map((x) =>
                              x.personId === r.personId
                                ? { ...x, reinvite: !x.reinvite }
                                : x,
                            ),
                          )
                        }
                      >
                        <RotateCcw />
                      </Button>
                    )}
                    <Input
                      className="w-28 text-right tabular"
                      inputMode="decimal"
                      aria-label={`${p?.name}'s share`}
                      value={r.amount}
                      onChange={(e) =>
                        setRows(
                          rows.map((x) =>
                            x.personId === r.personId
                              ? {
                                  ...x,
                                  amount: e.target.value.replace(/[^\d.]/g, ""),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${p?.name}`}
                      onClick={() => toggle(r.personId)}
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Shared {formatAmount(totalShared)} of{" "}
                {formatAmount(shownRule.amount)}. Your own entry stays at{" "}
                {formatAmount(shownRule.amount)}; change it if it should be just
                your part.
              </p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={
              !valid ||
              save.isPending ||
              (!rows.length && !shownRule.shares.length)
            }
          >
            {rows.some((r) => !statusOf(r.personId) || r.reinvite)
              ? "Save & send invitations"
              : rows.length
                ? "Save"
                : "Stop sharing"}
          </Button>
        </form>
      )}
    </ResponsiveSheet>
  );
}
