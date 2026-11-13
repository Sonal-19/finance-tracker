import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  count,
  Pager,
  RequirePermission,
  RoleBadge,
  SearchBox,
  SessionItem,
  UserLink,
  useSearchText,
} from "@/components/admin/admin-common";
import { SectionCard } from "@/components/app/section-card";
import { PageHeader } from "@/components/common/page-header";
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Spinner,
} from "@/components/common/states";
import { useAdminCan, useAdminSessions } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_admin/admin/sessions")({
  component: AdminSessionsPage,
});

function AdminSessionsPage() {
  return (
    <RequirePermission permission="sessions.view">
      <SessionList />
    </RequirePermission>
  );
}

function SessionList() {
  const { user: me } = useAuth();
  const { master, can } = useAdminCan();
  const [page, setPage] = useState(1);
  const search = useSearchText(() => setPage(1));
  const { data, isLoading, isFetching, error } = useAdminSessions(
    search.q,
    page,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sessions & devices"
        description="Every device signed in right now, most recently active first. Sign any of them out."
      />
      <SectionCard className="overflow-hidden p-0 sm:p-0">
        <div className="flex items-center gap-3 p-4 sm:p-5">
          <SearchBox
            className="flex-1"
            value={search.text}
            onChange={search.setText}
            placeholder="Search user, device or IP"
          />
          {isFetching && !isLoading && <Spinner className="size-4" />}
        </div>
        {isLoading ? (
          <PageLoader />
        ) : !data ? (
          <div className="p-4">
            <ErrorState error={error} />
          </div>
        ) : !data.items.length ? (
          <EmptyState
            className="m-4"
            title={search.q ? "No sessions match" : "Nobody is signed in"}
          />
        ) : (
          <>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground sm:px-5">
              {count(data.total)} active{" "}
              {data.total === 1 ? "session" : "sessions"}
            </p>
            <ul className="divide-y border-t">
              {data.items.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  // Other admins' devices are the master's to sign out.
                  canRevoke={
                    can("sessions.revoke") &&
                    (master || s.user.role !== "admin" || s.user.id === me?.id)
                  }
                  owner={
                    <p className="flex min-w-0 items-center gap-1.5 text-xs">
                      <UserLink
                        id={s.user.id}
                        name={s.user.name}
                        username={s.user.username}
                      />
                      <span className="truncate text-muted-foreground">
                        {s.user.name}
                      </span>
                      <RoleBadge
                        role={s.user.role}
                        master={s.user.masterSince}
                      />
                    </p>
                  }
                />
              ))}
            </ul>
            <Pager page={page} pages={pages} onPage={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
