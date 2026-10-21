import { createFileRoute, Navigate } from "@tanstack/react-router";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
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
  type AdminOverview,
  type AdminUser,
  type NewUser,
  useAdminOverview,
  useAdminUsers,
  useCreateUser,
} from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { normalizeUsername, usernameProblem } from "@/lib/username";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

const count = (n: number) => n.toLocaleString("en-IN");

function AdminPage() {
  const { user, isConfirmed } = useAuth();
  const overview = useAdminOverview();
  const [creating, setCreating] = useState(false);

  // Wait for the server's answer: the cached profile can predate a promotion.
  if (isConfirmed && user?.role !== "admin")
    return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin dashboard"
        description="Everyone using the app, at a glance. Counts only, never anyone's amounts."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus /> Create user
          </Button>
        }
      />
      {overview.isLoading ? (
        <PageLoader />
      ) : overview.error || !overview.data ? (
        <ErrorState error={overview.error} />
      ) : (
        <Overview data={overview.data} />
      )}
      <UserList />
      <CreateUserSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const { users, sessions, transactions } = data;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={users.total}
          display={count(users.total)}
          icon={<Users />}
        />
        <StatCard
          label="New this week"
          value={users.last7}
          display={count(users.last7)}
          tone="income"
          icon={<UserPlus />}
        />
        <StatCard
          label="Signed in now"
          value={sessions.activeUsers}
          display={count(sessions.activeUsers)}
          icon={<KeyRound />}
        />
        <StatCard
          label="Transactions"
          value={transactions.total}
          display={count(transactions.total)}
          icon={<ArrowLeftRight />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <SectionCard
          className="lg:col-span-3"
          title="Sign-ups, last 30 days"
          action={
            <span className="text-sm text-muted-foreground">
              {count(users.last30)} total
            </span>
          }
        >
          <SignupChart data={data.signups} />
        </SectionCard>
        <SectionCard className="lg:col-span-2" title="Details">
          <dl className="divide-y text-sm">
            {[
              ["Joined today", users.today],
              ["Joined in the last 30 days", users.last30],
              ["Admins", users.admins],
              ["Active sessions", sessions.active],
              ["Transactions this week", transactions.last7],
              ["Splits", data.splits],
            ].map(([label, n]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular font-semibold">{count(Number(n))}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </>
  );
}

function SignupChart({ data }: { data: AdminOverview["signups"] }) {
  return (
    <div className="-ml-2 h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(d: string) => format(parseISO(d), "d MMM")}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={32}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold">
                    {format(parseISO(String(label)), "EEE, d MMM yyyy")}
                  </p>
                  <p className="text-muted-foreground">
                    {count(Number(payload[0]?.value ?? 0))} sign-ups
                  </p>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="count"
            name="Sign-ups"
            fill="var(--primary)"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UserList() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isLoading, isFetching, error } = useAdminUsers(q, page);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <SectionCard
      className="overflow-hidden p-0 sm:p-0"
      title={
        <span className="flex items-center gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
          Users
          {isFetching && !isLoading && <Spinner className="size-4" />}
        </span>
      }
      action={
        data && (
          <span className="px-4 pt-4 text-sm text-muted-foreground sm:px-5 sm:pt-5">
            {count(data.total)}
          </span>
        )
      }
    >
      <div className="relative mx-4 mb-3 sm:mx-5">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search name, email or username"
          aria-label="Search users"
          className="h-11 pl-9 md:h-9"
        />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : error || !data ? (
        <div className="p-4">
          <ErrorState error={error} />
        </div>
      ) : !data.items.length ? (
        <EmptyState className="m-4" title="No users match" />
      ) : (
        <>
          {/* Phones: one card per user */}
          <ul className="divide-y border-t md:hidden">
            {data.items.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{u.name}</span>
                    <RoleBadge role={u.role} />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username} · {u.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Joined {formatDate(u.createdAt)} · {lastSeen(u)}
                  </p>
                </div>
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
                    Entries
                  </th>
                  <th className="px-3 py-2.5 font-medium">Joined</th>
                  <th className="px-5 py-2.5 font-medium">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <div className="min-w-0">
                          <p className="max-w-48 truncate font-medium">
                            {u.name}
                          </p>
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
                      <RoleBadge role={u.role} always />
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {count(u.transactions)}
                    </td>
                    <td className="tabular px-3 py-3 whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {lastSeen(u)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
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
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

const lastSeen = (u: AdminUser) =>
  u.lastLoginAt
    ? `signed in ${formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true })}`
    : "never signed in";

function RoleBadge({
  role,
  always,
}: {
  role: AdminUser["role"];
  always?: boolean;
}) {
  if (role !== "admin" && !always) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
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
