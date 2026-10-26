import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  ago,
  count,
  Pager,
  RoleBadge,
  SearchBox,
  StatusBadge,
  useSearchText,
} from "@/components/admin/admin-common";
import { SectionCard } from "@/components/app/section-card";
import { Avatar } from "@/components/app/user-menu";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PasswordInput } from "@/components/common/password-input";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Spinner,
} from "@/components/common/states";
import { UsernameField } from "@/components/common/username-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type NewUser,
  type UserFilter,
  useAdminUsers,
  useCreateUser,
} from "@/hooks/use-admin";
import { formatDate } from "@/lib/format";
import { normalizeUsername, usernameProblem } from "@/lib/username";

export const Route = createFileRoute("/_admin/admin/users/")({
  validateSearch: (s: Record<string, unknown>): { create?: boolean } =>
    s.create === true || s.create === "true" ? { create: true } : {},
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { create } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<UserFilter>("all");
  const search = useSearchText(() => setPage(1));
  const { data, isLoading, isFetching, error } = useAdminUsers(
    search.q,
    page,
    filter,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const setCreating = (open: boolean) =>
    navigate({ search: open ? { create: true } : {}, replace: true });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Open someone to see their devices, sign them out, suspend them or change their role."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus /> Create user
          </Button>
        }
      />
      <SectionCard className="overflow-hidden p-0 sm:p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <SearchBox
            className="flex-1"
            value={search.text}
            onChange={search.setText}
            placeholder="Search name, email or username"
          />
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && <Spinner className="size-4" />}
            <Segmented
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "admin", label: "Admins" },
                { value: "suspended", label: "Suspended" },
              ]}
            />
          </div>
        </div>
        {isLoading ? (
          <PageLoader />
        ) : !data ? (
          <div className="p-4">
            <ErrorState error={error} />
          </div>
        ) : !data.items.length ? (
          <EmptyState className="m-4" title="No users match" />
        ) : (
          <>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground sm:px-5">
              {count(data.total)} {data.total === 1 ? "user" : "users"}
            </p>
            {/* Phones: one card per user */}
            <ul className="divide-y border-t md:hidden">
              {data.items.map((u) => (
                <li key={u.id}>
                  <Link
                    to="/admin/users/$userId"
                    params={{ userId: String(u.id) }}
                    className="flex items-center gap-3 px-4 py-3 active:bg-muted"
                  >
                    <Avatar name={u.name} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{u.name}</span>
                        <RoleBadge role={u.role} />
                        <StatusBadge status={u.status} />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{u.username} · {u.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.activeSessions
                          ? `${u.activeSessions} device${u.activeSessions > 1 ? "s" : ""} signed in`
                          : `last sign-in ${ago(u.lastLoginAt)}`}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            {/* Tablet & desktop: table */}
            <div className="hidden overflow-x-auto border-t md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Devices
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Entries
                    </th>
                    <th className="px-3 py-2.5 font-medium">Joined</th>
                    <th className="px-5 py-2.5 font-medium">Last sign-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.items.map((u) => (
                    <tr
                      key={u.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() =>
                        navigate({
                          to: "/admin/users/$userId",
                          params: { userId: String(u.id) },
                        })
                      }
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="min-w-0">
                            <Link
                              to="/admin/users/$userId"
                              params={{ userId: String(u.id) }}
                              className="block max-w-48 truncate font-medium hover:underline"
                            >
                              {u.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              @{u.username}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-56 truncate px-3 py-3 text-muted-foreground">
                        {u.email}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex gap-1">
                          <RoleBadge role={u.role} always />
                          <StatusBadge status={u.status} />
                        </span>
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        {count(u.activeSessions)}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        {count(u.transactions)}
                      </td>
                      <td className="tabular px-3 py-3 whitespace-nowrap">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                        {ago(u.lastLoginAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={pages} onPage={setPage} />
          </>
        )}
      </SectionCard>
      <CreateUserSheet open={!!create} onClose={() => setCreating(false)} />
    </div>
  );
}

const EMPTY: NewUser = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "user",
};

function CreateUserSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<NewUser>(EMPTY);
  const create = useCreateUser();
  const username = normalizeUsername(form.username);
  const close = () => {
    setForm(EMPTY);
    onClose();
  };
  const valid =
    form.name.trim().length >= 2 &&
    form.email.includes("@") &&
    !usernameProblem(username) &&
    form.password.length >= 8;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Create user"
      description="They can sign in straight away with this email or username and password."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          create.mutate(
            { ...form, name: form.name.trim(), username },
            { onSuccess: close },
          );
        }}
      >
        <Field label="Full name" htmlFor="new-user-name">
          <Input
            id="new-user-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Riya Sharma"
            className="h-11"
          />
        </Field>
        <UsernameField
          id="new-user-username"
          value={form.username}
          onChange={(v) => setForm({ ...form, username: v })}
        />
        <Field label="Email" htmlFor="new-user-email">
          <Input
            id="new-user-email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="riya@example.com"
            className="h-11"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="new-user-password"
          hint="At least 8 characters. Ask them to change it in Settings."
        >
          <PasswordInput
            id="new-user-password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <Segmented
            className="w-full"
            value={form.role ?? "user"}
            onChange={(role) => setForm({ ...form, role })}
            options={[
              { value: "user", label: "User" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!valid || create.isPending}
        >
          <UserPlus /> Create user
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
