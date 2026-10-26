import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
  Ban,
  KeyRound,
  MonitorSmartphone,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  actionText,
  ago,
  count,
  DeviceIcon,
  SessionItem,
  UserLink,
} from "@/components/admin/admin-common";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { Progress } from "@/components/common/progress";
import { Segmented } from "@/components/common/segmented";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  type AdminOverview,
  useAdminActivity,
  useAdminOverview,
  useAdminSessions,
} from "@/hooks/use-admin";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const overview = useAdminOverview();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin overview"
        description="Everyone using the app, at a glance. Counts only, never anyone's amounts."
        actions={
          <Button asChild>
            <Link to="/admin/users" search={{ create: true }}>
              <UserPlus /> Create user
            </Link>
          </Button>
        }
      />
      {overview.isLoading ? (
        <PageLoader />
      ) : !overview.data ? (
        <ErrorState error={overview.error} />
      ) : (
        <Overview data={overview.data} />
      )}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <RecentSessions />
        <RecentActivity />
      </div>
    </div>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const { users, sessions, transactions, devices } = data;
  const [series, setSeries] = useState<"count" | "signins">("count");
  const totalDevices =
    devices.kinds.desktop +
    devices.kinds.mobile +
    devices.kinds.tablet +
    devices.kinds.unknown;
  const last30 = data.signups.reduce((n, d) => n + d[series], 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={users.total}
          display={count(users.total)}
          icon={<Users />}
        />
        <StatCard
          label="Signed in now"
          value={sessions.activeUsers}
          display={count(sessions.activeUsers)}
          tone="income"
          icon={<KeyRound />}
        />
        <StatCard
          label="Active sessions"
          value={sessions.active}
          display={count(sessions.active)}
          icon={<MonitorSmartphone />}
        />
        <StatCard
          label="Suspended"
          value={users.suspended}
          display={count(users.suspended)}
          tone={users.suspended ? "expense" : "neutral"}
          icon={<Ban />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <SectionCard
          className="lg:col-span-3"
          title="Last 30 days"
          action={
            <Segmented
              size="sm"
              value={series}
              onChange={setSeries}
              options={[
                { value: "count", label: "Sign-ups" },
                { value: "signins", label: "Sign-ins" },
              ]}
            />
          }
        >
          <p className="-mt-2 mb-3 text-sm text-muted-foreground">
            {count(last30)} {series === "count" ? "new accounts" : "sign-ins"}
          </p>
          <DayChart data={data.signups} series={series} />
        </SectionCard>
        <SectionCard className="lg:col-span-2" title="Signed-in devices">
          {!totalDevices ? (
            <p className="text-sm text-muted-foreground">No live sessions.</p>
          ) : (
            <div className="space-y-5">
              <ul className="space-y-3">
                {(
                  [
                    ["desktop", "Computers"],
                    ["mobile", "Phones"],
                    ["tablet", "Tablets"],
                    ["unknown", "Other"],
                  ] as const
                )
                  .filter(([k]) => devices.kinds[k] > 0)
                  .map(([k, label]) => (
                    <li key={k} className="flex items-center gap-3">
                      <DeviceIcon kind={k} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{label}</span>
                          <span className="tabular font-semibold">
                            {count(devices.kinds[k])}
                          </span>
                        </div>
                        <Progress
                          value={devices.kinds[k]}
                          max={totalDevices}
                          barClassName="bg-primary"
                        />
                      </div>
                    </li>
                  ))}
              </ul>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Breakdown title="Browsers" rows={devices.browsers} />
                <Breakdown title="Systems" rows={devices.os} />
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Details">
        <dl className="grid gap-x-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Joined today", users.today],
            ["Joined this week", users.last7],
            ["Joined in the last 30 days", users.last30],
            ["Admins", users.admins],
            ["Transactions", transactions.total],
            ["Transactions this week", transactions.last7],
            ["Splits", data.splits],
          ].map(([label, n]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b py-2.5"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular font-semibold">{count(Number(n))}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; n: number }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between gap-2">
            <span className="truncate">{r.key}</span>
            <span className="tabular font-medium">{count(r.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayChart({
  data,
  series,
}: {
  data: AdminOverview["signups"];
  series: "count" | "signins";
}) {
  const label = series === "count" ? "sign-ups" : "sign-ins";
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
            content={({ active, payload, label: day }) =>
              active && payload?.length ? (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold">
                    {format(parseISO(String(day)), "EEE, d MMM yyyy")}
                  </p>
                  <p className="text-muted-foreground">
                    {count(Number(payload[0]?.value ?? 0))} {label}
                  </p>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey={series}
            fill="var(--primary)"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecentSessions() {
  const { data, isLoading, error } = useAdminSessions("", 1);
  return (
    <SectionCard
      className="overflow-hidden p-0 sm:p-0"
      title={
        <span className="block px-4 pt-4 sm:px-5 sm:pt-5">Recently active</span>
      }
      action={
        <Link
          to="/admin/sessions"
          className="px-4 pt-4 text-sm font-medium text-primary hover:underline sm:px-5 sm:pt-5"
        >
          All sessions
        </Link>
      }
    >
      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <div className="p-4">
          <ErrorState error={error} />
        </div>
      ) : !data.items.length ? (
        <EmptyState className="m-4" title="Nobody is signed in" />
      ) : (
        <ul className="divide-y border-t">
          {data.items.slice(0, 6).map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              owner={
                <p className="truncate text-xs">
                  <UserLink
                    id={s.user.id}
                    name={s.user.name}
                    username={s.user.username}
                  />
                </p>
              }
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RecentActivity() {
  const { data, isLoading, error } = useAdminActivity(1);
  return (
    <SectionCard
      title="Admin activity"
      action={
        <Link
          to="/admin/activity"
          className="text-sm font-medium text-primary hover:underline"
        >
          Full log
        </Link>
      }
    >
      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <ErrorState error={error} />
      ) : !data.items.length ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Sign-outs, suspensions and role changes show up here.
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {data.items.slice(0, 6).map((a) => (
            <li key={a.id}>
              <p>
                <UserLink
                  id={a.adminId}
                  name={a.adminName}
                  username={a.adminUsername}
                />{" "}
                {actionText(a)} for{" "}
                <UserLink
                  id={a.targetId}
                  name={a.targetName}
                  username={a.targetUsername}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {ago(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
