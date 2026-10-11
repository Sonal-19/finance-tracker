import {
  Copy,
  ExternalLink,
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
  type Share,
  shareUrl,
  useDeleteShare,
  useSaveShare,
  useShares,
} from "@/hooks/use-shares";
import { shortDate, todayStr } from "@/lib/format";

const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** "1 Sep 2026 – 30 Sep 2026", "from 1 Sep 2026", "until 30 Sep 2026". */
export function periodLabel(from: string | null, to: string | null) {
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  if (from) return `from ${shortDate(from)}`;
  if (to) return `until ${shortDate(to)}`;
  return null;
}

async function copyLink(token: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(token));
    toast.success("Link copied");
  } catch {
    toast.error(
      "Couldn't copy. Open the link and copy it from the address bar.",
    );
  }
}

type Form = {
  message: string;
  fromDate: string;
  toDate: string;
  expiresOn: string;
  password: string;
  removePassword: boolean;
  upiId: string;
  payeeName: string;
  showFiles: boolean;
};

function ShareSheet({
  bookId,
  open,
  editing,
  lastUpi,
  onClose,
}: {
  bookId: number;
  open: boolean;
  editing: Share | null;
  /** UPI details of the user's latest link, to start a new one with. */
  lastUpi?: { upiId: string | null; payeeName: string | null };
  onClose: () => void;
}) {
  const save = useSaveShare();
  const [form, setForm] = useState<Form>({
    message: "",
    fromDate: "",
    toDate: "",
    expiresOn: "",
    password: "",
    removePassword: false,
    upiId: "",
    payeeName: "",
    showFiles: false,
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm({
      message: editing?.message ?? "",
      fromDate: editing?.fromDate ?? "",
      toDate: editing?.toDate ?? "",
      expiresOn: editing?.expiresOn ?? "",
      password: "",
      removePassword: false,
      upiId: (editing ? editing.upiId : lastUpi?.upiId) ?? "",
      payeeName: (editing ? editing.payeeName : lastUpi?.payeeName) ?? "",
      showFiles: editing?.attachments === "shown",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const upiId = form.upiId.trim();
  const upiValid = !upiId || UPI_ID.test(upiId);
  const periodValid =
    !form.fromDate || !form.toDate || form.toDate >= form.fromDate;
  const passwordValid = !form.password || form.password.length >= 4;
  const hasPassword = editing?.protection === "password";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiValid || !passwordValid || !periodValid) return;
    save.mutate(
      {
        id: editing?.id,
        bookId,
        message: form.message.trim() || null,
        fromDate: form.fromDate || null,
        toDate: form.toDate || null,
        expiresOn: form.expiresOn || null,
        upiId: upiId || null,
        payeeName: form.payeeName.trim() || null,
        attachments: form.showFiles ? "shown" : "hidden",
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
          else copyLink(data.token);
        },
      },
    );
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Edit link" : "Share this book"}
      description="Anyone with the link can see this book's entries. They can't change anything."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Message (optional)"
          htmlFor="share-message"
          hint="Shown at the top of the page."
        >
          <Input
            id="share-message"
            maxLength={300}
            placeholder="e.g. Office expenses for September"
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
          />
        </Field>

        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Entries from" htmlFor="share-from">
              <DateInput
                id="share-from"
                max={form.toDate || undefined}
                value={form.fromDate}
                onChange={(v) => set("fromDate", v)}
              />
            </Field>
            <Field label="Entries to" htmlFor="share-to">
              <DateInput
                id="share-to"
                min={form.fromDate || undefined}
                value={form.toDate}
                onChange={(v) => set("toDate", v)}
              />
            </Field>
          </div>
          <p
            className={
              periodValid
                ? "text-xs text-muted-foreground"
                : "text-xs text-destructive"
            }
          >
            {periodValid
              ? "Leave both empty to share the whole book. Payments received after the end date still count."
              : "The end date is before the start date."}
          </p>
        </div>

        <Field
          label="Link expires on"
          htmlFor="share-expires"
          hint="Empty = until you delete it."
        >
          <DateInput
            id="share-expires"
            min={todayStr()}
            value={form.expiresOn}
            onChange={(v) => set("expiresOn", v)}
          />
        </Field>

        <Field
          label={hasPassword ? "Change password" : "Password (optional)"}
          htmlFor="share-password"
          hint={
            !passwordValid
              ? "At least 4 characters."
              : hasPassword
                ? "Leave empty to keep the current password."
                : "They will be asked for it once per device."
          }
        >
          <PasswordInput
            id="share-password"
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
            htmlFor="share-upi"
            hint={
              upiValid
                ? "Shown as a QR code so they can pay you."
                : "That doesn't look like a UPI ID (name@bank)."
            }
          >
            <Input
              id="share-upi"
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
            htmlFor="share-payee"
            hint="Empty = your name."
          >
            <Input
              id="share-payee"
              maxLength={60}
              value={form.payeeName}
              onChange={(e) => set("payeeName", e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <span>
            <span className="block font-medium">Show attached bills</span>
            <span className="block text-xs text-muted-foreground">
              Lets them open the photos and PDFs on each entry.
            </span>
          </span>
          <Switch
            checked={form.showFiles}
            onCheckedChange={(v) => set("showFiles", v)}
          />
        </label>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={
            !upiValid || !passwordValid || !periodValid || save.isPending
          }
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

/** A book's public links: create, copy, edit, delete. */
export function ShareLinks({ bookId }: { bookId: number }) {
  const { data: all = [] } = useShares();
  const del = useDeleteShare();
  const [sheet, setSheet] = useState<{ open: boolean; editing: Share | null }>({
    open: false,
    editing: null,
  });
  const links = all.filter((s) => s.bookId === bookId);

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
          Send someone a read-only page of this book, with an optional password
          and your UPI QR code so they can pay you back.
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
                    periodLabel(s.fromDate, s.toDate),
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
                onClick={() => copyLink(s.token)}
              >
                <Copy />
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href={shareUrl(s.token)}
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
                      description: "It stops opening for everyone who has it.",
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
      <ShareSheet
        bookId={bookId}
        open={sheet.open}
        editing={sheet.editing}
        lastUpi={all.find((s) => s.upiId)}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </SectionCard>
  );
}
