import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Crown,
  KeyRound,
  LogOut,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import {
  actionText,
  ago,
  count,
  formatBytes,
  PERMISSION_INFO,
  RequirePermission,
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
import { UsernameField } from "@/components/common/username-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type AdminPermission,
  type AdminUserDetail,
  useAdminCan,
  useAdminUser,
  useDeleteUser,
  useEditUser,
  useRevokeAllSessions,
  useSetPermissions,
  useSetUserPassword,
  useSetUserRole,
  useSetUserStatus,
  useTransferMaster,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { normalizeUsername, usernameProblem } from "@/lib/username";

export const Route = createFileRoute("/_admin/admin/users/$userId")({
  component: AdminUserPage,
});

function AdminUserPage() {
  const id = Number(Route.useParams().userId);
  return (
    <div className="space-y-5">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All users
      </Link>
      <RequirePermission permission="users.view">
        <UserLoader id={id} />
      </RequirePermission>
    </div>
  );
}

function UserLoader({ id }: { id: number }) {
  const { data, isLoading, error } = useAdminUser(id);
  if (isLoading) return <PageLoader />;
  if (!data) return <ErrorState error={error} />;
  return <UserDetail u={data} />;
}

type Sheet = "password" | "edit" | "delete" | null;

function UserDetail({ u }: { u: AdminUserDetail }) {
  const { user: me } = useAuth();
  const { master, can } = useAdminCan();
  const self = me?.id === u.id;
  const isMasterTarget = !!u.masterSince;
  const [sheet, setSheet] = useState<Sheet>(null);
  const revokeAll = useRevokeAllSessions();
  const setRole = useSetUserRole();
  const setStatus = useSetUserStatus();
  const transfer = useTransferMaster();
  const suspended = u.status === "suspended";
  // `canManage`: the API's answer to "may I touch this account at all"
  // (the master is untouchable, and only the master manages admins).
  const manage = (p: AdminPermission) => u.canManage && can(p);

  const show = {
    signOut: manage("sessions.revoke") && u.sessions.length > 0,
    edit: manage("users.edit"),
    role: master && !self && !isMasterTarget,
    makeMaster: master && !self && u.role === "admin" && !suspended,
    password: manage("users.password") && !self,
    suspend: manage("users.suspend") && !self,
    remove: manage("users.delete") && !self,
  };
  const anyAction = Object.values(show).some(Boolean);

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
            <RoleBadge role={u.role} master={u.masterSince} always />
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
        {!anyAction ? (
          <p className="text-sm text-muted-foreground">
            {isMasterTarget && !self
              ? "This is the master admin's account; only they can change it."
              : !u.canManage
                ? "Only the master admin can manage other admins."
                : "You can view this account but not change it. Ask the master admin for more permissions."}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {show.signOut && (
              <Button
                variant="outline"
                disabled={revokeAll.isPending}
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
                <LogOut />{" "}
                {self ? "Sign out other devices" : "Sign out everywhere"}
              </Button>
            )}
            {show.edit && (
              <Button variant="outline" onClick={() => setSheet("edit")}>
                <Pencil /> Edit profile
              </Button>
            )}
            {show.role && (
              <Button
                variant="outline"
                disabled={setRole.isPending}
                onClick={async () => {
                  const role = u.role === "admin" ? "user" : "admin";
                  if (
                    await confirm({
                      title:
                        role === "admin"
                          ? `Make @${u.username} an admin?`
                          : `Make @${u.username} a regular user?`,
                      description:
                        role === "admin"
                          ? "They start with no permissions: only the overview. Turn on what they may do under Permissions."
                          : "They lose the admin console and every permission. Their own data is kept.",
                      confirmText:
                        role === "admin" ? "Make admin" : "Make user",
                      destructive: role === "user",
                    })
                  )
                    setRole.mutate({ id: u.id, role });
                }}
              >
                {u.role === "admin" ? <ShieldOff /> : <ShieldCheck />}
                {u.role === "admin" ? "Make user" : "Make admin"}
              </Button>
            )}
            {show.makeMaster && (
              <Button
                variant="outline"
                disabled={transfer.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Make @${u.username} the master admin?`,
                      description:
                        "There's only one master. You become a regular admin with no permissions, and only they can give them back.",
                      confirmText: "Hand over master",
                      destructive: true,
                    })
                  )
                    transfer.mutate(u.id);
                }}
              >
                <Crown /> Make master admin
              </Button>
            )}
            {show.password && (
              <Button variant="outline" onClick={() => setSheet("password")}>
                <KeyRound /> Set new password
              </Button>
            )}
            {show.suspend && (
              <Button
                variant={suspended ? "default" : "outline"}
                disabled={setStatus.isPending}
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
                              "They're signed out of every device and can't sign in until reactivated. Their data is kept.",
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
            )}
            {show.remove && (
              <Button variant="destructive" onClick={() => setSheet("delete")}>
                <Trash2 /> Delete account
              </Button>
            )}
          </div>
        )}
      </SectionCard>

      {u.role === "admin" && (
        <PermissionsCard key={u.permissions.join()} u={u} editable={master} />
      )}

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

      {can("sessions.view") && (
        <>
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
                  <SessionItem
                    key={s.id}
                    session={s}
                    canRevoke={manage("sessions.revoke")}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
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
        </>
      )}

      {can("activity.view") && (
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
      )}

      <SetPasswordSheet
        user={u}
        open={sheet === "password"}
        onClose={() => setSheet(null)}
      />
      <EditUserSheet
        key={`${u.name}|${u.email}|${u.username}`}
        user={u}
        open={sheet === "edit"}
        onClose={() => setSheet(null)}
      />
      <DeleteUserSheet
        user={u}
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

/** The admin's permissions: switches for the master, a read-out for others. */
function PermissionsCard({
  u,
  editable,
}: {
  u: AdminUserDetail;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<AdminPermission[]>(u.permissions);
  const save = useSetPermissions();
  const isMasterTarget = !!u.masterSince;
  const dirty =
    draft.length !== u.permissions.length ||
    draft.some((p) => !u.permissions.includes(p));
  const canEdit = editable && !isMasterTarget;

  return (
    <SectionCard
      title="Permissions"
      action={
        canEdit && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft(
                  draft.length === PERMISSION_INFO.length
                    ? []
                    : PERMISSION_INFO.map((p) => p.key),
                )
              }
            >
              {draft.length === PERMISSION_INFO.length ? "None" : "All"}
            </Button>
            <Button
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate({ id: u.id, permissions: draft })}
            >
              Save
            </Button>
          </div>
        )
      }
    >
      {isMasterTarget ? (
        <p className="text-sm text-muted-foreground">
          The master admin can do everything, including changing roles and
          giving other admins permissions.
        </p>
      ) : (
        <>
          <p className="-mt-2 mb-3 text-sm text-muted-foreground">
            {canEdit
              ? "Choose what this admin may do. Changing roles and permissions stays with you."
              : "Set by the master admin."}
          </p>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {PERMISSION_INFO.map((p) => {
              const on = draft.includes(p.key);
              const id = `perm-${p.key}`;
              return (
                <li
                  key={p.key}
                  className="flex items-start justify-between gap-3 border-b py-3"
                >
                  <label htmlFor={id} className="min-w-0">
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.hint}
                    </span>
                  </label>
                  <Switch
                    id={id}
                    checked={on}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setDraft(
                        v
                          ? [...draft, p.key]
                          : draft.filter((k) => k !== p.key),
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
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

function EditUserSheet({
  user,
  open,
  onClose,
}: {
  user: AdminUserDetail;
  open: boolean;
  onClose: () => void;
}) {
  const initial = {
    name: user.name,
    email: user.email,
    username: user.username,
  };
  const [form, setForm] = useState(initial);
  const edit = useEditUser();
  const username = normalizeUsername(form.username);
  const close = () => {
    setForm(initial);
    onClose();
  };
  const valid =
    form.name.trim().length >= 2 &&
    form.email.includes("@") &&
    (username === user.username || !usernameProblem(username));

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={`Edit @${user.username}`}
      description="They aren't notified. A username changed here doesn't start their 30-day wait."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          edit.mutate(
            {
              id: user.id,
              ...(form.name.trim() !== user.name && { name: form.name.trim() }),
              ...(form.email.trim() !== user.email && {
                email: form.email.trim(),
              }),
              ...(username !== user.username && { username }),
            },
            { onSuccess: onClose },
          );
        }}
      >
        <Field label="Full name" htmlFor="edit-user-name">
          <Input
            id="edit-user-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-11"
          />
        </Field>
        <UsernameField
          id="edit-user-username"
          value={form.username}
          current={user.username}
          onChange={(v) => setForm({ ...form, username: v })}
        />
        <Field label="Email" htmlFor="edit-user-email">
          <Input
            id="edit-user-email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="h-11"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!valid || edit.isPending}
        >
          <Pencil /> Save changes
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

function DeleteUserSheet({
  user,
  open,
  onClose,
}: {
  user: AdminUserDetail;
  open: boolean;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const remove = useDeleteUser();
  const navigate = useNavigate();
  const close = () => {
    setTyped("");
    onClose();
  };
  const matches = normalizeUsername(typed) === user.username;
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={`Delete @${user.username}?`}
      description={`This permanently deletes the account and all its data: ${count(user.counts.transactions)} transactions, ${count(user.counts.splits)} splits, ${count(user.counts.attachments)} files. It can't be undone.`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          remove.mutate(
            { id: user.id, confirm: typed },
            {
              onSuccess: () => {
                close();
                navigate({ to: "/admin/users", replace: true });
              },
            },
          );
        }}
      >
        <Field
          label={`Type ${user.username} to confirm`}
          htmlFor="delete-user-confirm"
        >
          <Input
            id="delete-user-confirm"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={user.username}
            className="h-11"
          />
        </Field>
        <Button
          type="submit"
          variant="destructive"
          size="lg"
          className="w-full"
          disabled={!matches || remove.isPending}
        >
          <Trash2 /> Delete account
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
