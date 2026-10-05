import { format, parseISO } from "date-fns";

const inrFormatter = new Intl.NumberFormat("en-IN", {
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

/**
 * The one place amounts are turned into text. The API sends and stores every amount as an
 * integer in the smallest INR unit; this divides it down and formats as ₹1,23,456.00.
 */
export const formatAmount = (value?: number | null) =>
  inrFormatter.format((value ?? 0) / 100);
/** ₹1.2L / ₹12K */
export const formatAmountShort = (value?: number | null) =>
  inrCompact.format((value ?? 0) / 100);
export const formatSignedAmount = (value: number, type: "credit" | "debit") =>
  `${type === "credit" ? "+" : "−"}${formatAmount(value)}`;

/** An amount typed or shown in rupees (inputs, charts) → the API's integer amount. */
export const toAmount = (rupees: number) => Math.round(rupees * 100);
/** An API amount → rupees, for editable inputs and chart axes. */
export const fromAmount = (value: number) => value / 100;

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

/** Date-only value → "dd/MM/yyyy" (the Indian numeric format). */
export const formatDate = (d: string | Date) =>
  format(parseDay(d), "dd/MM/yyyy");

export const shortDate = (d: string | Date) =>
  format(parseDay(d), "d MMM yyyy");

export function pct(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
