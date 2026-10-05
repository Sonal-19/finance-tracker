import { useState } from "react";
import { CategoryIcon, COLORS } from "@/components/common/category-icon";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type BookInput, useSaveBook } from "@/hooks/use-books";
import { BOOK_ICONS } from "@/lib/accounts";
import { cn } from "@/lib/utils";

export type EditableBook = BookInput & { id?: number };

const TOTALS = [
  {
    value: "included",
    label: "Counts in my totals",
    hint: "My own spending, like Family or Home. Shows in my reports and budgets.",
  },
  {
    value: "separate",
    label: "Kept separate",
    hint: "Paid on someone's behalf, like Office. Left out of my reports; tracks what I'm yet to get back.",
  },
] as const;

/** Create / edit a book (Personal, Family, Office…). */
export function BookSheet({
  value,
  onClose,
}: {
  value: EditableBook | null;
  onClose: () => void;
}) {
  const save = useSaveBook();
  const [form, setForm] = useState<EditableBook>({
    name: "",
    icon: "book-open",
    color: "#7c3aed",
    note: "",
    totals: "included",
  });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value) setForm({ ...value, note: value.note ?? "" });
  }

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Edit book" : "New book"}
      description="Keep entries for the family, the office or a side business in one place."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              id: value?.id,
              name: form.name,
              icon: form.icon,
              color: form.color,
              note: form.note?.trim() || null,
              totals: form.totals,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <div className="flex items-end gap-3">
          <CategoryIcon icon={form.icon} color={form.color} size="lg" />
          <Field label="Book name" htmlFor="book-name" className="flex-1">
            <Input
              id="book-name"
              required
              maxLength={40}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Family, Office, Shop…"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {BOOK_ICONS.map((i) => (
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
        <div className="space-y-2">
          <Label>Whose money is it?</Label>
          <div role="radiogroup" className="space-y-2">
            {TOTALS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={form.totals === t.value}
                onClick={() => setForm({ ...form, totals: t.value })}
                className={cn(
                  "block w-full rounded-xl border p-3 text-left transition-colors",
                  form.totals === t.value
                    ? "border-primary bg-accent"
                    : "hover:bg-muted",
                )}
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Note (optional)" htmlFor="book-note">
          <Input
            id="book-note"
            maxLength={300}
            value={form.note ?? ""}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!form.name.trim() || save.isPending}
        >
          {save.isPending ? "Saving…" : value?.id ? "Save changes" : "Add book"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
