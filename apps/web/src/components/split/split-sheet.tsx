import { Check, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountPicker, EventPicker } from "@/components/app/pickers";
import { CategoryIcon } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActiveAccounts, useActiveEvent } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-finance";
import {
  useDeleteSplit,
  usePeople,
  useSaveSplit,
  useSplit,
  useSplitGroups,
} from "@/hooks/use-splits";
import { money, todayStr, ymd } from "@/lib/format";
import { previewShares, SPLIT_METHODS, type SplitMethod } from "@/lib/split";
import { cn } from "@/lib/utils";
import { useSplitSheet } from "@/stores/split-sheet-store";
import { type EditablePerson, PersonSheet } from "./person-sheet";
import { PersonAvatar } from "./split-common";

/** Participant key: "me" for the user, otherwise the person id. */
type Key = "me" | `${number}`;
const keyOf = (personId: number | null): Key =>
  personId === null ? "me" : `${personId}`;
const idOf = (k: Key) => (k === "me" ? null : Number(k));

type Form = {
  description: string;
  total: string;
  date: string;
  groupId: number | null;
  paidBy: Key;
  method: SplitMethod;
  selected: Key[];
  values: Record<string, string>;
  categoryId: number | null;
  recordExpense: boolean;
  accountId: number | null;
  eventId: number | null;
  note: string;
};

const blank = (): Form => ({
  description: "",
  total: "",
  date: todayStr(),
  groupId: null,
  paidBy: "me",
  method: "equal",
  selected: ["me"],
  values: {},
  categoryId: null,
  recordExpense: true,
  accountId: null,
  eventId: null,
  note: "",
});

