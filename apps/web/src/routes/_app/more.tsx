import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { navFor } from "@/components/app/nav-items";
import { Avatar, useSignOut } from "@/components/app/user-menu";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/more")({
  component: MorePage,
});

/** Phone-only menu for sections that don't fit in the bottom tab bar. */
function MorePage() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const items = navFor(user).filter(
    (n) => !["/dashboard", "/transactions", "/reports"].includes(n.to),
  );
  return (
    <div className="space-y-5">
      {user && (
        <Link
          to="/settings"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4"
        >
          <Avatar name={user.name} className="size-12 text-base" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
      )}
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex items-center gap-3 px-4 py-3.5 active:bg-muted"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
              <n.icon className="size-4.5" />
            </span>
            <span className="flex-1 font-medium">{n.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-card px-4 py-3.5 font-medium text-destructive active:bg-muted"
      >
        <LogOut className="size-4.5" /> Log out
      </button>
    </div>
  );
}
