// Reminder rules shared by the API scheduler and the web (previews in the
// recurring form). Pure: no env, no DB. Dates are "yyyy-MM-dd", times
// "HH:mm", both in the app's timezone, passed in as `tz`.

export type ReminderCadence = "daily" | "once";
export type ReminderRepeat = "once" | "daily" | "weekly" | "monthly" | "yearly";

/** A recurring rule's reminder: 3, 2 and 1 days before at 09:00, one a day,
 * then it stops until the next run. */
export const DEFAULT_RECURRING_REMINDER = {
  daysBefore: 3,
  time: "09:00",
  cadence: "daily" as ReminderCadence,
};
export const MAX_DAYS_BEFORE = 30;
export const TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";

type RuleReminder = {
  reminder: "default" | "custom" | "off";
  reminderDaysBefore: number | null;
  reminderTime: string | null;
  reminderCadence: ReminderCadence | null;
};

/** The settings in effect for a rule (null = no reminders). */
export function ruleReminder(rule: RuleReminder) {
  if (rule.reminder === "off") return null;
  if (rule.reminder === "default") return DEFAULT_RECURRING_REMINDER;
  return {
    daysBefore:
      rule.reminderDaysBefore ?? DEFAULT_RECURRING_REMINDER.daysBefore,
    time: rule.reminderTime ?? DEFAULT_RECURRING_REMINDER.time,
    cadence: rule.reminderCadence ?? DEFAULT_RECURRING_REMINDER.cadence,
  };
}

const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysTo(s: string, n: number) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Adds months, keeping `anchorDay` where the month has it (31 → 30/28). */
export function addMonthsTo(s: string, n: number, anchorDay: number) {
  const d = parse(s);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, last));
  return fmt(target);
}

/** The instant `date` `time` happens in `tz`. */
export function zonedInstant(date: string, time: string, tz: string) {
  const [h, m] = time.split(":").map(Number);
  const guess = new Date(`${date}T${time}:00Z`);
  // How far `tz` is from UTC at that moment, read back from Intl.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
  );
  const offset = asLocal - guess.getTime();
  return new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      h,
      m,
    ) - offset,
  );
}

export type ReminderSlot = {
  /** The day it goes off. */
  date: string;
  at: Date;
  /** Days left until the run date then (0 = due that day). */
  daysLeft: number;
};

/** When a rule reminds before `runDate`: daily from `daysBefore` down to 1
 * day before (or the day itself when `daysBefore` is 0), or once. */
export function recurringSlots(
  rule: RuleReminder,
  runDate: string,
  tz: string,
): ReminderSlot[] {
  const r = ruleReminder(rule);
  if (!r) return [];
  const days =
    r.cadence === "once" || r.daysBefore === 0
      ? [r.daysBefore]
      : Array.from({ length: r.daysBefore }, (_, i) => r.daysBefore - i);
  return days.map((d) => {
    const date = addDaysTo(runDate, -d);
    return { date, at: zonedInstant(date, r.time, tz), daysLeft: d };
  });
}

/** The latest slot that's already due and at most a day old: one reminder
 * per 24 hours, and never a burst of old ones after downtime. */
export function dueSlot(slots: ReminderSlot[], now: Date) {
  const day = 24 * 60 * 60 * 1000;
  return (
    slots
      .filter((s) => s.at <= now && now.getTime() - s.at.getTime() < day)
      .at(-1) ?? null
  );
}

/** The occurrence after `date` for a repeating custom reminder. */
export function nextReminderDate(
  date: string,
  repeat: Exclude<ReminderRepeat, "once">,
  anchorDay: number,
) {
  switch (repeat) {
    case "daily":
      return addDaysTo(date, 1);
    case "weekly":
      return addDaysTo(date, 7);
    case "monthly":
      return addMonthsTo(date, 1, anchorDay);
    case "yearly":
      return addMonthsTo(date, 12, anchorDay);
  }
}

/** "in 3 days" / "tomorrow" / "today". */
export const daysLeftText = (n: number) =>
  n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
