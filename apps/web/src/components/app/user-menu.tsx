import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, MoonStar, Settings, Sun } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/components/common/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/use-auth";
import { useShortcutMap } from "@/hooks/use-shortcuts";
import { useThemeChoice } from "@/hooks/use-user-config";
import { pendingCount } from "@/lib/offline/sync";
import type { AppUser } from "@/stores/auth-store";
import type { Theme } from "@/stores/theme-store";
import { ShortcutKeys } from "./shortcuts";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ${className}`}
    >
      {initials(name)}
    </span>
  );
}

export function useSignOut() {
  const logout = useLogout();
  const navigate = useNavigate();
  return async () => {
    const unsynced = pendingCount();
    if (
      unsynced &&
      !(await confirm({
        title: `Log out with ${unsynced} unsynced change${unsynced > 1 ? "s" : ""}?`,
        description:
          "They haven't reached the server yet and will be lost. Connect to the internet first to keep them.",
        confirmText: "Log out anyway",
        destructive: true,
      }))
    )
      return;
    await logout();
    toast.success("Logged out");
    navigate({ to: "/", replace: true });
  };
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "amoled", label: "AMOLED", icon: MoonStar },
  { value: "system", label: "Auto", icon: Monitor },
];

export function UserMenu({ user }: { user: AppUser }) {
  const signOut = useSignOut();
  const { theme, setTheme } = useThemeChoice();
  const keys = useShortcutMap();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <Avatar name={user.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="truncate">{user.name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex gap-1 p-1">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-xs ${theme === t.value ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings /> Settings
            {keys.goSettings && (
              <DropdownMenuShortcut className="hidden tracking-normal md:inline-flex">
                <ShortcutKeys binding={keys.goSettings} compact />
              </DropdownMenuShortcut>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
