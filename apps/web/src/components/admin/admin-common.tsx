import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LogOut,
  Monitor,
  Search,
  ShieldCheck,
  Smartphone,
  Tablet,
} from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { confirm } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AdminAction,
  type AdminSession,
  useRevokeSession,
} from "@/hooks/use-admin";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const count = (n: number) => n.toLocaleString("en-IN");

export const ago = (d: string | Date | null | undefined) =>
  d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "never";

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Search text that settles after 300ms; `onSettle` runs when it does. */
export function useSearchText(onSettle?: () => void) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      onSettle?.();
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  return { text, setText, q };
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 pl-9 md:h-9"
      />
    </div>
  );
}

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft /> Prev
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next <ChevronRight />
      </Button>
    </div>
  );
}

const pill =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold";

export function RoleBadge({
  role,
  always,
}: {
  role: "user" | "admin";
  always?: boolean;
}) {
  if (role !== "admin" && !always) return null;
  return (
    <span
      className={cn(
        pill,
        role === "admin"
          ? "bg-primary/12 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {role === "admin" && <ShieldCheck className="size-3" />}
      {role === "admin" ? "Admin" : "User"}
    </span>
  );
}

export function StatusBadge({ status }: { status: "active" | "suspended" }) {
  if (status !== "suspended") return null;
  return (
    <span className={cn(pill, "bg-destructive/12 text-destructive")}>
      <Ban className="size-3" /> Suspended
    </span>
  );
}

export function DeviceIcon({
  kind,
  className,
}: {
  kind: AdminSession["kind"];
  className?: string;
}) {
  const Icon =
    kind === "mobile"
      ? Smartphone
      : kind === "tablet"
        ? Tablet
        : kind === "desktop"
          ? Monitor
          : HelpCircle;
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

type SessionLike = Pick<
  AdminSession,
  | "id"
  | "name"
  | "kind"
  | "ip"
  | "createdAt"
  | "lastSeenAt"
  | "expiresAt"
  | "current"
>;

/** One signed-in device, with a "Sign out" button when it's still live. */
export function SessionItem({
  session: s,
  ended,
  owner,
}: {
  session: SessionLike;
  /** Past session: no button, dimmed. */
  ended?: boolean;
  /** Shown under the device on the cross-user list. */
  owner?: React.ReactNode;
}) {
  const revoke = useRevokeSession();
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3 sm:px-5",
        ended && "opacity-70",
      )}
    >
      <DeviceIcon kind={s.kind} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          <span className="truncate">{s.name}</span>
          {s.current && (
            <span className={cn(pill, "bg-income/12 text-income")}>
              This device
            </span>
          )}
        </p>
        {owner}
        <p className="truncate text-xs text-muted-foreground">
          {[
            s.ip,
            `signed in ${formatDate(s.createdAt)}`,
            ended ? null : `active ${ago(s.lastSeenAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {!ended && (
        <Button
          variant="outline"
          size="sm"
          disabled={revoke.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Sign out ${s.name}?`,
                description: s.current
                  ? "This is the device you're using now; you'll be logged out."
                  : "That device will have to log in again.",
                confirmText: "Sign out",
                destructive: true,
              })
            )
              revoke.mutate(s.id);
          }}
        >
          <LogOut /> <span className="hidden sm:inline">Sign out</span>
        </Button>
      )}
    </li>
  );
}

const ACTION_TEXT: Record<AdminAction["action"], string> = {
  create_user: "created the account",
  revoke_session: "signed out a device",
  revoke_all_sessions: "signed out every device",
  change_role: "changed the role",
  suspend: "suspended the account",
  reactivate: "reactivated the account",
  reset_password: "set a new password",
};

/** "Riya signed out a device (Chrome on Android)". */
export function actionText(a: Pick<AdminAction, "action" | "details">) {
  const d = a.details ?? {};
  const extra =
    a.action === "change_role"
      ? `${d.from} → ${d.to}`
      : a.action === "revoke_session"
        ? d.device
        : a.action === "create_user"
          ? d.role
          : null;
  return extra ? `${ACTION_TEXT[a.action]} (${extra})` : ACTION_TEXT[a.action];
}

export function UserLink({
  id,
  name,
  username,
}: {
  id: number | null;
  name: string | null;
  username?: string | null;
}) {
  if (id === null || !name)
    return <span className="text-muted-foreground">a deleted user</span>;
  return (
    <Link
      to="/admin/users/$userId"
      params={{ userId: String(id) }}
      className="font-medium hover:underline"
    >
      {username ? `@${username}` : name}
    </Link>
  );
}
