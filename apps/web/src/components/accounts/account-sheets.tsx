import { ArrowDown } from "lucide-react";
import { useState } from "react";
import { AccountPicker } from "@/components/app/pickers";
import { CategoryIcon, COLORS } from "@/components/common/category-icon";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AccountInput,
  useActiveAccounts,
  useAddTransfer,
  useSaveAccount,
} from "@/hooks/use-accounts";
import { ACCOUNT_TYPES } from "@/lib/accounts";
import { todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EditableAccount = AccountInput & { id?: number };

const ICONS = [
  "landmark",
  "banknote",
  "credit-card",
  "wallet",
  "piggy-bank",
  "smartphone",
  "briefcase",
  "home",
];

/** Add / edit a payment method (bank, cash, card, wallet…). */
export function AccountSheet({
  value,
  onClose,
}: {
  value: EditableAccount | null;
  onClose: () => void;
}) {
  const save = useSaveAccount();
  const [form, setForm] = useState<AccountInput & { opening: string }>({
    name: "",
    type: "bank",
    icon: "landmark",
    color: "#2563eb",
    openingBalance: 0,
    opening: "",
  });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value)
      setForm({
        ...value,
        opening: value.openingBalance ? String(value.openingBalance) : "",
      });
  }
  const isCard = form.type === "credit_card";

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Edit payment method" : "Add payment method"}
      description="Bank accounts, UPI apps, cash, credit cards, wallets — whatever you pay with."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const opening = Number(form.opening || 0);
          save.mutate(
            {
              id: value?.id,
              name: form.name,
              type: form.type,
              icon: form.icon,
              color: form.color,
              // Card dues are money you owe: store them as a negative balance.
              openingBalance: isCard ? -Math.abs(opening) : opening,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  type: t.value,
                  // Follow the type's look unless the user customised it.
                  ...(ACCOUNT_TYPES.some((x) => x.icon === f.icon) && {
                    icon: t.icon,
                    color: t.color,
                  }),
                }))
              }
              className={cn(
                "flex items-center gap-2 rounded-xl border p-2 text-left text-sm",
                form.type === t.value
                  ? "border-primary bg-accent"
                  : "hover:bg-muted",
              )}
            >
              <CategoryIcon icon={t.icon} color={t.color} size="sm" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <CategoryIcon icon={form.icon} color={form.color} size="lg" />
          <Field label="Name" htmlFor="acc-name" className="flex-1">
            <Input
              id="acc-name"
              required
              maxLength={40}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={
                isCard
                  ? "SBI Credit Card"
                  : form.type === "cash"
                    ? "Cash"
                    : "HDFC Bank"
              }
            />
          </Field>
        </div>
        <Field
          label={isCard ? "Current outstanding (₹)" : "Current balance (₹)"}
          htmlFor="acc-opening"
          hint={
            isCard
              ? "What you already owe on this card, if anything."
              : "What's in it right now, before you start tracking. Can be changed later."
          }
        >
          <Input
            id="acc-opening"
            inputMode="decimal"
            value={form.opening}
            onChange={(e) =>
              setForm({
                ...form,
                opening: e.target.value.replace(/[^\d.-]/g, ""),
              })
            }
            placeholder="0"
          />
        </Field>
        <div className="space-y-2">
          <Label>Look</Label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i}
                onClick={() => setForm({ ...form, icon: i })}
                className={cn(
                  "rounded-full p-0.5",
                  form.icon === i && "ring-2 ring-ring",
                )}
              >
                <CategoryIcon icon={i} color={form.color} size="sm" />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {COLORS.slice(0, 12).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setForm({ ...form, color: c })}
                className={cn(
                  "size-7 rounded-full",
                  form.color === c &&
                    "ring-2 ring-ring ring-offset-2 ring-offset-card",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!form.name.trim() || save.isPending}
        >
          {value?.id ? "Save" : "Add payment method"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

/** Move money between two accounts (ATM withdrawal, paying a card bill…). */
export function TransferSheet({
  open,
  fromId,
  onClose,
}: {
  open: boolean;
  fromId?: number;
  onClose: () => void;
}) {
  const add = useAddTransfer();
  const { list, defaultAccount } = useActiveAccounts();
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const f = fromId ?? defaultAccount?.id ?? null;
      setFrom(f);
      setTo(list.find((a) => a.id !== f)?.id ?? null);
      setAmount("");
      setDate(todayStr());
      setNote("");
    }
  }
  const valid = from && to && from !== to && Number(amount) > 0;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Transfer between payment methods"
      description="Not income or expense — just moves money, e.g. ATM withdrawal or paying the card bill."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          add.mutate(
            {
              fromAccountId: from!,
              toAccountId: to!,
              amount: Number(amount),
              date,
              note: note.trim() || null,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <AccountPicker
          label="From"
          value={from}
          onChange={(id) => {
            setFrom(id);
            if (id === to) setTo(null);
          }}
        />
        <div className="flex justify-center text-muted-foreground">
          <ArrowDown className="size-5" />
        </div>
        <AccountPicker label="To" value={to} exclude={from} onChange={setTo} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)" htmlFor="tr-amount">
            <Input
              id="tr-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="5000"
            />
          </Field>
          <Field label="Date" htmlFor="tr-date">
            <Input
              id="tr-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="tr-note">
          <Input
            id="tr-note"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ATM withdrawal"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!valid || add.isPending}
        >
          Transfer
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
