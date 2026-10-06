import { useState } from "react";
import { CategoryIcon, COLORS } from "@/components/common/category-icon";
import { CollapsibleGrid } from "@/components/common/collapsible-grid";
import { DateInput } from "@/components/common/date-input";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type EventInput, useSaveEvent } from "@/hooks/use-accounts";
import { EVENT_ICONS } from "@/lib/accounts";
import { fromAmount, toAmount, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EditableEvent = EventInput & { id?: number };

type Form = {
  name: string;
  icon: string;
  color: string;
  startDate: string;
  endDate: string;
  budget: string;
  note: string;
  isActive: boolean;
};

/** Create / edit an occasion (festival, wedding, trip…). */
export function EventSheet({
  value,
  onClose,
}: {
  value: EditableEvent | null;
  onClose: () => void;
}) {
  const save = useSaveEvent();
  const [form, setForm] = useState<Form>({
    name: "",
    icon: "party-popper",
    color: "#f97316",
    startDate: "",
    endDate: "",
    budget: "",
    note: "",
    isActive: false,
  });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value)
      setForm({
        name: value.name,
        icon: value.icon,
        color: value.color,
        startDate: value.startDate ?? "",
        endDate: value.endDate ?? "",
        budget: value.budget ? String(fromAmount(value.budget)) : "",
        note: value.note ?? "",
        isActive: value.activation === "active",
      });
  }
  const badRange =
    !!form.startDate && !!form.endDate && form.endDate < form.startDate;

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Edit event" : "New event"}
      description="Group everything you spend on one occasion — food, clothes, groceries, travel."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (badRange) return;
          save.mutate(
            {
              id: value?.id,
              name: form.name,
              icon: form.icon,
              color: form.color,
              startDate: form.startDate || null,
              endDate: form.endDate || null,
              budget: form.budget ? toAmount(Number(form.budget)) : null,
              note: form.note.trim() || null,
              activation: form.isActive ? "active" : "inactive",
            },
            { onSuccess: onClose },
          );
        }}
      >
        <div className="flex items-end gap-3">
          <CategoryIcon icon={form.icon} color={form.color} size="lg" />
          <Field label="Event name" htmlFor="ev-name" className="flex-1">
            <Input
              id="ev-name"
              required
              maxLength={60}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Diwali mela, Riya's wedding, Goa trip…"
            />
          </Field>
        </div>
        <CollapsibleGrid
          selectedIndex={EVENT_ICONS.indexOf(form.icon)}
          className="grid-cols-[repeat(auto-fill,2.25rem)] gap-2"
        >
          {EVENT_ICONS.map((i) => (
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
        </CollapsibleGrid>
        <div className="flex flex-wrap gap-2">
          {COLORS.slice(0, 14).map((c) => (
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (optional)" htmlFor="ev-start">
            <DateInput
              id="ev-start"
              value={form.startDate}
              onChange={(v) => setForm({ ...form, startDate: v })}
            />
          </Field>
          <Field label="Ends (optional)" htmlFor="ev-end">
            <DateInput
              id="ev-end"
              min={form.startDate || undefined}
              value={form.endDate}
              onChange={(v) => setForm({ ...form, endDate: v })}
              aria-invalid={badRange}
            />
          </Field>
        </div>
        {badRange && (
          <p className="text-sm text-destructive">
            End date must be after the start date.
          </p>
        )}
        <Field
          label="Budget (optional, ₹)"
          htmlFor="ev-budget"
          hint="We'll warn you as you get close."
        >
          <Input
            id="ev-budget"
            inputMode="decimal"
            value={form.budget}
            onChange={(e) =>
              setForm({
                ...form,
                budget: e.target.value.replace(/[^\d.]/g, ""),
              })
            }
            placeholder="5000"
          />
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
          <div>
            <Label htmlFor="ev-active" className="font-medium">
              Happening now
            </Label>
            <p className="text-xs text-muted-foreground">
              New transactions are tagged to this event until you turn it off
              {form.endDate ? " or it ends" : ""}.
            </p>
          </div>
          <Switch
            id="ev-active"
            checked={form.isActive}
            onCheckedChange={(v) =>
              setForm((f) => ({
                ...f,
                isActive: v,
                // Turning it on with no dates starts it today.
                ...(v && !f.startDate && { startDate: todayStr() }),
              }))
            }
          />
        </div>
        <Field label="Note (optional)" htmlFor="ev-note">
          <Input
            id="ev-note"
            maxLength={300}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!form.name.trim() || badRange || save.isPending}
        >
          {value?.id ? "Save event" : "Create event"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
