import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import {
  ActionLine,
  ago,
  Pager,
  RequirePermission,
} from "@/components/admin/admin-common";
import { SectionCard } from "@/components/app/section-card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import { useAdminActivity } from "@/hooks/use-admin";

export const Route = createFileRoute("/_admin/admin/activity")({
  component: AdminActivityPage,
});

function AdminActivityPage() {
  return (
    <RequirePermission permission="activity.view">
      <ActivityLog />
    </RequirePermission>
  );
}

function ActivityLog() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAdminActivity(page);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity log"
        description="What admins did to accounts: created, signed out, suspended, role and password changes."
      />
      <SectionCard className="overflow-hidden p-0 sm:p-0">
        {isLoading ? (
          <PageLoader />
        ) : !data ? (
          <div className="p-4">
            <ErrorState error={error} />
          </div>
        ) : !data.items.length ? (
          <EmptyState className="m-4" title="No admin activity yet" />
        ) : (
          <>
            <ul className="divide-y">
              {data.items.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                >
                  <ActionLine a={a} />
                  <time
                    dateTime={String(a.createdAt)}
                    title={format(new Date(a.createdAt), "d MMM yyyy, h:mm a")}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {ago(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
            <Pager page={page} pages={pages} onPage={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
