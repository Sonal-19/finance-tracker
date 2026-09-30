import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#0891b2",
  "#b45309",
];

export function PersonAvatar({
  name,
  id,
  className,
}: {
  name: string;
  id?: number | null;
  className?: string;
}) {
  const initials = name
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const color = id ? AVATAR_COLORS[id % AVATAR_COLORS.length] : "#64748b";
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials || "?"}
    </span>
  );
}

/** "owes you ₹500" / "you owe ₹200" / "settled up" for a person's net balance. */
export function BalanceLabel({
  net,
  className,
  align = "right",
}: {
  net: number;
  className?: string;
  align?: "left" | "right";
}) {
  const settled = Math.abs(net) < 0.005;
  return (
    <div
      className={cn(align === "right" ? "text-right" : "text-left", className)}
    >
      <p className="text-[11px] text-muted-foreground">
        {settled ? "settled up" : net > 0 ? "owes you" : "you owe"}
      </p>
      {!settled && (
        <p
          className={cn(
            "tabular font-semibold",
            net > 0 ? "text-income" : "text-expense",
          )}
        >
          {money(Math.abs(net))}
        </p>
      )}
    </div>
  );
}
