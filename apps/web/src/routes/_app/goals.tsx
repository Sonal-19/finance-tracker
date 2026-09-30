import { createFileRoute } from "@tanstack/react-router";
import { differenceInCalendarMonths, parseISO } from "date-fns";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CategoryIcon, COLORS } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { EmptyState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Goal,
  useDeleteGoal,
  useGoalContribution,
  useGoals,
  useSaveGoal,
} from "@/hooks/use-finance";
import { money, shortDate, todayStr, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/goals")({
  component: GoalsPage,
});

const GOAL_ICONS = [
  "piggy-bank",
  "shield",
  "plane",
  "car",
  "home",
  "graduation-cap",
  "smartphone",
  "gift",
  "bike",
  "target",
];

function Ring({ ratio, color }: { ratio: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="var(--muted)"
        strokeWidth="8"
      />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, ratio))}
        className="transition-all duration-700"
      />
    </svg>
  );
}

function GoalsPage() {
  const { data, isLoading } = useGoals();
  const del = useDeleteGoal();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [contrib, setContrib] = useState<{
    goal: Goal;
    mode: "add" | "withdraw";
  } | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Savings goals"
        description="Put money aside for the things that matter."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New goal
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : !data?.length ? (
        <EmptyState title="No goals yet">
          Create one for an emergency fund, a trip or a new phone.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((g) => {
            const ratio = g.saved / g.target;
            const left = Math.max(0, g.target - g.saved);
            const monthsLeft = g.targetDate
              ? differenceInCalendarMonths(
                  parseISO(ymd(g.targetDate)),
                  new Date(),
                )
              : null;
            return (
              <div key={g.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <Ring ratio={ratio} color={g.color} />
                    <span className="absolute inset-0 grid place-items-center text-sm font-bold">
                      {Math.round(ratio * 100)}%
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={g.icon} color={g.color} size="sm" />
                      <p className="truncate font-semibold">{g.name}</p>
                    </div>
                    <p className="tabular mt-2 text-lg font-bold">
                      {money(g.saved)}
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      of {money(g.target)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {ratio >= 1
                    ? "🎉 Goal reached!"
                    : `${money(left)} to go${g.targetDate ? ` · by ${shortDate(g.targetDate)}` : ""}${monthsLeft && monthsLeft > 0 ? ` · ~${money(left / monthsLeft)}/month` : ""}`}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-10 md:h-8"
                    onClick={() => setContrib({ goal: g, mode: "add" })}
                  >
                    <Plus /> Add money
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Withdraw"
                    onClick={() => setContrib({ goal: g, mode: "withdraw" })}
                  >
                    <Minus />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Edit goal"
                    onClick={() => setEditing(g)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Delete goal"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete "${g.name}"?`,
                          description: "Its saved history will be removed too.",
                          confirmText: "Delete",
                          destructive: true,
                        })
                      )
                        del.mutate(g.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <GoalSheet value={editing} onClose={() => setEditing(null)} />
      <ContributionSheet value={contrib} onClose={() => setContrib(null)} />
    </div>
  );
}

function GoalSheet({
  value,
  onClose,
}: {
  value: Goal | "new" | null;
  onClose: () => void;
}) {
  const save = useSaveGoal();
  const [form, setForm] = useState({
    name: "",
    target: "",
    targetDate: "",
    color: COLORS[0]!,
    icon: "piggy-bank",
  });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (value && value !== "new")
      setForm({
        name: value.name,
        target: String(value.target),
        targetDate: value.targetDate ? ymd(value.targetDate) : "",
        color: value.color,
        icon: value.icon,
      });
    else
      setForm({
        name: "",
        target: "",
        targetDate: "",
        color: "#10b981",
        icon: "piggy-bank",
      });
  }
  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value === "new" ? "New savings goal" : "Edit goal"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              id: value && value !== "new" ? value.id : undefined,
              name: form.name,
              target: Number(form.target),
              targetDate: form.targetDate || null,
              color: form.color,
              icon: form.icon,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <Field label="Goal name" htmlFor="goal-name">
          <Input
            id="goal-name"
            required
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Emergency fund"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target (₹)" htmlFor="goal-target">
            <Input
              id="goal-target"
              required
              inputMode="decimal"
              value={form.target}
              onChange={(e) =>
                setForm({
                  ...form,
                  target: e.target.value.replace(/[^\d.]/g, ""),
                })
              }
              placeholder="100000"
            />
          </Field>
          <Field label="Target date" htmlFor="goal-date">
            <Input
              id="goal-date"
              type="date"
              min={todayStr()}
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {GOAL_ICONS.map((i) => (
            <button
              key={i}
              type="button"
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
          {COLORS.map((c) => (
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
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!form.name || !(Number(form.target) > 0) || save.isPending}
        >
          Save goal
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

function ContributionSheet({
  value,
  onClose,
}: {
  value: { goal: Goal; mode: "add" | "withdraw" } | null;
  onClose: () => void;
}) {
  const add = useGoalContribution();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"add" | "withdraw">("add");
  const [date, setDate] = useState(todayStr());
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setAmount("");
    setDate(todayStr());
    if (value) setMode(value.mode);
  }
  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value?.goal.name ?? "Goal"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value || !(Number(amount) > 0)) return;
          add.mutate(
            {
              id: value.goal.id,
              amount: mode === "add" ? Number(amount) : -Number(amount),
              date,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <Segmented
          className="w-full"
          value={mode}
          onChange={setMode}
          options={[
            { value: "add", label: "Add money" },
            { value: "withdraw", label: "Withdraw" },
          ]}
        />
        <Field label="Amount (₹)" htmlFor="contrib-amount">
          <Input
            id="contrib-amount"
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="5000"
          />
        </Field>
        <Field label="Date" htmlFor="contrib-date">
          <Input
            id="contrib-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!(Number(amount) > 0) || add.isPending}
        >
          {mode === "add" ? "Add to goal" : "Withdraw from goal"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
