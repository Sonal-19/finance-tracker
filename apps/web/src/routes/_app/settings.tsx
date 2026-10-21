import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InstallButton } from "@/components/app/install-app";
import { PasskeysCard } from "@/components/app/passkeys-card";
import { SectionCard } from "@/components/app/section-card";
import { ShortcutEditor } from "@/components/app/shortcuts";
import { useSignOut } from "@/components/app/user-menu";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PasswordInput } from "@/components/common/password-input";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { UsernameField } from "@/components/common/username-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@/hooks/use-finance";
import { useAdminShortcuts, useShortcutMap } from "@/hooks/use-shortcuts";
import { api, call, callMsg } from "@/lib/api";
import { canOfferInstall, isStandalone, usePwa } from "@/lib/pwa";
import { useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";
import { useUiStore } from "@/stores/ui-store";
import { type ShortcutMap, shortcutProblems } from "$/lib/utils/shortcuts";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const update = useUpdateProfile();
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const { theme, setTheme } = useThemeStore();
  const signOut = useSignOut();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const changePw = useMutation({
    mutationFn: () =>
      callMsg(
        api.profile["change-password"].post({
          currentPassword: pw.current,
          newPassword: pw.next,
        }),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      setPw({ current: "", next: "", confirm: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        description="Your profile, security and preferences."
      />

      <SectionCard title="Profile">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name });
          }}
        >
          <Field label="Name" htmlFor="set-name">
            <Input
              id="set-name"
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Email"
            htmlFor="set-email"
            hint="Email is verified and can't be changed."
          >
            <Input id="set-email" value={user?.email ?? ""} disabled />
          </Field>
          <Button
            type="submit"
            disabled={update.isPending || name.trim() === user?.name}
          >
            Save profile
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Username & tagging">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ username });
          }}
        >
          <UsernameField
            id="set-username"
            value={username}
            onChange={setUsername}
            current={user?.username}
          />
          <p className="text-xs text-muted-foreground">
            You can change it once every 30 days; your old username is released.
          </p>
          <Button
            type="submit"
            disabled={update.isPending || username === user?.username}
          >
            Save username
          </Button>
        </form>
        <label className="mt-5 flex items-start justify-between gap-4 border-t pt-4">
          <span className="text-sm">
            <span className="font-medium">
              Add tagged expenses automatically
            </span>
            <span className="block text-muted-foreground">
              When someone tags you on a split, add your share to your expenses.
              Off: it only appears under Split &amp; share → Shared with me.
            </span>
          </span>
          <Switch
            checked={user?.taggedExpenses === "auto"}
            disabled={update.isPending}
            onCheckedChange={(on) =>
              update.mutate({ taggedExpenses: on ? "auto" : "manual" })
            }
          />
        </label>
        <BlockedUsers />
      </SectionCard>

      <SectionCard title="Appearance">
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            {
              value: "light",
              label: (
                <span className="flex items-center gap-1.5">
                  <Sun className="size-4" /> Light
                </span>
              ),
            },
            {
              value: "dark",
              label: (
                <span className="flex items-center gap-1.5">
                  <Moon className="size-4" /> Dark
                </span>
              ),
            },
            {
              value: "system",
              label: (
                <span className="flex items-center gap-1.5">
                  <Monitor className="size-4" /> System
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <ShortcutsCard />

      <AppCard />

      <PasskeysCard />

      <SectionCard title="Change password">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm)
              return toast.error("New passwords don't match");
            changePw.mutate();
          }}
        >
          <Field label="Current password" htmlFor="pw-current">
            <PasswordInput
              id="pw-current"
              autoComplete="current-password"
              required
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="New password"
              htmlFor="pw-next"
              hint="At least 8 characters."
            >
              <PasswordInput
                id="pw-next"
                autoComplete="new-password"
                required
                minLength={8}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm">
              <PasswordInput
                id="pw-confirm"
                autoComplete="new-password"
                required
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Other devices will be logged out.
          </p>
          <Button
            type="submit"
            disabled={changePw.isPending || pw.next.length < 8}
          >
            Update password
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Session">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={signOut}
        >
          <LogOut /> Log out
        </Button>
      </SectionCard>

      <SectionCard title="Danger zone" className="border-destructive/30">
        <p className="mb-3 text-sm text-muted-foreground">
          Delete your account and all its transactions, budgets and goals
          permanently.
        </p>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          Delete account
        </Button>
      </SectionCard>
      <DeleteAccountSheet open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}

function DeleteAccountSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const qc = useQueryClient();
  const clearUser = useAuthStore((s) => s.clearUser);
  const navigate = useNavigate();
  const del = useMutation({
    mutationFn: () => callMsg(api.profile.delete({ password })),
    onSuccess: ({ message }) => {
      toast.success(message);
      clearUser();
      qc.clear();
      navigate({ to: "/", replace: true });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Delete account permanently?"
      description="All your data will be erased. This cannot be undone."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          del.mutate();
        }}
      >
        <Field label="Confirm with your password" htmlFor="del-pw">
          <PasswordInput
            id="del-pw"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="destructive"
          className="w-full"
          disabled={!password || del.isPending}
        >
          Delete my account
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

function BlockedUsers() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: blocked = [] } = useQuery({
    queryKey: ["profile", "blocks"],
    queryFn: () => call(api.profile.blocks.get()),
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["profile", "blocks"] });
  const block = useMutation({
    mutationFn: () =>
      callMsg(
        api.profile.blocks.post({
          username: name.trim().replace(/^@/, "").toLowerCase(),
        }),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      setName("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const unblock = useMutation({
    mutationFn: (username: string) =>
      callMsg(api.profile.blocks({ username }).delete()),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mt-5 space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Blocked from tagging you</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          block.mutate();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="@username"
          autoCapitalize="none"
          maxLength={21}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!name.trim() || block.isPending}
        >
          Block
        </Button>
      </form>
      {blocked.map((b) => (
        <div
          key={b.username}
          className="flex items-center justify-between text-sm"
        >
          <span>
            @{b.username}{" "}
            <span className="text-muted-foreground">· {b.name}</span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => unblock.mutate(b.username)}
          >
            Unblock
          </Button>
        </div>
      ))}
    </div>
  );
}

/** The user's own keyboard shortcuts, on top of the admin's defaults. */
function ShortcutsCard() {
  const admin = useAdminShortcuts();
  const current = useShortcutMap();
  const update = useUpdateProfile();
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const [draft, setDraft] = useState<ShortcutMap | null>(null);
  const value = draft ?? current;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(current);
  const valid = !Object.keys(shortcutProblems(value)).length;
  const custom = Object.keys(value).some(
    (k) => value[k as keyof ShortcutMap] !== admin[k as keyof ShortcutMap],
  );

  const save = (next: ShortcutMap) => {
    // Only what differs from the defaults is stored, so later changes to
    // the defaults still reach every other action.
    const own = Object.fromEntries(
      Object.entries(next).filter(
        ([k, v]) => v !== admin[k as keyof ShortcutMap],
      ),
    );
    update.mutate(
      { shortcuts: Object.keys(own).length ? own : null },
      { onSuccess: () => setDraft(null) },
    );
  };

  return (
    <div id="shortcuts" className="scroll-mt-20">
      <SectionCard
        title="Keyboard shortcuts"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShortcutsOpen(true)}
          >
            Cheat sheet
          </Button>
        }
      >
        <ShortcutEditor value={value} base={admin} onChange={setDraft} />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {custom && (
            <Button
              variant="ghost"
              disabled={update.isPending}
              onClick={() => save(admin)}
            >
              Use defaults
            </Button>
          )}
          {dirty && (
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          )}
          <Button
            disabled={!dirty || !valid || update.isPending}
            onClick={() => draft && save(draft)}
          >
            Save shortcuts
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

/** Install as an app (or confirm it already is). */
function AppCard() {
  const available = usePwa(canOfferInstall);
  return (
    <SectionCard title="App">
      <p className="mb-3 text-sm text-muted-foreground">
        {isStandalone()
          ? "You're using the installed app. It opens straight to your dashboard and works with no connection."
          : available
            ? "Install Finance Tracker to open it like any other app, from your home screen or dock. It keeps working offline and syncs when you're back."
            : "Works offline in this browser. To install it, use a browser that supports installing web apps (Chrome, Edge, or Safari on iPhone and Mac)."}
      </p>
      <InstallButton className="sm:w-auto" />
    </SectionCard>
  );
}
