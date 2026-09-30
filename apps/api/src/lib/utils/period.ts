import { APP_TZ } from "$/env";

export const periods = ["day", "week", "month", "year", "custom"] as const;
export type Period = (typeof periods)[number];

/** Date-only helpers on "yyyy-MM-dd" strings, using UTC so there's no DST drift. */
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: APP_TZ });
}

export function addDays(s: string, n: number) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Adds months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: string, n: number, anchorDay?: number) {
  const d = parse(s);
  const day = anchorDay ?? d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fmt(target);
}

export function daysBetween(from: string, to: string) {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export type Range = { from: string; to: string };

/** Inclusive date range for a period containing `anchor`. Weeks start Monday. */
export function rangeFor(period: Exclude<Period, "custom">, anchor: string) {
  const d = parse(anchor);
  switch (period) {
    case "day":
      return { from: anchor, to: anchor };
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7;
      const from = addDays(anchor, -dow);
      return { from, to: addDays(from, 6) };
    }
    case "month": {
      const from = fmt(
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
      );
      const to = fmt(
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
      );
      return { from, to };
    }
    case "year":
      return {
        from: `${d.getUTCFullYear()}-01-01`,
        to: `${d.getUTCFullYear()}-12-31`,
      };
  }
}

/** The range of equal length immediately before `r` (same period type). */
export function previousRange(period: Period, r: Range): Range {
  if (period === "month" || period === "year" || period === "week") {
    const anchor = addDays(r.from, -1);
    return rangeFor(period, anchor);
  }
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}
