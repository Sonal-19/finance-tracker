import { createFileRoute } from "@tanstack/react-router";
import {
  CircleCheck,
  Clock,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Printer,
  Smartphone,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { periodLabel } from "@/components/books/share-links";
import { CategoryIcon } from "@/components/common/category-icon";
import { Field } from "@/components/common/field";
import { Logo } from "@/components/common/logo";
import { PasswordInput } from "@/components/common/password-input";
import { EmptyState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type PublicShare,
  upiLink,
  usePublicShare,
  useReportPayment,
  useUnlockShare,
} from "@/hooks/use-shares";
import {
  dayLabel,
  formatAmount,
  formatSignedAmount,
  fromAmount,
  toAmount,
  ymd,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/s/$token")({
  component: SharedBookPage,
});

/** A book someone shared by link. Read-only, no login. */
function SharedBookPage() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = usePublicShare(token);

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
          <SharedBook token={token} data={data} />
        )}
      </div>
    </div>
  );
}

function Unlock({ token, ownerName }: { token: string; ownerName: string }) {
  const unlock = useUnlockShare(token);
  const [password, setPassword] = useState("");
  return (
    <form
      className="mx-auto mt-10 max-w-sm space-y-4 rounded-3xl border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        unlock.mutate(password);
      }}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Lock className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-bold">This page is protected</h1>
        <p className="text-sm text-muted-foreground">
          Enter the password {ownerName} gave you.
        </p>
      </div>
      <Field label="Password" htmlFor="share-unlock">
        <PasswordInput
          id="share-unlock"
          autoFocus
          autoComplete="off"
          maxLength={64}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {unlock.error && (
        <p className="text-sm text-destructive">{unlock.error.message}</p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!password || unlock.isPending}
      >
        {unlock.isPending ? "Checking…" : "Open"}
      </Button>
    </form>
  );
}

