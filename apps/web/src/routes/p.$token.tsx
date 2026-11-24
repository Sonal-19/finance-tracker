import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
  ChevronDown,
  CircleCheck,
  Clock,
  Download,
  HandCoins,
  Printer,
  Receipt,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PayCard, UnlockForm } from "@/components/books/public-share-parts";
import { CategoryIcon } from "@/components/common/category-icon";
import { Field } from "@/components/common/field";
import { Logo } from "@/components/common/logo";
import { EmptyState, PageLoader } from "@/components/common/states";
import { PersonAvatar } from "@/components/split/split-common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type PublicPersonShare,
  usePublicPersonShare,
  useReportSettlement,
  useUnlockPersonShare,
} from "@/hooks/use-person-shares";
import { dayLabel, formatAmount, fromAmount, toAmount } from "@/lib/format";
import { SPLIT_METHODS } from "@/lib/split";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$token")({
  component: PersonSharePage,
});

/** Everything someone split with one person, shared by link. Read-only,
 * no login. */
function PersonSharePage() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = usePublicPersonShare(token);

  // A private link: keep it out of search engines.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <div className="pt-safe min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
        <header className="flex justify-center print:hidden">
          <Logo />
        </header>
        {isLoading ? (
          <PageLoader />
        ) : error || !data ? (
          <EmptyState title="This link isn't available" className="mt-10">
            {error?.message ?? "It may have expired or been deleted."}
          </EmptyState>
        ) : data.locked ? (
          <Unlock token={token} ownerName={data.ownerName} />
        ) : (
          <SharedWithPerson token={token} data={data} />
        )}
      </div>
    </div>
  );
}

function Unlock({ token, ownerName }: { token: string; ownerName: string }) {
  const unlock = useUnlockPersonShare(token);
  return (
    <UnlockForm
      ownerName={ownerName}
      pending={unlock.isPending}
      error={unlock.error}
      onUnlock={(password) => unlock.mutate(password)}
    />
  );
}

const first = (name: string) => name.split(" ")[0] ?? name;

type Activity = PublicPersonShare["activity"][number];

