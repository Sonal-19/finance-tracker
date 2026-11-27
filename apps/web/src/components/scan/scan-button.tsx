import { Camera, ScanLine } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useScanAvailable } from "@/hooks/use-receipt-scan";
import { cn } from "@/lib/utils";
import { useScanStore } from "@/stores/scan-store";

const loadScanner = () => import("./receipt-scanner");
const ReceiptScanner = lazy(loadScanner);

/**
 * Mounts the scanner overlay once it has been opened. Its code (and the
 * canvas effects) is fetched in the background when the browser is idle,
 * so the first tap opens it at once, and never at all for users without it.
 */
export function ScannerHost() {
  const open = useScanStore((s) => s.open);
  const session = useScanStore((s) => s.session);
  const { data: available } = useScanAvailable();
  useEffect(() => {
    if (!available) return;
    const idle =
      window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
    idle(() => void loadScanner().catch(() => {}));
  }, [available]);
  if (!session) return null;
  return (
    <Suspense
      fallback={
        open ? <div className="fixed inset-0 z-[60] bg-neutral-950/95" /> : null
      }
    >
      <ReceiptScanner />
    </Suspense>
  );
}

/** "Scan receipt", shown only to users who have the feature. */
export function ScanButton({
  variant,
  className,
  onOpen,
}: {
  /** icon: header; tile: in the add-transaction sheet; fab: phones' mini button */
  variant: "icon" | "tile" | "fab";
  className?: string;
  onOpen?: () => void;
}) {
  const { data: available } = useScanAvailable();
  const openScan = useScanStore((s) => s.openScan);
  if (!available) return null;
  const open = () => {
    onOpen?.();
    openScan();
  };

  if (variant === "tile")
    return (
      <button
        type="button"
        onClick={open}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted",
          className,
        )}
      >
        <span className="scan-orb grid size-10 shrink-0 place-items-center rounded-full">
          <Camera className="size-5" />
        </span>
        <span className="flex-1">
          <b>Scan a receipt</b>
          <span className="block text-xs text-muted-foreground">
            Snap the bill and the amount, date and category fill themselves in.
          </span>
        </span>
        <ScanLine className="size-5 text-muted-foreground transition-transform group-hover:scale-110" />
      </button>
    );

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Scan receipt"
      title="Scan receipt"
      className={cn(
        "scan-orb grid shrink-0 place-items-center rounded-full transition-transform active:scale-90",
        variant === "fab" ? "size-11" : "size-9",
        className,
      )}
    >
      <Camera className={variant === "fab" ? "size-5" : "size-4.5"} />
    </button>
  );
}
