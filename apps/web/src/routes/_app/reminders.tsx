import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/app/section-card";
import { confirm } from "@/components/common/confirm-dialog";
import { DateInput } from "@/components/common/date-input";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { EmptyState, PageLoader } from "@/components/common/states";
import { TimeInput, timeLabel } from "@/components/common/time-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type AppNotification,
  type NewReminder,
  type Reminder,
  useClearNotifications,
  useCreateReminder,
  useDeleteReminder,
  useMarkRead,
  useNotifications,
  useReminders,
  useTestPush,
  useUpcomingReminders,
  useUpdateReminder,
} from "@/hooks/use-reminders";
import { formatAmount, formatDate, todayStr } from "@/lib/format";
import { disablePush, enablePush, type PushState, pushState } from "@/lib/push";
import { cn } from "@/lib/utils";

const TABS = ["inbox", "mine", "settings"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/reminders")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(s.tab as Tab) && s.tab !== "inbox"
      ? { tab: s.tab as Tab }
      : {},
  component: RemindersPage,
});

function RemindersPage() {
  const tab = Route.useSearch().tab ?? "inbox";
  const navigate = useNavigate({ from: Route.fullPath });
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);
  const unread = useNotifications().data?.unread ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reminders"
        description="Notifications before recurring entries post, and reminders you set yourself."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New reminder
          </Button>
        }
      />
      <Segmented
        className="w-full sm:w-auto"
        value={tab}
        onChange={(t) =>
          navigate({ search: t === "inbox" ? {} : { tab: t }, replace: true })
        }
        options={[
          {
            value: "inbox",
            label: unread ? `Notifications (${unread})` : "Notifications",
          },
          { value: "mine", label: "My reminders" },
          { value: "settings", label: "Upcoming & settings" },
        ]}
      />
      {tab === "inbox" && <Inbox />}
      {tab === "mine" && <MyReminders onEdit={setEditing} />}
      {tab === "settings" && (
        <>
          <PushCard />
          <Upcoming />
        </>
      )}
      <ReminderSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ---------------- inbox ---------------- */

function Inbox() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const clear = useClearNotifications();
  const navigate = useNavigate();
  const items = data?.items ?? [];

  if (isLoading && !data) return <PageLoader />;
  if (!items.length)
    return (
      <EmptyState icon={<Bell className="size-8" />} title="No notifications">
        Reminders show up here, and on this device if notifications are on.
      </EmptyState>
    );
  return (
    <SectionCard
      className="overflow-hidden p-0 sm:p-0"
      title={
        <span className="block px-4 pt-4 sm:px-5 sm:pt-5">
          {data?.unread ? `${data.unread} unread` : "All caught up"}
        </span>
      }
      action={
        <div className="flex gap-1 px-4 pt-4 sm:px-5 sm:pt-5">
          {!!data?.unread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markRead.mutate(undefined)}
            >
              <CheckCheck /> Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (
                await confirm({
                  title: "Clear all notifications?",
                  confirmText: "Clear",
                  destructive: true,
                })
              )
                clear.mutate();
            }}
          >
            <Trash2 /> Clear
          </Button>
        </div>
      }
    >
      <ul className="divide-y border-t">
        {items.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            onOpen={() => {
              if (!n.readAt) markRead.mutate([n.id]);
              navigate({ to: n.url });
            }}
          />
        ))}
      </ul>
    </SectionCard>
  );
}

function NotificationRow({
  n,
  onOpen,
}: {
  n: AppNotification;
  onOpen: () => void;
}) {
  const Icon =
    n.kind === "recurring" ? Repeat : n.kind === "test" ? Send : BellRing;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 sm:px-5",
          !n.readAt && "bg-accent/40",
        )}
      >
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{n.title}</span>
            {!n.readAt && (
              <span
                className="size-2 shrink-0 rounded-full bg-primary"
                aria-label="Unread"
              />
            )}
          </span>
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {n.body}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </span>
        </span>
      </button>
    </li>
  );
}

/* ---------------- my reminders ---------------- */

