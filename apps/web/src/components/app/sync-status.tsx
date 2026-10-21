import { useIsFetching } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOutbox } from "@/lib/offline/outbox";
import { discardOp, retryOp, syncNow } from "@/lib/offline/sync";
import { usePwa } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/** Re-renders every 30s so "2 min ago" stays true. */
function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
}

function useSyncState() {
  const { ops, online, syncing, lastSyncedAt } = useOutbox();
  const fetching = useIsFetching() > 0;
  const failed = ops.filter((o) => o.status === "failed").length;
  const pending = ops.length - failed;
  const state: "offline" | "failed" | "syncing" | "pending" | "synced" = !online
    ? "offline"
    : failed
      ? "failed"
      : syncing || fetching
        ? "syncing"
        : pending
          ? "pending"
          : "synced";
  return { ops, online, failed, pending, state, lastSyncedAt };
}

const ago = (t: number | null) =>
  t
    ? Date.now() - t < 45_000
      ? "just now"
      : `${formatDistanceToNowStrict(t)} ago`
    : "never";

const TONE = {
  offline: "text-muted-foreground",
  failed: "text-destructive",
  syncing: "text-primary",
  pending: "text-amber-600 dark:text-amber-400",
  synced: "text-income",
};

function StatusIcon({
  state,
  className,
}: {
  state: keyof typeof TONE;
  className?: string;
}) {
  const Icon =
    state === "offline"
      ? CloudOff
      : state === "failed"
        ? AlertTriangle
        : state === "syncing"
          ? Loader2
          : Cloud;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        TONE[state],
        state === "syncing" && "animate-spin",
        className,
      )}
    />
  );
}

function headline(s: ReturnType<typeof useSyncState>) {
  if (s.state === "offline")
    return s.pending ? `Offline · ${s.pending} to sync` : "Offline";
  if (s.state === "failed")
    return `${s.failed} change${s.failed > 1 ? "s" : ""} couldn't sync`;
  if (s.state === "syncing") return "Syncing…";
  if (s.state === "pending") return `${s.pending} waiting to sync`;
  return "All changes synced";
}

/**
 * Connection and sync status: online/offline, last sync, unsynced changes
 * (with retry / discard), and a "Sync now" button. `compact` is the icon-only
 * form for the phone header and the collapsed sidebar.
 */
export function SyncStatus({ compact }: { compact?: boolean }) {
  useTick();
  const s = useSyncState();
  const needRefresh = usePwa((p) => p.needRefresh);
  const update = usePwa((p) => p.update);
  const [busy, setBusy] = useState(false);
  const count = s.pending + s.failed;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "relative flex min-w-0 items-center gap-2 rounded-lg text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "size-9 justify-center" : "w-full px-2 py-1.5",
        )}
        aria-label={`Sync status: ${headline(s)}`}
      >
        <StatusIcon state={s.state} />
        {compact ? (
          count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {count}
            </span>
          )
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">
              {headline(s)}
            </span>
            <span className="block truncate text-muted-foreground">
              Last synced {ago(s.lastSyncedAt)}
            </span>
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="flex items-center gap-2 border-b p-3">
          <StatusIcon state={s.state} className="size-5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{headline(s)}</p>
            <p className="text-xs text-muted-foreground">
              {s.online ? "Online" : "No connection. You can keep working."}
              {" · "}
              {s.lastSyncedAt
                ? `Synced ${format(s.lastSyncedAt, "d MMM, h:mm a")}`
                : "Not synced yet"}
            </p>
          </div>
        </div>

        {s.ops.length > 0 && (
          <ul className="max-h-64 divide-y overflow-y-auto">
            {s.ops.map((op) => (
              <li key={op.opId} className="flex items-start gap-2 px-3 py-2">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    op.status === "failed" ? "bg-destructive" : "bg-amber-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{op.label}</p>
                  <p
                    className={cn(
                      "text-xs",
                      op.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {op.status === "failed"
                      ? op.error
                      : `Saved on this device ${ago(new Date(op.at).getTime())}`}
                  </p>
                </div>
                {op.status === "failed" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Try again"
                    title="Try again"
                    onClick={() => retryOp(op.opId)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Discard this change"
                  title="Discard this change"
                  onClick={() => discardOp(op.opId)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 border-t p-3">
          {needRefresh ? (
            <Button size="sm" className="flex-1" onClick={update}>
              <RefreshCw /> Update app
            </Button>
          ) : (
            <p className="flex-1 text-xs text-muted-foreground">
              Changes save on this device first and sync automatically.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await syncNow().finally(() => setBusy(false));
            }}
          >
            <RefreshCw className={cn(busy && "animate-spin")} /> Sync now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
