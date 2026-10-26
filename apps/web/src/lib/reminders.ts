import { timeLabel } from "@/components/common/time-input";
import {
  DEFAULT_RECURRING_REMINDER,
  type ReminderCadence,
} from "$/lib/utils/reminders";

export type RecurringReminderSettings = {
  reminder: "default" | "custom" | "off";
  reminderDaysBefore?: number | null;
  reminderTime?: string | null;
  reminderCadence?: ReminderCadence | null;
};

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "3, 2 and 1 days before, 9:00 AM" / "On the day, 8:30 AM" / "Off". */
export function describeReminder(r: RecurringReminderSettings) {
  if (r.reminder === "off") return "No reminder";
  const s =
    r.reminder === "default"
      ? DEFAULT_RECURRING_REMINDER
      : {
          daysBefore:
            r.reminderDaysBefore ?? DEFAULT_RECURRING_REMINDER.daysBefore,
          time: r.reminderTime ?? DEFAULT_RECURRING_REMINDER.time,
          cadence: r.reminderCadence ?? DEFAULT_RECURRING_REMINDER.cadence,
        };
  const at = timeLabel(s.time);
  if (s.daysBefore === 0) return `On the day, ${at}`;
  if (s.cadence === "once") return `${days(s.daysBefore)} before, ${at}`;
  const list = Array.from({ length: s.daysBefore }, (_, i) => s.daysBefore - i);
  const text =
    list.length === 1
      ? "1 day"
      : list.length <= 4
        ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)} days`
        : `Every day from ${days(s.daysBefore)}`;
  return `${text} before, ${at}`;
}