const REPEAT_LABEL: Record<Reminder["repeat"], string> = {
  once: "Once",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

function MyReminders({ onEdit }: { onEdit: (r: Reminder) => void }) {
  const { data, isLoading } = useReminders();
  const update = useUpdateReminder();
  const del = useDeleteReminder();
  if (isLoading && !data) return <PageLoader />;
  if (!data?.length)
    return (
      <EmptyState
        icon={<BellRing className="size-8" />}
        title="No reminders yet"
      >
        Pay the credit card bill, renew insurance, collect money from a friend:
        set a reminder and get a notification on time.
      </EmptyState>
    );
  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-card">
      {data.map((r) => (
        <div
          key={r.id}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 p-4",
            r.status !== "active" && "opacity-60",
          )}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            {r.status === "paused" ? (
              <BellOff className="size-5" />
            ) : (
              <BellRing className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {REPEAT_LABEL[r.repeat]} · {timeLabel(r.time)} ·{" "}
              {r.status === "active"
                ? `next ${format(new Date(r.nextAt), "EEE, d MMM, h:mm a")}`
                : r.status === "paused"
                  ? "paused"
                  : "done"}
            </p>
            {r.note && (
              <p className="truncate text-xs text-muted-foreground">{r.note}</p>
            )}
          </div>
          <div className="-mr-2 ml-auto flex shrink-0">
            {r.status !== "done" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={r.status === "active" ? "Pause" : "Resume"}
                onClick={() =>
                  update.mutate({
                    id: r.id,
                    status: r.status === "active" ? "paused" : "active",
                  })
                }
              >
                {r.status === "active" ? <Pause /> : <Play />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit"
              onClick={() => onEdit(r)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Delete this reminder?",
                    confirmText: "Delete",
                    destructive: true,
                  })
                )
                  del.mutate(r.id);
              }}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One hour from now, rounded up to the next 5 minutes. */
function soon() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return { date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm") };
}

function ReminderSheet({
  value,
  onClose,
}: {
  value: Reminder | "new" | null;
  onClose: () => void;
}) {
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const blank = (): NewReminder => ({
    title: "",
    note: "",
    ...soon(),
    repeat: "once",
  });
  const [form, setForm] = useState<NewReminder>(blank);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setForm(
      value && value !== "new"
        ? {
            title: value.title,
            note: value.note ?? "",
            date: value.date,
            time: value.time,
            repeat: value.repeat,
          }
        : blank(),
    );
  }
  const saving = create.isPending || update.isPending;
  const valid = form.title.trim().length > 0 && !!form.date;

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value === "new" ? "New reminder" : "Edit reminder"}
      description="You get a notification at this time, on every device with notifications on."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const body = {
            ...form,
            title: form.title.trim(),
            note: form.note?.trim() || null,
          };
          if (value && value !== "new")
            update.mutate({ id: value.id, ...body }, { onSuccess: onClose });
          else create.mutate(body, { onSuccess: onClose });
        }}
      >
        <Field label="Remind me to" htmlFor="rem-title">
          <Input
            id="rem-title"
            required
            maxLength={120}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Pay credit card bill"
            className="h-11"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="rem-date">
            <DateInput
              id="rem-date"
              min={form.repeat === "once" ? todayStr() : undefined}
              value={form.date}
              onChange={(date) => setForm({ ...form, date })}
            />
          </Field>
          <Field label="Time" htmlFor="rem-time">
            <TimeInput
              id="rem-time"
              value={form.time}
              onChange={(time) => setForm({ ...form, time })}
            />
          </Field>
        </div>
        <Field label="Repeat">
          <Segmented
            className="w-full"
            size="sm"
            value={form.repeat}
            onChange={(repeat) => setForm({ ...form, repeat })}
            options={(Object.keys(REPEAT_LABEL) as Reminder["repeat"][]).map(
              (v) => ({
                value: v,
                label:
                  v === "once" ? "Once" : REPEAT_LABEL[v].replace("Every ", ""),
              }),
            )}
          />
        </Field>
        <Field label="Note (optional)" htmlFor="rem-note">
          <Textarea
            id="rem-note"
            maxLength={500}
            rows={2}
            value={form.note ?? ""}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Shown in the notification"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          {form.repeat === "once"
            ? `Once on ${form.date ? formatDate(form.date) : "…"} at ${timeLabel(form.time)}.`
            : `${REPEAT_LABEL[form.repeat]} at ${timeLabel(form.time)}, starting ${form.date ? formatDate(form.date) : "…"}.`}
        </p>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!valid || saving}
        >
          <BellRing /> Save reminder
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

/* ---------------- settings & upcoming ---------------- */

const PUSH_TEXT: Record<PushState, string> = {
  on: "This device gets reminders even when the app is closed.",
  off: "Turn on to get reminders on this device when the app is closed.",
  blocked:
    "Notifications are blocked for this site. Allow them in the browser's site settings, then come back.",
  unsupported:
    "This browser can't show notifications from the app. On iPhone, add the app to your Home Screen first. Reminders still appear in the Notifications tab.",
  unconfigured:
    "Notifications aren't set up on the server yet. Reminders still appear in the Notifications tab.",
};

function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const test = useTestPush();
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  return (
    <SectionCard
      title="Notifications on this device"
      action={
        state === "on" || state === "off" ? (
          <Button
            size="sm"
            variant={state === "on" ? "outline" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (state === "on") {
                  await disablePush();
                  setState("off");
                } else setState(await enablePush());
              } catch (e) {
                console.warn(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {state === "on" ? <BellOff /> : <Bell />}
            {state === "on" ? "Turn off" : "Turn on"}
          </Button>
        ) : null
      }
    >
      <p className="text-sm text-muted-foreground">
        {state ? PUSH_TEXT[state] : "Checking…"}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={test.isPending}
        onClick={() => test.mutate()}
      >
        <Send /> Send a test
      </Button>
    </SectionCard>
  );
}

function Upcoming() {
  const { data, isLoading } = useUpcomingReminders();
  const navigate = useNavigate();
  return (
    <SectionCard
      title="Coming up from recurring entries"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/recurring" })}
        >
          <Repeat /> Recurring
        </Button>
      }
    >
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        By default you're reminded 3, 2 and 1 days before each entry posts, once
        a day at 9:00 AM. Change it per entry under Recurring.
      </p>
      {isLoading && !data ? (
        <PageLoader />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          Nothing in the next month.
        </p>
      ) : (
        <ul className="divide-y">
          {data.map((u) => (
            <li key={u.recurringId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{u.title}</p>
                <span
                  className={cn(
                    "tabular shrink-0 text-sm font-semibold",
                    u.type === "credit" && "text-income",
                  )}
                >
                  {u.type === "credit" ? "+" : "−"}
                  {formatAmount(u.amount)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Posts {formatDate(u.runDate)} · reminders{" "}
                {u.slots
                  .map((s) => format(new Date(s.at), "d MMM, h:mm a"))
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
