import { format, parseISO } from "date-fns";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** ₹1,23,456.5 */
export const money = (n: number) =>
  (Number.isInteger(Math.round(n * 100) / 100) ? inr : inrPaise).format(n);
/** ₹1.2L / ₹12K */
export const moneyShort = (n: number) => inrCompact.format(n);
export const signedMoney = (n: number, type: "credit" | "debit") =>
  `${type === "credit" ? "+" : "−"}${money(n)}`;

/** Date-only value → "yyyy-MM-dd". Eden may parse "2026-09-27" into a Date
 * (UTC midnight), so accept both shapes. */
export function ymd(d: string | Date) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
}

/** Local "today" as yyyy-MM-dd. */
export const todayStr = () => format(new Date(), "yyyy-MM-dd");

export const parseDay = (d: string | Date) => parseISO(ymd(d));

export function dayLabel(d: string | Date) {
  const s = ymd(d);
  const today = todayStr();
  const yest = format(new Date(Date.now() - 86_400_000), "yyyy-MM-dd");
  if (s === today) return "Today";
  if (s === yest) return "Yesterday";
  return format(parseDay(s), "EEE, d MMM yyyy");
}

export const shortDate = (d: string | Date) =>
  format(parseDay(d), "d MMM yyyy");

export function pct(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
