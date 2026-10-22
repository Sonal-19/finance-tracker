import { cn } from "@/lib/utils";

export interface LogoProps {
  className?: string;
  iconClassName?: string;
  withText?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

/**
 * Premium 3D Metallic Logo Icon for Finance Tracker.
 * Styled with 3D metallic chrome, titanium, and emerald crystal effects (like BlackBulls),
 * featuring the Smart Wallet, Vault Shield, and Soaring Financial Growth Trajectory.
 */
export function LogoIcon({
  className,
  interactive = true,
}: {
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 select-none transition-all duration-300 ease-out",
        interactive &&
          "group-hover:scale-110 group-hover:-rotate-2 group-hover:drop-shadow-[0_0_14px_rgba(45,212,191,0.55)] group-active:scale-95",
        className,
      )}
    >
      <img
        src="/logo.png?v=4"
        alt="Finance Tracker"
        className="width-82 object-contain pointer-events-none drop-shadow-md"
        loading="eager"
      />
    </div>
  );
}

export function Logo({
  className,
  iconClassName,
  withText = true,
  interactive = true,
  onClick,
}: LogoProps) {
  return (
    <span
      className={cn(
        "group inline-flex items-center gap-2.5 font-bold tracking-tight select-none transition-all duration-200",
        interactive && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <LogoIcon
        interactive={interactive}
        className={cn("size-8 sm:size-9", iconClassName)}
      />
      {withText && (
        <span className="text-base sm:text-lg whitespace-nowrap transition-colors duration-200 text-foreground font-extrabold tracking-tight">
          Finance
          <span className="text-primary font-black transition-all duration-200 group-hover:text-primary group-hover:drop-shadow-[0_0_10px_rgba(20,184,166,0.45)]">
            Tracker
          </span>
        </span>
      )}
    </span>
  );
}
