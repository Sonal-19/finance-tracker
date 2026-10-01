import { cn } from "@/lib/utils";

export function Logo({
  className,
  withText = true,
}: {
  className?: string;
  withText?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 sm:gap-2 font-bold tracking-tight select-none",
        className,
      )}
    >
      <img
        src="/favicon.svg"
        alt=""
        className="size-7 sm:size-8 rounded-lg shrink-0"
      />
      {withText && (
        <span className="text-base sm:text-lg whitespace-nowrap">
          Finance<span className="text-primary">Tracker</span>
        </span>
      )}
    </span>
  );
}
