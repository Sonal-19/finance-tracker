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
        "inline-flex items-center gap-2 font-bold tracking-tight",
        className,
      )}
    >
      <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
      {withText && (
        <span className="text-lg">
          Finance<span className="text-primary">Tracker</span>
        </span>
      )}
    </span>
  );
}