function SharedWithPerson({
  token,
  data,
}: {
  token: string;
  data: PublicPersonShare;
}) {
  const { totals } = data;
  const owner = first(data.ownerName);
  const net = totals.net;
  const settled = Math.abs(net) < 1;
  const base = `/api/public/person-shares/${token}`;
  const [groupId, setGroupId] = useState<number | null>(null);

  const shown = groupId
    ? data.activity.filter((a) => a.kind === "split" && a.group?.id === groupId)
    : data.activity;
  const months = useMemo(() => byMonth(shown), [shown]);

  return (
    <>
      <section className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            <PersonAvatar
              name={data.ownerName}
              id={1}
              className="size-12 ring-2 ring-card"
            />
            <PersonAvatar
              name={data.personName}
              id={2}
              className="size-12 ring-2 ring-card"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">
              {owner} & {first(data.personName)}
            </h1>
            <p className="text-sm text-muted-foreground">
              Shared expenses · {totals.bills}{" "}
              {totals.bills === 1 ? "bill" : "bills"}
            </p>
          </div>
        </div>
        {data.message && (
          <p className="mt-3 text-sm whitespace-pre-line">{data.message}</p>
        )}

        <div
          className={cn(
            "mt-5 rounded-2xl p-4 text-center",
            settled ? "bg-muted" : net > 0 ? "bg-expense/10" : "bg-income/10",
          )}
        >
          {settled ? (
            <p className="inline-flex items-center gap-1.5 font-semibold">
              <CircleCheck className="size-5 text-income" /> You're all settled
              up with {owner} 🎉
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {net > 0 ? `You owe ${owner}` : `${owner} owes you`}
              </p>
              <p
                className={cn(
                  "tabular text-3xl font-bold",
                  net > 0 ? "text-expense" : "text-income",
                )}
              >
                {formatAmount(Math.abs(net))}
              </p>
            </>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <Tile label="Your share" value={totals.yourShare} />
          <Tile label="You paid" value={totals.youPaid} income />
          <Tile label="You received" value={totals.youReceived} />
        </div>
      </section>

      {data.upi && net > 0 && (
        <PayCard upi={data.upi} due={net} note="Shared expenses" />
      )}

      {(net > 0 || data.pendingClaims.length > 0) && (
        <ReportSettlement
          token={token}
          owner={owner}
          due={net > 0 ? net : null}
          pending={data.pendingClaims}
        />
      )}

      {data.groups.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] print:hidden">
          <Chip on={groupId === null} onClick={() => setGroupId(null)}>
            Everything
          </Chip>
          {data.groups.map((g) => (
            <Chip
              key={g.id}
              on={groupId === g.id}
              onClick={() => setGroupId(g.id)}
            >
              <CategoryIcon icon={g.icon} color={g.color} size="sm" />
              {g.name}
            </Chip>
          ))}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">History</h2>
          <div className="flex gap-1 print:hidden">
            <Button variant="ghost" size="sm" asChild>
              <a href={`${base}/export.csv`} download>
                <Download /> CSV
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </div>
        </div>
        {months.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          months.map((m) => (
            <div
              key={m.month}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <div className="flex items-end justify-between gap-3 border-b px-4 py-3">
                <h3 className="font-semibold">
                  {format(parseISO(`${m.month}-01`), "MMMM yyyy")}
                </h3>
                {m.yourShare > 0 && (
                  <p className="text-xs text-muted-foreground">
                    your share{" "}
                    <b className="tabular text-foreground">
                      {formatAmount(m.yourShare)}
                    </b>
                  </p>
                )}
              </div>
              <ul className="divide-y">
                {m.items.map((a) =>
                  a.kind === "split" ? (
                    <BillRow
                      key={a.key}
                      bill={a}
                      owner={owner}
                      showRunning={!groupId}
                    />
                  ) : (
                    <PaymentRow
                      key={a.key}
                      payment={a}
                      owner={owner}
                      showRunning={!groupId}
                    />
                  ),
                )}
              </ul>
            </div>
          ))
        )}
        {data.truncated && (
          <p className="text-center text-xs text-muted-foreground">
            Showing the latest entries only. The balance above counts all of
            them.
          </p>
        )}
      </section>

      <p className="pb-6 text-center text-xs text-muted-foreground print:hidden">
        A read-only page from {owner}. Amounts are in Indian rupees.
      </p>
    </>
  );
}

function Tile({
  label,
  value,
  income,
}: {
  label: string;
  value: number;
  income?: boolean;
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular font-semibold", income && "text-income")}>
        {formatAmount(value)}
      </p>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function byMonth(items: Activity[]) {
  const months: { month: string; yourShare: number; items: Activity[] }[] = [];
  for (const a of items) {
    const month = a.date.slice(0, 7);
    let m = months[months.length - 1];
    if (m?.month !== month) {
      m = { month, yourShare: 0, items: [] };
      months.push(m);
    }
    m.items.push(a);
    if (a.kind === "split") m.yourShare += a.yourShare;
  }
  return months;
}

/** "you owe ₹X" / "owes you ₹X" / "settled" for a running balance. */
function balanceText(n: number, owner: string) {
  if (Math.abs(n) < 1) return "settled";
  return n > 0
    ? `you owe ${formatAmount(n)}`
    : `${owner} owes you ${formatAmount(-n)}`;
}

function BillRow({
  bill,
  owner,
  showRunning,
}: {
  bill: Extract<Activity, { kind: "split" }>;
  owner: string;
  showRunning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const method = SPLIT_METHODS.find((m) => m.value === bill.method)?.label;
  const effect =
    bill.effect > 0
      ? { text: `+${formatAmount(bill.effect)} you owe`, cls: "text-expense" }
      : bill.effect < 0
        ? {
            text: `${formatAmount(-bill.effect)} ${owner} owes you`,
            cls: "text-income",
          }
        : {
            text: `not between you and ${owner}`,
            cls: "text-muted-foreground",
          };
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        {bill.category ? (
          <CategoryIcon icon={bill.category.icon} color={bill.category.color} />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
            <Receipt className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{bill.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              dayLabel(bill.date),
              `${bill.paidBy.kind === "you" ? "You" : bill.paidBy.name} paid ${formatAmount(bill.total)}`,
              bill.group?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className={cn("tabular truncate text-xs", effect.cls)}>
            {effect.text}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular font-semibold">
            {formatAmount(bill.yourShare)}
          </p>
          <p className="text-[11px] text-muted-foreground">your share</p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition print:hidden",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-2 bg-muted/30 px-4 pt-1 pb-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {[
              `${bill.people} ${bill.people === 1 ? "person" : "people"}`,
              method && `split ${method.toLowerCase()}`,
              bill.category?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {bill.shares.length > 0 && (
            <ul className="space-y-1">
              {bill.shares.map((s, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex justify-between gap-3",
                    s.who === "you" && "font-semibold",
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="tabular">{formatAmount(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {bill.note && (
            <p className="text-xs wrap-break-word text-muted-foreground">
              {bill.note}
            </p>
          )}
          {showRunning && (
            <p className="text-xs text-muted-foreground">
              Balance after this: {balanceText(bill.balanceAfter, owner)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function PaymentRow({
  payment,
  owner,
  showRunning,
}: {
  payment: Extract<Activity, { kind: "settlement" }>;
  owner: string;
  showRunning: boolean;
}) {
  const youPaid = payment.direction === "you_paid";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-income/10 text-income">
        <HandCoins className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {youPaid ? `You paid ${owner}` : `${owner} paid you`}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            dayLabel(payment.date),
            payment.note,
            showRunning && balanceText(payment.balanceAfter, owner),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className="tabular shrink-0 font-semibold text-income">
        {formatAmount(payment.amount)}
      </span>
    </li>
  );
}

/** "I've paid you back": tells the owner, who confirms it. */
function ReportSettlement({
  token,
  owner,
  due,
  pending,
}: {
  token: string;
  owner: string;
  due: number | null;
  pending: PublicPersonShare["pendingClaims"];
}) {
  const report = useReportSettlement(token);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(due ? String(fromAmount(due)) : "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const value = toAmount(Number(amount) || 0);

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-5 print:hidden">
      {pending.map((c) => (
        <p
          key={c.id}
          className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm"
        >
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <span>
            <b className="tabular">{formatAmount(c.amount)}</b> reported as paid
            · waiting for {owner} to confirm
          </span>
        </p>
      ))}
      {open ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            report.mutate(
              {
                amount: value,
                reference: reference.trim() || null,
                note: note.trim() || null,
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setReference("");
                  setNote("");
                },
              },
            );
          }}
        >
          <h2 className="font-semibold">Tell {owner} you paid</h2>
          <Field label="Amount paid (₹)" htmlFor="pclaim-amount" required>
            <Input
              id="pclaim-amount"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) setAmount(v);
              }}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="UPI reference (optional)"
              htmlFor="pclaim-ref"
              hint="The UTR / transaction ID from your app."
            >
              <Input
                id="pclaim-ref"
                maxLength={40}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Note (optional)" htmlFor="pclaim-note">
              <Input
                id="pclaim-note"
                maxLength={120}
                placeholder="e.g. paid in cash"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={value <= 0 || report.isPending}
            >
              {report.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Already paid? Let {owner} know. The balance updates once they
            confirm.
          </p>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <CircleCheck /> I've paid
          </Button>
        </div>
      )}
    </section>
  );
}
