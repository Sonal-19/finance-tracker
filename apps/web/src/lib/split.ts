import { formatAmount } from "./format";

export type SplitMethod = "equal" | "exact" | "percent" | "shares";
export type Relation = "friend" | "office" | "family" | "other";

export const RELATIONS: { value: Relation; label: string; short: string }[] = [
  { value: "friend", label: "Friend", short: "Friends" },
  { value: "office", label: "Office colleague", short: "Office" },
  { value: "family", label: "Family / relative", short: "Family" },
  { value: "other", label: "Other known person", short: "Others" },
];
export const relationLabel = (r: string) =>
  RELATIONS.find((x) => x.value === r)?.label ?? r;

export const SPLIT_METHODS: { value: SplitMethod; label: string }[] = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Exact ₹" },
  { value: "percent", label: "By %" },
  { value: "shares", label: "Shares" },
];

type Participant = { key: string; value: number };

/**
 * Client preview of the server's share maths (apps/api/src/lib/services/split-service.ts).
 * Works on integer amounts (the API's unit) so the numbers match what gets saved.
 */
export function previewShares(
  total: number,
  method: SplitMethod,
  participants: Participant[],
): { amounts: Record<string, number>; error: string | null } {
  const n = participants.length;
  const amounts: Record<string, number> = {};
  if (!n || !(total > 0)) return { amounts, error: null };

  const spread = (arr: number[]) => {
    let diff = total - arr.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % arr.length) {
      const step = diff > 0 ? 1 : -1;
      arr[i] = (arr[i] ?? 0) + step;
      diff -= step;
    }
    return arr;
  };
  const values = participants.map((p) => p.value || 0);
  let parts: number[];
  let error: string | null = null;
  switch (method) {
    case "equal":
      parts = spread(Array(n).fill(Math.floor(total / n)));
      break;
    case "exact": {
      parts = values.map(Math.round);
      const left = total - parts.reduce((a, b) => a + b, 0);
      if (left !== 0)
        error =
          left > 0
            ? `${formatAmount(left)} left to assign`
            : `${formatAmount(-left)} over the total`;
      break;
    }
    case "percent": {
      const sum = values.reduce((a, b) => a + b, 0);
      parts = values.map((v) => Math.floor((total * v) / 100));
      if (Math.abs(sum - 100) > 0.01)
        error = `${+(100 - sum).toFixed(2)}% left to assign`;
      else parts = spread(parts);
      break;
    }
    case "shares": {
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        parts = values.map(() => 0);
        error = "Give everyone a number of shares";
      } else parts = spread(values.map((v) => Math.floor((total * v) / sum)));
      break;
    }
  }
  participants.forEach((p, i) => {
    amounts[p.key] = parts[i] ?? 0;
  });
  return { amounts, error };
}

/** "98765 43210" → "919876543210" for wa.me links (India by default). */
export function waPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

export function reminderText(name: string, amount: number, myName: string) {
  return `Hi ${name.split(" ")[0]}, just a friendly reminder: you owe me ${formatAmount(amount)} from our shared expenses. You can pay by UPI whenever convenient. Thanks! – ${myName.split(" ")[0]}`;
}
