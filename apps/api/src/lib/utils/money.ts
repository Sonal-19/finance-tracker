/**
 * Every amount is an integer in the smallest INR unit: stored that way, sent over the API that
 * way, and only turned into "₹1,23,456.00" when it is shown (`formatAmount`).
 */
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display string for a stored amount, e.g. for messages and exports. */
export const formatAmount = (value?: number | string | null) =>
  inrFormatter.format(Number(value ?? 0) / 100);

/** Stored amount for a figure written in rupees (seeds, FX conversion). */
export const rupees = (value: number) => Math.round(value * 100);

/** Coerces a SQL sum (string / null) to a number. */
export const amountOf = (value: number | string | null | undefined) =>
  Number(value ?? 0);
