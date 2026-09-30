import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  CategoryIcon,
  COLORS,
  ICON_NAMES,
} from "@/components/common/category-icon";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type Category,
  type TxnType,
  useCategories,
  useDeleteCategory,
  useSaveCategory,
} from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const { data = [], isLoading } = useCategories();
  const [type, setType] = useState<TxnType>("debit");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const list = data.filter((c) => c.type === type);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description="Organise your income and expenses your way."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New category
          </Button>
        }
      />
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: "debit", label: "Expense (Debit)" },
          { value: "credit", label: "Income (Credit)" },
        ]}
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3"
            >
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.txnCount} transaction{c.txnCount === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit category"
                onClick={() => setEditing(c)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete category"
                onClick={() => setDeleting(c)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
      <CategorySheet
        value={editing}
        defaultType={type}
        onClose={() => setEditing(null)}
      />
      <DeleteCategorySheet
        value={deleting}
        all={data}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function CategorySheet({
  value,
  defaultType,
  onClose,
}: {
  value: Category | "new" | null;
  defaultType: TxnType;
  onClose: () => void;
}) {
  const save = useSaveCategory();
  const [form, setForm] = useState({
    name: "",
    type: defaultType,
    icon: "shopping-cart",
    color: COLORS[0]!,
  });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setForm(
      value && value !== "new"
        ? {
            name: value.name,
            type: value.type,
            icon: value.icon,
            color: value.color,
          }
        : {
            name: "",
            type: defaultType,
            icon: "shopping-cart",
            color: COLORS[12]!,
          },
    );
  }
  const isNew = value === "new";
  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "New category" : "Edit category"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { id: isNew || !value ? undefined : value.id, ...form },
            { onSuccess: onClose },
          );
        }}
      >
        <div className="flex items-center gap-3">
          <CategoryIcon icon={form.icon} color={form.color} size="lg" />
          <Field label="Name" htmlFor="cat-name" className="flex-1">
            <Input
              id="cat-name"
              required
              maxLength={40}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Gym"
            />
          </Field>
        </div>
        {isNew && (
          <Segmented
            className="w-full"
            value={form.type}
            onChange={(t) => setForm({ ...form, type: t })}
            options={[
              { value: "debit", label: "Expense" },
              { value: "credit", label: "Income" },
            ]}
          />
        )}
        <div className="space-y-2">
          <Label>Icon</Label>
          <div className="grid grid-cols-8 gap-1.5">
            {ICON_NAMES.map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i}
                onClick={() => setForm({ ...form, icon: i })}
                className={cn(
                  "grid place-items-center rounded-full p-0.5",
                  form.icon === i && "ring-2 ring-ring",
                )}
              >
                <CategoryIcon icon={i} color={form.color} size="sm" />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Colour</Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setForm({ ...form, color: c })}
                className={cn(
                  "size-8 rounded-full",
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
          Save category
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

function DeleteCategorySheet({
  value,
  all,
  onClose,
}: {
  value: Category | null;
  all: Category[];
  onClose: () => void;
}) {
  const del = useDeleteCategory();
  const [target, setTarget] = useState<number | null>(null);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setTarget(null);
  }
  const inUse = (value?.txnCount ?? 0) > 0;
  const others = all.filter(
    (c) => value && c.type === value.type && c.id !== value.id,
  );
  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete "${value?.name}"?`}
      description={
        inUse
          ? `It's used by ${value?.txnCount} transaction(s). Move them to another category first.`
          : "This can't be undone."
      }
    >
      <div className="space-y-4">
        {inUse && (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
            {others.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setTarget(c.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 text-left text-sm",
                  target === c.id && "border-ring bg-accent",
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={(inUse && !target) || del.isPending}
            onClick={() =>
              value &&
              del.mutate(
                { id: value.id, reassignTo: target ?? undefined },
                { onSuccess: onClose },
              )
            }
          >
            {inUse ? "Move & delete" : "Delete"}
          </Button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