export function SplitSheet() {
  const { open, editId, prefill, close } = useSplitSheet();
  const { data: people = [] } = usePeople();
  const { data: groups = [] } = useSplitGroups();
  const { data: categories = [] } = useCategories();
  const editing = useSplit(open ? editId : null);
  const save = useSaveSplit();
  const del = useDeleteSplit();
  const [form, setForm] = useState<Form>(blank);
  const [addPerson, setAddPerson] = useState<EditablePerson | null>(null);
  const [ready, setReady] = useState(false);

  const debitCats = categories.filter((c) => c.type === "debit");
  const { defaultAccount } = useActiveAccounts();
  const activeEvent = useActiveEvent();

  // Initialise the form once per opening (new with prefill, or from the split being edited).
  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    if (ready) return;
    if (editId) {
      const s = editing.data;
      if (!s) return;
      setForm({
        description: s.description,
        total: String(s.total),
        date: ymd(s.date),
        groupId: s.group?.id ?? null,
        paidBy: keyOf(s.paidBy?.id ?? null),
        method: s.method,
        selected: s.shares.map((x) => keyOf(x.personId)),
        values: Object.fromEntries(
          s.shares.map((x) => [
            keyOf(x.personId),
            x.value === null ? "" : String(x.value),
          ]),
        ),
        categoryId: s.category?.id ?? null,
        recordExpense: s.recordExpense,
        accountId: s.accountId,
        eventId: s.eventId,
        note: s.note ?? "",
      });
      setReady(true);
      return;
    }
    const f = blank();
    f.eventId = activeEvent?.id ?? null;
    if (prefill.groupId) {
      const g = groups.find((x) => x.id === prefill.groupId);
      f.groupId = prefill.groupId;
      if (g) f.selected = ["me", ...g.members.map((m) => keyOf(m.id))];
    }
    if (prefill.personId) f.selected = ["me", keyOf(prefill.personId)];
    if (prefill.fromTransaction) {
      const t = prefill.fromTransaction;
      f.total = String(t.amount);
      f.date = ymd(t.date);
      f.categoryId = t.categoryId;
      f.description = t.note || t.categoryName;
      f.accountId = t.accountId;
      f.eventId = t.eventId;
    }
    setForm(f);
    setReady(true);
  }, [open, ready, editId, editing.data, prefill, groups, activeEvent]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const total = Number(form.total);
  const nameOf = (k: Key) =>
    k === "me" ? "You" : (people.find((p) => p.id === Number(k))?.name ?? "?");

  const preview = useMemo(
    () =>
      previewShares(
        total,
        form.method,
        form.selected.map((k) => ({
          key: k,
          value: Number(form.values[k] ?? 0),
        })),
      ),
    [total, form.method, form.selected, form.values],
  );
  const myShare = form.selected.includes("me") ? (preview.amounts.me ?? 0) : 0;
  const meIn = form.selected.includes("me");
  const othersIn = form.selected.some((k) => k !== "me");

  const toggle = (k: Key) =>
    setForm((f) => {
      const on = f.selected.includes(k);
      const selected = on
        ? f.selected.filter((x) => x !== k)
        : [...f.selected, k];
      return { ...f, selected, paidBy: on && f.paidBy === k ? "me" : f.paidBy };
    });

  const pickGroup = (id: number | null) =>
    setForm((f) => {
      const g = groups.find((x) => x.id === id);
      return {
        ...f,
        groupId: id,
        selected: g ? ["me", ...g.members.map((m) => keyOf(m.id))] : f.selected,
        paidBy: "me",
      };
    });

  let problem: string | null = null;
  if (!form.description.trim()) problem = "Add a description";
  else if (!(total > 0)) problem = "Enter the total amount";
  else if (form.paidBy === "me" && !othersIn)
    problem = "Pick at least one person to split with";
  else if (form.paidBy !== "me" && !meIn)
    problem = "Include yourself when someone else paid";
  else if (preview.error) problem = preview.error;
  else if (meIn && form.recordExpense && !form.categoryId)
    problem = "Pick a category for your share";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    save.mutate(
      {
        id: editId ?? undefined,
        description: form.description.trim(),
        total: Math.round(total * 100) / 100,
        date: form.date,
        groupId: form.groupId,
        paidByPersonId: idOf(form.paidBy),
        method: form.method,
        participants: form.selected.map((k) => ({
          personId: idOf(k),
          ...(form.method !== "equal" && {
            value: Number(form.values[k] ?? 0),
          }),
        })),
        categoryId: form.categoryId,
        recordExpense: form.recordExpense,
        accountId: form.accountId,
        eventId: form.eventId,
        note: form.note.trim() || null,
        fromTransactionId: prefill.fromTransaction?.id,
      },
      { onSuccess: close },
    );
  };

  const onDelete = async () => {
    if (!editId) return;
    const ok = await confirm({
      title: "Delete this split?",
      description:
        "Balances will be recalculated and your share is removed from your expenses.",
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) del.mutate(editId, { onSuccess: close });
  };

  // Group members first, then everyone else.
  const group = groups.find((g) => g.id === form.groupId);
  const memberIds = new Set(group?.members.map((m) => m.id) ?? []);
  const orderedPeople = [...people].sort(
    (a, b) => Number(memberIds.has(b.id)) - Number(memberIds.has(a.id)),
  );
  const payer = form.paidBy;
  const inputSuffix = { equal: "", exact: "₹", percent: "%", shares: "×" }[
    form.method
  ];

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={(o) => !o && close()}
        title={
          editId
            ? "Edit split"
            : prefill.fromTransaction
              ? "Split this expense"
              : "Split an expense"
        }
      >
        {!ready ? (
          <PageLoader />
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="What was it for?" htmlFor="split-desc">
                <Input
                  id="split-desc"
                  maxLength={120}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Hotel in Goa, dinner, cab…"
                />
              </Field>
              <Field label="Date" htmlFor="split-date">
                <Input
                  id="split-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className="w-40"
                />
              </Field>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border-2 border-expense/30 px-4 py-2 focus-within:border-ring">
              <span className="text-3xl font-bold text-expense">₹</span>
              <input
                aria-label="Total amount"
                inputMode="decimal"
                placeholder="Total bill"
                className="tabular min-w-0 flex-1 bg-transparent py-1 text-3xl font-bold outline-none placeholder:text-lg placeholder:font-medium placeholder:text-muted-foreground/50"
                value={form.total}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  if (/^\d{0,10}(\.\d{0,2})?$/.test(v)) set("total", v);
                }}
              />
            </div>

            {groups.length > 0 && (
              <div className="space-y-2">
                <Label>Group (optional)</Label>
                <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                  <button
                    type="button"
                    onClick={() => pickGroup(null)}
                    className={cn(
                      "shrink-0 rounded-full border px-3.5 py-2 text-sm",
                      form.groupId === null
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    No group
                  </button>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => pickGroup(g.id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm",
                        form.groupId === g.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Split between</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddPerson({ name: "", relation: "friend" })}
                >
                  <UserPlus /> New person
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  ["me", ...orderedPeople.map((p) => keyOf(p.id))] as Key[]
                ).map((k) => {
                  const on = form.selected.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(k)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                        on
                          ? "border-primary bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <PersonAvatar
                        name={nameOf(k)}
                        id={idOf(k)}
                        className="size-7 text-[10px]"
                      />
                      {nameOf(k)}
                      {on && <Check className="size-3.5" />}
                    </button>
                  );
                })}
              </div>
              {people.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add friends, office colleagues or relatives with “New person”.
                </p>
              )}
            </div>

            {form.selected.length > 1 && (
              <div className="space-y-2">
                <Label>Paid by</Label>
                <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                  {form.selected.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set("paidBy", k)}
                      className={cn(
                        "shrink-0 rounded-full border px-3.5 py-2 text-sm",
                        payer === k
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      {nameOf(k)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Segmented
                className="w-full"
                size="sm"
                value={form.method}
                onChange={(m) => set("method", m)}
                options={SPLIT_METHODS}
              />
              <ul className="divide-y rounded-xl border">
                {form.selected.map((k) => (
                  <li key={k} className="flex items-center gap-3 px-3 py-2">
                    <PersonAvatar
                      name={nameOf(k)}
                      id={idOf(k)}
                      className="size-8 text-xs"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {nameOf(k)}
                    </span>
                    {form.method !== "equal" && (
                      <div className="relative w-24">
                        <Input
                          aria-label={`${nameOf(k)} ${form.method}`}
                          inputMode="decimal"
                          value={form.values[k] ?? ""}
                          onChange={(e) =>
                            set("values", {
                              ...form.values,
                              [k]: e.target.value.replace(/[^\d.]/g, ""),
                            })
                          }
                          className="h-10 pr-7 text-right md:h-9"
                          placeholder="0"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                          {inputSuffix}
                        </span>
                      </div>
                    )}
                    <span className="tabular w-24 text-right text-sm font-semibold">
                      {money(preview.amounts[k] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
              {preview.error && total > 0 && (
                <p className="text-sm text-warning">{preview.error}</p>
              )}
            </div>

            {meIn && (
              <div className="space-y-3 rounded-xl bg-muted/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      Add my share to my expenses
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Only {money(myShare)} counts in your reports & budgets.
                    </p>
                  </div>
                  <Switch
                    checked={form.recordExpense}
                    onCheckedChange={(v) => set("recordExpense", v)}
                  />
                </div>
                {form.recordExpense && (
                  <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {debitCats.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => set("categoryId", c.id)}
                        className={cn(
                          "flex w-18 shrink-0 flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 text-center",
                          form.categoryId === c.id
                            ? "border-ring bg-card"
                            : "hover:bg-card/60",
                        )}
                      >
                        <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                        <span className="line-clamp-2 text-[10px] leading-tight">
                          {c.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {total > 0 && !preview.error && (
              <p className="rounded-xl border border-dashed p-3 text-center text-sm">
                {payer === "me" ? (
                  <>
                    You paid <b>{money(total)}</b>
                    {meIn && <> · your share {money(myShare)}</>} ·{" "}
                    <b className="text-income">
                      others owe you {money(total - myShare)}
                    </b>
                  </>
                ) : (
                  <>
                    {nameOf(payer)} paid <b>{money(total)}</b> ·{" "}
                    <b className="text-expense">
                      you owe {nameOf(payer).split(" ")[0]} {money(myShare)}
                    </b>
                  </>
                )}
              </p>
            )}

            {meIn && form.recordExpense && (
              <AccountPicker
                label={payer === "me" ? "You paid from" : "Your share is from"}
                value={form.accountId ?? defaultAccount?.id ?? null}
                onChange={(id) => set("accountId", id)}
              />
            )}
            <EventPicker
              value={form.eventId}
              onChange={(id) => set("eventId", id)}
              date={form.date}
            />

            <Field label="Note (optional)" htmlFor="split-note">
              <Input
                id="split-note"
                maxLength={500}
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
              />
            </Field>

            <div className="flex gap-2">
              {editId && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={onDelete}
                  className="text-destructive"
                  aria-label="Delete split"
                >
                  <Trash2 />
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                className="flex-1"
                disabled={!!problem || save.isPending}
              >
                {save.isPending
                  ? "Saving…"
                  : problem && total > 0
                    ? problem
                    : editId
                      ? "Save split"
                      : "Save split"}
              </Button>
            </div>
          </form>
        )}
      </ResponsiveSheet>
      <PersonSheet
        value={addPerson}
        onClose={() => setAddPerson(null)}
        onSaved={(p) =>
          setForm((f) => ({ ...f, selected: [...f.selected, keyOf(p.id)] }))
        }
      />
    </>
  );
}
