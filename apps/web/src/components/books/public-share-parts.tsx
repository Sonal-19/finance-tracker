import { Copy, Lock, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upiLink } from "@/hooks/use-shares";
import { formatAmount, fromAmount, toAmount } from "@/lib/format";

/** The password step of a protected share link. */
export function UnlockForm({
  ownerName,
  pending,
  error,
  onUnlock,
}: {
  ownerName: string;
  pending: boolean;
  error: Error | null;
  onUnlock: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="mx-auto mt-10 max-w-sm space-y-4 rounded-3xl border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onUnlock(password);
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
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!password || pending}
      >
        {pending ? "Checking…" : "Open"}
      </Button>
    </form>
  );
}

/** A UPI QR (and optional app button) for paying the link's owner. */
export function PayCard({
  upi,
  due,
  note,
}: {
  upi: { id: string; payeeName: string; button: "hidden" | "shown" };
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
        Scan this QR code with any UPI app.
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
          {upi.button === "shown" && (
            <Button size="lg" className="w-full" asChild>
              <a href={link}>
                <Smartphone /> Pay
                {amount > 0 ? ` ${formatAmount(amount)}` : ""} with a UPI app
              </a>
            </Button>
          )}
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
