import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  KeyRound,
  LogOut,
  ShieldCheck,
  ShieldOff,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import {
  actionText,
  ago,
  count,
  formatBytes,
  RoleBadge,
  SessionItem,
  StatusBadge,
} from "@/components/admin/admin-common";
import { SectionCard } from "@/components/app/section-card";
import { Avatar } from "@/components/app/user-menu";
import { confirm } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { PasswordInput } from "@/components/common/password-input";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { ErrorState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  type AdminUserDetail,
  useAdminUser,
  useRevokeAllSessions,
  useSetUserPassword,
  useSetUserRole,
  useSetUserStatus,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_admin/admin/users/$userId")({
  component: AdminUserPage,
});

function AdminUserPage() {
  const id = Number(Route.useParams().userId);
  const { data, isLoading, error } = useAdminUser(id);

  return (
    <div className="space-y-5">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All users
      </Link>
      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <ErrorState error={error} />
      ) : (
        <UserDetail u={data} />
      )}
    </div>
  );
}

function UserDetail({ u }: { u: AdminUserDetail }) {
  const { user: me } = useAuth();
  const self = me?.id === u.id;
  const [settingPassword, setSettingPassword] = useState(false);
  const revokeAll = useRevokeAllSessions();
  const setRole = useSetUserRole();
  const setStatus = useSetUserStatus();
  const suspended = u.status === "suspended";

  const stats: [string, string][] = [
    ["Transactions", count(u.counts.transactions)],
    ["Splits", count(u.counts.splits)],
    ["Payment methods", count(u.counts.accounts)],
    ["Books", count(u.counts.books)],
    ["People", count(u.counts.people)],
    ["Passkeys", count(u.counts.passkeys)],
    ["Files", count(u.counts.attachments)],
    ["Storage used", formatBytes(u.counts.storageBytes)],
  ];

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
        <Avatar name={u.name} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <span className="truncate">{u.name}</span>
            <RoleBadge role={u.role} always />
            <StatusBadge status={u.status} />
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            @{u.username} · {u.email}
          </p>
          <p className="text-xs text-muted-foreground">
            Joined {formatDate(u.createdAt)}
            {suspended && u.suspendedAt
              ? ` · suspended ${ago(u.suspendedAt)}`
              : ""}
          </p>
        </div>
      </section>

      <SectionCard title="Admin actions">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            variant="outline"
            disabled={!u.sessions.length || revokeAll.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: self
                    ? "Sign out your other devices?"
                    : `Sign @${u.username} out of every device?`,
                  description: self
                    ? "This device stays signed in."
                    : `${u.sessions.length} device${u.sessions.length > 1 ? "s" : ""} will have to log in again.`,
                  confirmText: "Sign out",
                  destructive: true,
                })
              )
                revokeAll.mutate(u.id);
            }}
          >
            <LogOut /> {self ? "Sign out other devices" : "Sign out everywhere"}
          </Button>
          <Button
            variant="outline"
            disabled={self || setRole.isPending}
            title={self ? "You can't change your own role" : undefined}
            onClick={async () => {
              const role = u.role === "admin" ? "user" : "admin";
              if (
                await confirm({
                  title:
                    role === "admin"
                      ? `Make @${u.username} an admin?`
                      : `Remove @${u.username}'s admin access?`,
                  description:
                    role === "admin"
                      ? "They'll see every user, every device, and the system config."
                      : "They keep their account and data, just not the admin console.",
                  confirmText: role === "admin" ? "Make admin" : "Remove admin",
                  destructive: role === "user",
                })
              )
                setRole.mutate({ id: u.id, role });
            }}
          >
            {u.role === "admin" ? <ShieldOff /> : <ShieldCheck />}
            {u.role === "admin" ? "Remove admin" : "Make admin"}
          </Button>
          <Button
            variant="outline"
            disabled={self}
            title={self ? "Change your own password in Settings" : undefined}
            onClick={() => setSettingPassword(true)}
          >
            <KeyRound /> Set new password
          </Button>
          <Button
            variant={suspended ? "default" : "destructive"}
            disabled={self || setStatus.isPending}
            title={self ? "You can't suspend your own account" : undefined}
            onClick={async () => {
              if (
                await confirm(
                  suspended
                    ? {
                        title: `Reactivate @${u.username}?`,
                        description: "They can sign in again.",
                        confirmText: "Reactivate",
                      }
                    : {
                        title: `Suspend @${u.username}?`,
                        description:
                          "They're signed out of every device and can't sign in until you reactivate them. Their data is kept.",
                        confirmText: "Suspend",
                        destructive: true,
                      },
                )
              )
                setStatus.mutate({
                  id: u.id,
                  status: suspended ? "active" : "suspended",
                });
            }}
          >
            {suspended ? <UserCheck /> : <Ban />}
            {suspended ? "Reactivate" : "Suspend"}
          </Button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-3 sm:p-4">
            <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
              {label}
            </p>
            <p className="tabular mt-1 text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      <SectionCard
        className="overflow-hidden p-0 sm:p-0"
        title={
          <span className="block px-4 pt-4 sm:px-5 sm:pt-5">
            Signed-in devices
          </span>
        }
        action={
          <span className="px-4 pt-4 text-sm text-muted-foreground sm:px-5 sm:pt-5">
            {count(u.sessions.length)}
          </span>
        }
      >
        {!u.sessions.length ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground sm:px-5">
            Not signed in anywhere.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {u.sessions.map((s) => (
              <SessionItem key={s.id} session={s} />
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <SectionCard
          className="overflow-hidden p-0 sm:p-0"
          title={
            <span className="block px-4 pt-4 sm:px-5 sm:pt-5">
              Earlier sign-ins
            </span>
          }
        >
          {!u.pastSessions.length ? (
            <p className="border-t px-4 py-4 text-sm text-muted-foreground sm:px-5">
              None yet.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {u.pastSessions.map((s) => (
                <SessionItem key={s.id} session={s} ended />
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Admin history">
          {!u.actions.length ? (
            <p className="text-sm text-muted-foreground">
              No admin has changed this account.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {u.actions.map((a) => (
                <li key={a.id}>
                  <p>
                    <span className="font-medium">
                      {a.adminName ?? "A deleted admin"}
                    </span>{" "}
                    {actionText(a)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ago(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SetPasswordSheet
        user={u}
        open={settingPassword}
        onClose={() => setSettingPassword(false)}
      />
    </>
  );
}

function SetPasswordSheet({
  user,
  open,
  onClose,
}: {
  user: AdminUserDetail;
  open: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const save = useSetUserPassword();
  const close = () => {
    setPassword("");
    onClose();
  };
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={`New password for @${user.username}`}
      description="They're signed out of every device and sign in with this one. Share it with them privately."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 8) return;
          save.mutate({ id: user.id, password }, { onSuccess: close });
        }}
      >
        <Field
          label="New password"
          htmlFor="admin-set-password"
          hint="At least 8 characters."
        >
          <PasswordInput
            id="admin-set-password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={password.length < 8 || save.isPending}
        >
          <KeyRound /> Set password
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
