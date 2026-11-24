import {
  Copy,
  ExternalLink,
  HandCoins,
  Link2,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/app/section-card";
import { confirm } from "@/components/common/confirm-dialog";
import { DateInput } from "@/components/common/date-input";
import { Field } from "@/components/common/field";
import { PasswordInput } from "@/components/common/password-input";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type PersonShare,
  personShareUrl,
  useDecideSettlementClaim,
  useDeletePersonShare,
  usePersonShares,
  useSavePersonShare,
  useSettlementClaims,
} from "@/hooks/use-person-shares";
import { useShares } from "@/hooks/use-shares";
import { formatAmount, shortDate, todayStr } from "@/lib/format";

const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export async function copyPersonLink(token: string) {
  try {
    await navigator.clipboard.writeText(personShareUrl(token));
    toast.success("Link copied");
  } catch {
    toast.error(
      "Couldn't copy. Open the link and copy it from the address bar.",
    );
  }
}

type Form = {
  message: string;
  expiresOn: string;
  password: string;
  removePassword: boolean;
  upiId: string;
  payeeName: string;
  payButton: boolean;
  showOthers: boolean;
};

function PersonLinkSheet({
  personId,
  first,
  open,
  editing,
  lastUpi,
  onClose,
}: {
  personId: number;
  first: string;
  open: boolean;
  editing: PersonShare | null;
  lastUpi?: { upiId: string | null; payeeName: string | null };
  onClose: () => void;
}) {
  const save = useSavePersonShare();
  const [form, setForm] = useState<Form>({
    message: "",
    expiresOn: "",
    password: "",
    removePassword: false,
    upiId: "",
    payeeName: "",
    payButton: false,
    showOthers: true,
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm({
      message: editing?.message ?? "",
      expiresOn: editing?.expiresOn ?? "",
      password: "",
      removePassword: false,
      upiId: (editing ? editing.upiId : lastUpi?.upiId) ?? "",
      payeeName: (editing ? editing.payeeName : lastUpi?.payeeName) ?? "",
      payButton: editing?.payButton === "shown",
      showOthers: (editing?.participants ?? "shown") === "shown",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const upiId = form.upiId.trim();
  const upiValid = !upiId || UPI_ID.test(upiId);
  const passwordValid = !form.password || form.password.length >= 4;
  const hasPassword = editing?.protection === "password";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiValid || !passwordValid) return;
    save.mutate(
      {
        id: editing?.id,
        personId,
        message: form.message.trim() || null,
        expiresOn: form.expiresOn || null,
        upiId: upiId || null,
        payeeName: form.payeeName.trim() || null,
        payButton: form.payButton ? "shown" : "hidden",
        participants: form.showOthers ? "shown" : "hidden",
        ...(form.password
          ? { password: form.password }
          : form.removePassword
            ? { password: null }
            : {}),
      },
      {
        onSuccess: ({ data, message }) => {
          onClose();
          if (editing) toast.success(message);
          else copyPersonLink(data.token);
        },
      },
    );
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Edit link" : `Share with ${first}`}
      description={`${first} sees every bill you split with them, payments both ways and what's left. No account needed, and they can't change anything.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Message (optional)"
          htmlFor="pshare-message"
          hint="Shown at the top of their page."
        >
          <Input
            id="pshare-message"
            maxLength={300}
            placeholder="e.g. Goa trip — settle when you can 🙂"
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
          />
        </Field>

        <Field
          label="Link expires on"
          htmlFor="pshare-expires"
          hint="Empty = until you delete it."
        >
          <DateInput
            id="pshare-expires"
            min={todayStr()}
            value={form.expiresOn}
            onChange={(v) => set("expiresOn", v)}
          />
        </Field>

        <Field
          label={hasPassword ? "Change password" : "Password (optional)"}
          htmlFor="pshare-password"
          hint={
            !passwordValid
              ? "At least 4 characters."
              : hasPassword
                ? "Leave empty to keep the current password."
                : "They will be asked for it once per device."
          }
        >
          <PasswordInput
            id="pshare-password"
            autoComplete="new-password"
            maxLength={64}
            disabled={form.removePassword}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        {hasPassword && (
          <label className="flex items-center justify-between gap-3 text-sm">
            Remove the password
            <Switch
              checked={form.removePassword}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, removePassword: v, password: "" }))
              }
            />
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Your UPI ID (optional)"
            htmlFor="pshare-upi"
            hint={
              upiValid
                ? "Shown as a QR code for what they owe you."
                : "That doesn't look like a UPI ID (name@bank)."
            }
          >
            <Input
              id="pshare-upi"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="name@bank"
              aria-invalid={!upiValid}
              value={form.upiId}
              onChange={(e) => set("upiId", e.target.value)}
            />
          </Field>
          <Field
            label="Name on UPI"
            htmlFor="pshare-payee"
            hint="Empty = your name."
          >
            <Input
              id="pshare-payee"
              maxLength={60}
              value={form.payeeName}
              onChange={(e) => set("payeeName", e.target.value)}
            />
          </Field>
        </div>

        {upiId && (
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            <span>
              <span className="block font-medium">
                Add a "Pay with a UPI app" button
              </span>
              <span className="block text-xs text-muted-foreground">
                Many apps refuse payments started from a link, so by default
                they only get the QR code to scan.
              </span>
            </span>
            <Switch
              checked={form.payButton}
              onCheckedChange={(v) => set("payButton", v)}
            />
          </label>
        )}

        <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <span>
            <span className="block font-medium">
              Show who else was on each bill
            </span>
            <span className="block text-xs text-muted-foreground">
              Off = {first} only sees the bill's total and their own share.
            </span>
          </span>
          <Switch
            checked={form.showOthers}
            onCheckedChange={(v) => set("showOthers", v)}
          />
        </label>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!upiValid || !passwordValid || save.isPending}
        >
          {save.isPending
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Create link & copy"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

/** A person's public links: create, copy, edit, delete. */
export function PersonLinks({
  personId,
  name,
}: {
  personId: number;
  name: string;
}) {
  const { data: links = [] } = usePersonShares(personId);
  // Start a new link with the UPI details of any earlier link.
  const { data: bookLinks = [] } = useShares();
  const del = useDeletePersonShare();
  const [sheet, setSheet] = useState<{
    open: boolean;
    editing: PersonShare | null;
  }>({ open: false, editing: null });
  const first = name.split(" ")[0] ?? name;
  const lastUpi =
    links.find((s) => s.upiId) ?? bookLinks.find((s) => s.upiId) ?? undefined;

  return (
    <SectionCard
      title="Share with a link"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSheet({ open: true, editing: null })}
        >
          <Plus /> New link
        </Button>
      }
    >
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Send {first} a read-only page of every bill you've split, payments and
          the balance — with an optional password and your UPI QR so they can
          pay you back. They don't need the app.
        </p>
      ) : (
        <ul className="divide-y">
          {links.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                {s.protection === "password" ? (
                  <Lock className="size-4" />
                ) : (
                  <Link2 className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {s.message || `Link from ${shortDate(s.createdAt)}`}
                  {s.expired && (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      EXPIRED
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    s.viewCount
                      ? `Opened ${s.viewCount} ${s.viewCount === 1 ? "time" : "times"}`
                      : "Not opened yet",
                    s.lastViewedAt && `last ${shortDate(s.lastViewedAt)}`,
                    s.expiresOn &&
                      !s.expired &&
                      `expires ${shortDate(s.expiresOn)}`,
                    s.upiId && "UPI",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy link"
                onClick={() => copyPersonLink(s.token)}
              >
                <Copy />
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href={personShareUrl(s.token)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open link"
                >
                  <ExternalLink />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit link"
                onClick={() => setSheet({ open: true, editing: s })}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete link"
                className="text-destructive"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete this link?",
                      description: `It stops opening for ${first} and anyone they sent it to.`,
                      confirmText: "Delete",
                      destructive: true,
                    })
                  )
                    del.mutate(s.id);
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PersonLinkSheet
        personId={personId}
        first={first}
        open={sheet.open}
        editing={sheet.editing}
        lastUpi={lastUpi}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </SectionCard>
  );
}

/** "I've paid you back" reports from this person's links. Confirming
 * records a payment received from them; dismissing records nothing. */
export function SettlementClaims({
  personId,
  name,
}: {
  personId: number;
  name: string;
}) {
  const { data: claims = [] } = useSettlementClaims(personId);
  const decide = useDecideSettlementClaim();
  if (!claims.length) return null;
  const first = name.split(" ")[0] ?? name;
  return (
    <SectionCard title="Payments reported">
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        {first} says they paid you. Check your bank first, then confirm to
        update the balance.
      </p>
      <ul className="divide-y">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <HandCoins className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="tabular font-semibold">{formatAmount(c.amount)}</p>
              <p className="text-xs wrap-break-word text-muted-foreground">
                {[
                  c.note,
                  c.reference && `Ref ${c.reference}`,
                  shortDate(c.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ dismiss: c.id })}
              >
                Not received
              </Button>
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ confirm: c.id })}
              >
                Confirm
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
