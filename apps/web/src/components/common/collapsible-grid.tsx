import { ChevronUp, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A grid of picker options (icons, categories) that shows only `rows` rows
 * until "More" is tapped. The column count is read from the rendered grid,
 * so it follows whatever responsive `grid-cols-*` the caller sets. The
 * selected option is always kept in view while collapsed.
 *
 * `variant="tile"` matches the icon + label category tiles; `"icon"` matches
 * the bare round icon buttons.
 */
export function CollapsibleGrid({
  children,
  className,
  rows = 2,
  selectedIndex = -1,
  variant = "icon",
}: {
  children: React.ReactNode;
  className?: string;
  rows?: number;
  selectedIndex?: number;
  variant?: "icon" | "tile";
}) {
  const items = React.Children.toArray(children);
  const ref = React.useRef<HTMLDivElement>(null);
  const [cols, setCols] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns;
      setCols(tracks === "none" ? 0 : tracks.split(" ").filter(Boolean).length);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const limit = cols * rows;
  const overflowing = cols > 0 && limit > 1 && items.length > limit;

  let visible = items;
  if (overflowing && !expanded) {
    // Last slot of the last row is the "More" button.
    visible = items.slice(0, limit - 1);
    if (selectedIndex >= limit - 1)
      visible[visible.length - 1] = items[selectedIndex]!;
  }
  const hidden = items.length - visible.length;

  return (
    <div ref={ref} className={cn("grid", className)}>
      {visible}
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Show fewer" : `Show ${hidden} more`}
          className={cn(
            "text-muted-foreground transition-colors hover:text-foreground",
            variant === "tile"
              ? "flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 text-center hover:bg-muted"
              : "grid place-items-center rounded-full p-0.5",
          )}
        >
          <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : variant === "tile" ? (
              <MoreHorizontal className="size-4" />
            ) : (
              `+${hidden}`
            )}
          </span>
          {variant === "tile" && (
            <span className="text-[11px] leading-tight">
              {expanded ? "Less" : `More (${hidden})`}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
