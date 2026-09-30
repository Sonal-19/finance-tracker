import { Check, UserPlus } from "lucide-react";
import { useState } from "react";
import { CategoryIcon, COLORS } from "@/components/common/category-icon";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type GroupInput, usePeople, useSaveGroup } from "@/hooks/use-splits";
import { cn } from "@/lib/utils";
import { type EditablePerson, PersonSheet } from "./person-sheet";
import { PersonAvatar } from "./split-common";

const GROUP_ICONS = [
  "users",
  "plane",
  "home",
  "briefcase",
  "utensils",
  "car",
  "gift",
  "heart-pulse",
  "shopping-bag",
  "graduation-cap",
];

export function GroupSheet({
  value,
  onClose,
}: {
  value: (GroupInput & { id?: number }) | null;
  onClose: () => void;
}) {
  const { data: people = [] } = usePeople();
  const save = useSaveGroup();
  const [form, setForm] = useState<GroupInput>({
    name: "",
    icon: "users",
    color: "#0d9488",
    memberIds: [],
  });
  const [addPerson, setAddPerson] = useState<EditablePerson | null>(null);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value)
      setForm({
        name: value.name,
        icon: value.icon,
        color: value.color,
        memberIds: value.memberIds,
      });
  }
  const toggle = (id: number) =>
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(id)
        ? f.memberIds.filter((x) => x !== id)
        : [...f.memberIds, id],
    }));

  return (
    <>
      <ResponsiveSheet
        open={!!value}
        onOpenChange={(o) => !o && onClose()}
        title={value?.id ? "Edit group" : "New group"}
        description="e.g. Goa trip, Flat 402, Office lunch gang, Cousins."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ id: value?.id, ...form }, { onSuccess: onClose });
          }}
        >
          <div className="flex items-end gap-3">
            <CategoryIcon icon={form.icon} color={form.color} size="lg" />
            <Field label="Group name" htmlFor="group-name" className="flex-1">
              <Input
                id="group-name"
                required
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Goa trip"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {GROUP_ICONS.map((i) => (
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Members ({form.memberIds.length})</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddPerson({ name: "", relation: "friend" })}
              >
                <UserPlus /> New person
              </Button>
            </div>
            {people.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                Add the people in this group first.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {people.map((p) => {
                  const on = form.memberIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-2 text-left",
                        on
                          ? "border-ring bg-accent"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <PersonAvatar
                        name={p.name}
                        id={p.id}
                        className="size-8 text-xs"
                      />
                      <span className="flex-1 truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full border",
                          on &&
                            "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {on && <Check className="size-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You are always part of your groups.
            </p>
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!form.name.trim() || save.isPending}
          >
            {value?.id ? "Save group" : "Create group"}
          </Button>
        </form>
      </ResponsiveSheet>
      <PersonSheet
        value={addPerson}
        onClose={() => setAddPerson(null)}
        onSaved={(p) =>
          setForm((f) => ({ ...f, memberIds: [...f.memberIds, p.id] }))
        }
      />
    </>
  );
}
