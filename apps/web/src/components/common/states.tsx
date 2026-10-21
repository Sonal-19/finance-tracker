import { CloudOff, Loader2 } from "lucide-react";
import type * as React from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("size-5 animate-spin text-primary", className)} />
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner className="size-7" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && (
        <div className="text-sm text-muted-foreground">{children}</div>
      )}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  // No connection and nothing saved on this device for this view yet.
  if (error instanceof ApiError && error.isNetwork)
    return (
      <EmptyState
        icon={<CloudOff className="size-6" />}
        title="Not available offline yet"
      >
        This hasn't been opened on this device before. It loads once you're back
        online. Anything you add meanwhile is saved and synced.
      </EmptyState>
    );
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
      {(error as Error)?.message ?? "Something went wrong"}
    </div>
  );
}
