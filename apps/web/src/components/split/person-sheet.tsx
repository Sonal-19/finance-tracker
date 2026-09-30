import { useState } from "react";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PersonInput, useSavePerson } from "@/hooks/use-splits";
import { RELATIONS } from "@/lib/split";
import { cn } from "@/lib/utils";

export type EditablePerson = PersonInput & { id?: number };

/** Add / edit someone you split money with (friend, office, family, anyone). */
export function PersonSheet({
  value,
  onClose,
  onSaved,
}: {
  value: EditablePerson | null;
  onClose: () => void;
  onSaved?: (person: { id: number; name: string }) => void;
}) {
  const save = useSavePerson();
  const [form, setForm] = useState<PersonInput>({
    name: "",
    phone: "",
    email: "",
    relation: "friend",
  });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value)
      setForm({
        name: value.name,
        phone: value.phone ?? "",
        email: value.email ?? "",
        relation: value.relation,
      });
  }

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.id ? "Edit person" : "Add person"}
      description="Friends, office colleagues, cousins and relatives — anyone you share costs with."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { id: value?.id, ...form },
            {
              onSuccess: ({ data }) => {
                if (data) onSaved?.({ id: data.id, name: data.name });
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Name" htmlFor="person-name">
          <Input
            id="person-name"
            required
            maxLength={60}
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Rahul Sharma"
          />
        </Field>
        <div className="space-y-2">
          <Label>Who is this?</Label>
          <div className="grid grid-cols-2 gap-2">
            {RELATIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setForm({ ...form, relation: r.value })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm transition-colors",
                  form.relation === r.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Phone (optional)"
            htmlFor="person-phone"
            hint="Used for WhatsApp reminders."
          >
            <Input
              id="person-phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="98765 43210"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="person-email">
            <Input
              id="person-email"
              type="email"
              maxLength={254}
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!form.name.trim() || save.isPending}
        >
          {value?.id ? "Save" : "Add person"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
