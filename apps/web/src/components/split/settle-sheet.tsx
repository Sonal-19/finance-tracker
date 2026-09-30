import { useState } from "react";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddSettlement } from "@/hooks/use-splits";
import {
  money,
  PAYMENT_METHODS,
  type PaymentMethod,
  todayStr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type SettleTarget = {
  personId: number;
  name: string;
  /** Current net balance: > 0 they owe you, < 0 you owe them. */
  net: number;
  groupId?: number | null;
};

/** Record money received from / paid to someone (full or partial). */
export function SettleSheet({
  value,
  onClose,
}: {
  value: SettleTarget | null;
  onClose: () => void;
}) {
  const add = useAddSettlement();
  const [direction, setDirection] = useState<"received" | "paid">("received");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [note, setNote] = useState("");
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value) {
      setDirection(value.net < 0 ? "paid" : "received");
      setAmount(
        Math.abs(value.net) > 0
          ? String(Math.round(Math.abs(value.net) * 100) / 100)
          : "",
      );
      setDate(todayStr());
      setMethod("upi");
      setNote("");
    }
  }
  const first = value?.name.split(" ")[0] ?? "";

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={`Settle up with ${first}`}
      description={
        value && Math.abs(value.net) > 0.005
          ? value.net > 0
            ? `${first} owes you ${money(value.net)}`
            : `You owe ${first} ${money(-value.net)}`
          : "You're all settled up"
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value || !(Number(amount) > 0)) return;
          add.mutate(
            {
              personId: value.personId,
              groupId: value.groupId ?? null,
              direction,
              amount: Number(amount),
              date,
              paymentMethod: method,
              note: note.trim() || null,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <Segmented
          className="w-full"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "received", label: `${first} paid me` },
            { value: "paid", label: `I paid ${first}` },
          ]}
        />
        <Field
          label="Amount (₹)"
          htmlFor="settle-amount"
          hint="Partial payments are fine."
        >
          <Input
            id="settle-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="text-lg font-semibold"
          />
        </Field>
        <Field label="Date" htmlFor="settle-date">
          <Input
            id="settle-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="space-y-2">
          <Label>Paid via</Label>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {PAYMENT_METHODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setMethod(p.value)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-2 text-sm",
                  method === p.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Note (optional)" htmlFor="settle-note">
          <Input
            id="settle-note"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. GPay"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!(Number(amount) > 0) || add.isPending}
        >
          Record payment
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