function SharedBook({ token, data }: { token: string; data: PublicShare }) {
  const { book, totals, items } = data;
  const due = totals.due;
  const settled = due !== null && totals.spent > 0 && due <= 0;
  const base = `/api/public/shares/${token}`;
  const period = periodLabel(data.fromDate, data.toDate);

  const groups: { date: string; items: PublicShare["items"] }[] = [];
  for (const t of items) {
    const d = ymd(t.date);
    const last = groups[groups.length - 1];
    if (last?.date === d) last.items.push(t);
    else groups.push({ date: d, items: [t] });
  }

  return (
    <>
      <section className="rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <CategoryIcon
            icon={book.icon}
            color={book.color}
            size="lg"
            className="size-14"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{book.name}</h1>
            <p className="text-sm text-muted-foreground">
              Shared by {data.ownerName}
              {period && ` · ${period}`}
            </p>
          </div>
        </div>
        {data.message && (
          <p className="mt-3 text-sm whitespace-pre-line">{data.message}</p>
        )}

        {due === null ? (
          <div className="mt-5 text-center">
            <p className="text-sm text-muted-foreground">Total spent</p>
            <p className="tabular text-3xl font-bold">
              {formatAmount(totals.spent)}
            </p>
            <p className="text-xs text-muted-foreground">
              {totals.count} {totals.count === 1 ? "entry" : "entries"}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-5 text-center">
              {settled ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-income/10 px-3 py-1 text-sm font-semibold text-income">
                  <CircleCheck className="size-4" /> All paid
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Yet to be paid</p>
              )}
              <p className="tabular mt-1 text-3xl font-bold">
                {formatAmount(Math.max(due, 0))}
              </p>
              {due < 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatAmount(-due)} paid extra
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="tabular font-semibold">
                  {formatAmount(totals.spent)}
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-xs text-muted-foreground">Paid back</p>
                <p className="tabular font-semibold text-income">
                  {formatAmount(totals.received)}
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {data.upi && !settled && (
        <PayCard
          upi={data.upi}
          due={due !== null && due > 0 ? due : null}
          note={book.name}
        />
      )}

      {(!settled || data.pendingClaims.length > 0) && (
        <ReportPayment
          token={token}
          ownerName={data.ownerName}
          due={due !== null && due > 0 ? due : null}
          pending={data.pendingClaims}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Entries</h2>
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
        {items.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          groups.map((g) => (
            <div
              key={g.date}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold">
                {dayLabel(g.date)}
              </p>
              <ul className="divide-y">
                {g.items.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CategoryIcon
                        icon={t.category.icon}
                        color={t.category.color}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {t.type === "credit"
                            ? "Payment received"
                            : t.category.name}
                        </p>
                        {t.note && (
                          <p className="text-xs break-words text-muted-foreground">
                            {t.note}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "tabular shrink-0 font-semibold",
                          t.type === "credit" && "text-income",
                        )}
                      >
                        {t.type === "credit"
                          ? formatSignedAmount(t.amount, "credit")
                          : formatAmount(t.amount)}
                      </span>
                    </div>
                    {t.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-13 print:hidden">
                        {t.attachments.map((a) => (
                          <a
                            key={a.id}
                            href={`${base}/attachments/${a.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            {a.contentType === "application/pdf" ? (
                              <FileText className="size-3.5 shrink-0" />
                            ) : (
                              <ImageIcon className="size-3.5 shrink-0" />
                            )}
                            <span className="truncate">{a.fileName}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {data.truncated && (
          <p className="text-center text-xs text-muted-foreground">
            Showing the latest {items.length} entries. The totals above count
            all of them.
          </p>
        )}
      </section>

      <p className="pb-6 text-center text-xs text-muted-foreground print:hidden">
        A read-only page. Amounts are in Indian rupees.
      </p>
    </>
  );
}

function PayCard({
  upi,
  due,
  note,
}: {
  upi: NonNullable<PublicShare["upi"]>;
  /** What is still owed, when the book tracks that. */
  due: number | null;
  note: string;
}) {
  const [text, setText] = useState(due ? String(fromAmount(due)) : "");
  const amount = toAmount(Number(text) || 0);
  const link = upiLink({ ...upi, amount, note });

  return (
    <section className="rounded-3xl border bg-card p-5 print:hidden">
      <h2 className="font-semibold">Pay {upi.payeeName}</h2>
      <p className="text-sm text-muted-foreground">
        Scan with any UPI app, or open one on this phone.
      </p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* QR codes need dark-on-light to scan, whatever the theme. */}
        <div className="rounded-2xl bg-white p-3">
          <QRCodeSVG value={link} size={176} marginSize={0} />
        </div>
        <div className="w-full min-w-0 flex-1 space-y-3">
          <Field
            label="Amount (₹)"
            htmlFor="pay-amount"
            hint="Leave empty to type it in your UPI app."
          >
            <Input
              id="pay-amount"
              inputMode="decimal"
              placeholder="0"
              value={text}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) setText(v);
              }}
            />
          </Field>
          <Button size="lg" className="w-full" asChild>
            <a href={link}>
              <Smartphone /> Pay
              {amount > 0 ? ` ${formatAmount(amount)}` : ""} with a UPI app
            </a>
          </Button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(upi.id);
                toast.success("UPI ID copied");
              } catch {
                toast.error("Couldn't copy");
              }
            }}
          >
            <span className="tabular truncate">{upi.id}</span>
            <Copy className="size-3.5 shrink-0" />
          </button>
        </div>
      </div>
    </section>
  );
}

/** "I've paid": tells the owner, who then records it. Nothing changes on
 * this page until they do. */
function ReportPayment({
  token,
  ownerName,
  due,
  pending,
}: {
  token: string;
  ownerName: string;
  due: number | null;
  pending: PublicShare["pendingClaims"];
}) {
  const report = useReportPayment(token);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(due ? String(fromAmount(due)) : "");
  const [payerName, setPayerName] = useState("");
  const [reference, setReference] = useState("");
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
            · waiting for {ownerName} to confirm
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
                payerName: payerName.trim() || null,
                reference: reference.trim() || null,
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setReference("");
                },
              },
            );
          }}
        >
          <h2 className="font-semibold">Tell {ownerName} you paid</h2>
          <Field label="Amount paid (₹)" htmlFor="claim-amount" required>
            <Input
              id="claim-amount"
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
            <Field label="Your name (optional)" htmlFor="claim-name">
              <Input
                id="claim-name"
                maxLength={60}
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
              />
            </Field>
            <Field
              label="UPI reference (optional)"
              htmlFor="claim-ref"
              hint="The UTR / transaction ID from your app."
            >
              <Input
                id="claim-ref"
                maxLength={40}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
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
            Already paid? Let {ownerName} know. It shows as paid here once they
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
